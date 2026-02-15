"""
Quota Enforcer - Lambda concurrency throttle for hobby tier enforcement.

When a hobby-tier org exceeds their included requests (3K/month) or compute
(1.2K GB-s/month), this module disables all their Lambda functions by setting
ReservedConcurrentExecutions=0. This is the AWS-native equivalent of what
Vercel/Railway/Render do (suspend/pause services on free tier limit).

Functions are restored when the user upgrades or the billing period resets.
"""
import os
from typing import List, Optional

import boto3
import httpx

from api.db.dynamodb import (
    list_projects,
    get_throttle_state,
    set_throttle_state,
    clear_throttle_state,
)
from deployer.aws.lambda_service import get_lambda_function_name

lambda_client = boto3.client("lambda")

AUTUMN_BASE_URL = os.environ.get(
    "AUTUMN_BASE_URL", "https://api.useautumn.com/v1"
).rstrip("/")


def _get_org_lambda_functions(org_id: str) -> List[str]:
    """Get all Lambda function names for an org's LIVE projects."""
    projects = list_projects(org_id)
    function_names = []
    for project in projects:
        if project.get("status") != "LIVE":
            continue
        fn = project.get("function_name")
        if fn:
            function_names.append(get_lambda_function_name(fn))
    return function_names


def throttle_org(org_id: str, reason: str) -> bool:
    """
    Disable all Lambda functions for an org by setting concurrency to 0.

    Returns True if throttling was applied, False on total failure.
    """
    existing = get_throttle_state(org_id)
    if existing and existing.get("is_throttled"):
        print(f"ORG {org_id} already throttled, skipping")
        return True

    function_names = _get_org_lambda_functions(org_id)
    if not function_names:
        print(f"ORG {org_id} has no LIVE functions to throttle")
        return True

    throttled = []
    for fn_name in function_names:
        try:
            lambda_client.put_function_concurrency(
                FunctionName=fn_name,
                ReservedConcurrentExecutions=0,
            )
            throttled.append(fn_name)
            print(f"  THROTTLED: {fn_name}")
        except Exception as e:
            print(f"  Failed to throttle {fn_name}: {e}")

    if throttled:
        set_throttle_state(org_id, reason, throttled)
        print(f"ORG {org_id} throttled: {len(throttled)} functions ({reason})")

    return len(throttled) > 0


def unthrottle_org(org_id: str) -> bool:
    """
    Restore all Lambda functions for an org by removing reserved concurrency.

    Returns True if unthrottling succeeded.
    """
    state = get_throttle_state(org_id)
    if not state or not state.get("is_throttled"):
        return True

    # Unthrottle both the originally throttled functions and any new ones
    throttled_functions = state.get("throttled_functions", [])
    current_functions = _get_org_lambda_functions(org_id)
    all_functions = list(set(throttled_functions + current_functions))

    for fn_name in all_functions:
        try:
            lambda_client.delete_function_concurrency(FunctionName=fn_name)
            print(f"  UNTHROTTLED: {fn_name}")
        except lambda_client.exceptions.ResourceNotFoundException:
            print(f"  Function not found (may have been deleted): {fn_name}")
        except Exception as e:
            print(f"  Failed to unthrottle {fn_name}: {e}")

    clear_throttle_state(org_id)
    print(f"ORG {org_id} unthrottled")
    return True


def check_and_enforce_quota(org_id: str) -> Optional[str]:
    """
    Check Autumn for the org's feature balance and enforce throttling if needed.

    Only applies to hobby orgs (those without usd_credits / credit system).

    Returns:
        None if no action taken
        "throttled" if newly throttled
        "already_throttled" if was already throttled
        "unthrottled" if org was restored (upgraded or period reset)
    """
    autumn_key = os.environ.get("AUTUMN_API_KEY")
    if not autumn_key:
        return None

    try:
        resp = httpx.get(
            f"{AUTUMN_BASE_URL}/customers/{org_id}",
            headers={"Authorization": f"Bearer {autumn_key}"},
            timeout=15.0,
        )
        if resp.status_code >= 400:
            print(f"Autumn customer fetch failed for {org_id}: {resp.status_code}")
            return None
        customer = resp.json()
    except Exception as e:
        print(f"Autumn customer fetch exception for {org_id}: {e}")
        return None

    features = customer.get("features") or {}

    # Determine if this is a hobby org (no credit system = hobby)
    # Same logic as projects.py:365-367
    usd_credits = features.get("usd_credits") or {}
    credits_included = usd_credits.get("included_usage")
    is_paid = credits_included is not None and credits_included > 0

    if is_paid:
        # Paid org — if it was previously throttled (just upgraded), unthrottle
        existing = get_throttle_state(org_id)
        if existing and existing.get("is_throttled"):
            unthrottle_org(org_id)
            print(f"ORG {org_id} upgraded to paid plan, unthrottled")
            return "unthrottled"
        return None

    # Hobby org — check invocations and compute balance
    inv = features.get("invocations") or {}
    comp = features.get("compute") or {}

    inv_balance = inv.get("balance")
    comp_balance = comp.get("balance")

    # Balance <= 0 means quota exceeded (Autumn decrements from included_usage)
    inv_exceeded = inv_balance is not None and inv_balance <= 0
    comp_exceeded = comp_balance is not None and comp_balance <= 0

    if inv_exceeded or comp_exceeded:
        reason_parts = []
        if inv_exceeded:
            reason_parts.append("invocations_exceeded")
        if comp_exceeded:
            reason_parts.append("compute_exceeded")
        reason = "+".join(reason_parts)

        existing = get_throttle_state(org_id)
        if existing and existing.get("is_throttled"):
            return "already_throttled"

        throttle_org(org_id, reason)
        return "throttled"

    # Under quota — if previously throttled (e.g., period reset), unthrottle
    existing = get_throttle_state(org_id)
    if existing and existing.get("is_throttled"):
        unthrottle_org(org_id)
        print(f"ORG {org_id} back under quota, unthrottled")
        return "unthrottled"

    return None
