"""
Lambda Warming Service

Keeps user-deployed Lambda functions warm to avoid cold starts.
Only warms projects belonging to paid orgs (Pro/Plus plans).

Two modes:
1. Scheduled warming (every 5 min via EventBridge): pings all LIVE paid projects
2. Post-deploy warming: pings a newly deployed function immediately (paid orgs only)
"""

import os
import time
from datetime import datetime
from typing import Dict, List

from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx

from api.db.dynamodb import get_throttle_state
from api.usage_aggregator import get_all_projects


# Configuration
WARM_TIMEOUT_SECONDS = 10.0
WARM_CONCURRENCY = 10
POST_DEPLOY_WARM_COUNT = 3
POST_DEPLOY_WARM_DELAY = 1.0
AUTUMN_BASE_URL = os.environ.get("AUTUMN_BASE_URL", "https://api.useautumn.com/v1")


def _is_paid_org(org_id: str) -> bool:
    """
    Check if an org is on a paid plan (Pro/Plus) via Autumn API.

    Paid orgs have features.usd_credits.included_usage > 0.
    Returns False for Hobby orgs or if Autumn is unavailable.
    """
    autumn_key = os.environ.get("AUTUMN_API_KEY")
    if not autumn_key:
        return False

    try:
        resp = httpx.get(
            f"{AUTUMN_BASE_URL}/customers/{org_id}",
            headers={"Authorization": f"Bearer {autumn_key}"},
            timeout=10.0,
        )
        if resp.status_code >= 400:
            return False
        customer = resp.json()
    except Exception:
        return False

    features = customer.get("features") or {}
    usd_credits = features.get("usd_credits") or {}
    credits_included = usd_credits.get("included_usage")
    return credits_included is not None and credits_included > 0


def _ping_function_url(function_url: str, timeout: float = WARM_TIMEOUT_SECONDS) -> dict:
    """
    Send an HTTP GET to a Lambda function URL to warm it.

    Returns:
        Dict with 'url', 'status_code', 'latency_ms', and 'error' (if any)
    """
    start = time.monotonic()
    try:
        resp = httpx.get(function_url, timeout=timeout, follow_redirects=True)
        latency_ms = (time.monotonic() - start) * 1000
        return {
            "url": function_url,
            "status_code": resp.status_code,
            "latency_ms": round(latency_ms, 1),
            "error": None,
        }
    except Exception as e:
        latency_ms = (time.monotonic() - start) * 1000
        return {
            "url": function_url,
            "status_code": None,
            "latency_ms": round(latency_ms, 1),
            "error": str(e),
        }


def _get_live_project_urls() -> List[Dict]:
    """
    Scan DynamoDB for all LIVE projects on paid plans (Pro/Plus) with a function_url.
    Skips Hobby orgs and throttled orgs.

    Returns:
        List of dicts with 'project_id', 'function_url', 'organization_id', 'name'
    """
    projects = get_all_projects()
    result = []
    # Cache org checks so we only call Autumn once per org
    org_paid_cache: Dict[str, bool] = {}
    org_throttle_cache: Dict[str, bool] = {}
    skipped_hobby = 0

    for project in projects:
        if project.get("status") != "LIVE":
            continue

        function_url = project.get("function_url")
        if not function_url:
            continue

        org_id = project.get("organization_id")
        if not org_id:
            continue

        # Check if org is on a paid plan (cached per org)
        if org_id not in org_paid_cache:
            org_paid_cache[org_id] = _is_paid_org(org_id)

        if not org_paid_cache[org_id]:
            skipped_hobby += 1
            continue

        # Check throttle state (cached per org)
        if org_id not in org_throttle_cache:
            throttle_state = get_throttle_state(org_id)
            org_throttle_cache[org_id] = bool(
                throttle_state and throttle_state.get("is_throttled")
            )

        if org_throttle_cache[org_id]:
            continue

        result.append({
            "project_id": project.get("project_id"),
            "function_url": function_url,
            "organization_id": org_id,
            "name": project.get("name", "unknown"),
        })

    if skipped_hobby:
        print(f"   Skipped {skipped_hobby} Hobby project(s) (warming is a paid feature)")

    return result


def warm_all_lambdas() -> dict:
    """
    Main warming function - called by EventBridge every 5 minutes.

    Only pings LIVE projects belonging to paid orgs (Pro/Plus).

    Returns:
        Summary dict with counts and timing.
    """
    print(f"🔥 Starting Lambda warming at {datetime.utcnow().isoformat()}")

    targets = _get_live_project_urls()
    print(f"   Found {len(targets)} paid LIVE projects to warm")

    if not targets:
        print("   No projects to warm")
        return {"warmed": 0, "failed": 0}

    warmed = 0
    failed = 0
    results = []

    with ThreadPoolExecutor(max_workers=WARM_CONCURRENCY) as executor:
        future_to_target = {
            executor.submit(_ping_function_url, t["function_url"]): t
            for t in targets
        }

        for future in as_completed(future_to_target):
            target = future_to_target[future]
            result = future.result()

            if result["error"]:
                failed += 1
                print(f"   FAIL {target['name']}: {result['error']} ({result['latency_ms']}ms)")
            else:
                warmed += 1
                print(f"   WARM {target['name']}: {result['status_code']} ({result['latency_ms']}ms)")

            results.append(result)

    avg_latency = (
        sum(r["latency_ms"] for r in results) / len(results)
        if results
        else 0
    )

    print(f"   Warming complete: {warmed} warmed, {failed} failed, avg latency {avg_latency:.0f}ms")

    return {"warmed": warmed, "failed": failed, "avg_latency_ms": round(avg_latency)}


def warm_single_function(function_url: str, org_id: str, count: int = POST_DEPLOY_WARM_COUNT) -> None:
    """
    Warm a single Lambda function URL multiple times after deployment.
    Only warms if the org is on a paid plan (Pro/Plus).

    Args:
        function_url: The function URL to warm
        org_id: The organization ID (to check plan)
        count: Number of pings to send
    """
    if not _is_paid_org(org_id):
        print(f"   Skipping post-deploy warming (Hobby plan)")
        return

    print(f"🔥 Post-deploy warming: {function_url} ({count} pings)")

    for i in range(count):
        result = _ping_function_url(function_url)
        if result["error"]:
            print(f"   Ping {i + 1}/{count}: FAIL - {result['error']}")
        else:
            print(f"   Ping {i + 1}/{count}: {result['status_code']} ({result['latency_ms']}ms)")

        if i < count - 1:
            time.sleep(POST_DEPLOY_WARM_DELAY)
