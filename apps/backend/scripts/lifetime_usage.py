#!/usr/bin/env python3
"""
Lifetime Usage Calculator

Calculates total function invocations and total GB-seconds across ALL
shorlabs Lambda functions — including deleted ones — by discovering
functions directly from CloudWatch metrics (not DynamoDB).

CloudWatch retains metric data even after a Lambda function is deleted
(up to 15 months at hourly resolution).

Uses:
  - CloudWatch list_metrics to discover ALL shorlabs-* functions that ever ran
  - CloudWatch get_metric_statistics for Invocations and Duration
  - DynamoDB as optional enrichment (memory config, org, status)
  - Falls back to 1024 MB for deleted functions with no DB record

Usage:
  python scripts/lifetime_usage.py                     # defaults: since 2025-01-01
  python scripts/lifetime_usage.py --since 2025-06-01  # custom start date
  python scripts/lifetime_usage.py --csv               # output CSV for spreadsheets
"""

import argparse
import sys
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

import boto3

# ── Config ────────────────────────────────────────────────────────────
LAMBDA_FUNCTION_PREFIX = "shorlabs-"
PROJECTS_TABLE = "shorlabs-projects"
DEFAULT_MEMORY_MB = 1024
CW_PERIOD = 86400  # 1 day — fits well within the 1440 datapoint limit

cloudwatch = boto3.client("cloudwatch")
dynamodb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")


# ── CloudWatch discovery ──────────────────────────────────────────────

def discover_all_functions_from_cloudwatch() -> Set[str]:
    """
    Use CloudWatch list_metrics to find every function name that has ever
    emitted Invocations under the AWS/Lambda namespace with the shorlabs- prefix.

    This catches deleted functions that no longer exist in DynamoDB or Lambda.
    """
    function_names: Set[str] = set()

    paginator = cloudwatch.get_paginator("list_metrics")
    page_iter = paginator.paginate(
        Namespace="AWS/Lambda",
        MetricName="Invocations",
        Dimensions=[{"Name": "FunctionName"}],
    )

    for page in page_iter:
        for metric in page.get("Metrics", []):
            for dim in metric.get("Dimensions", []):
                if dim["Name"] == "FunctionName" and dim["Value"].startswith(LAMBDA_FUNCTION_PREFIX):
                    function_names.add(dim["Value"])

    return function_names


# ── DynamoDB enrichment ───────────────────────────────────────────────

def get_all_projects() -> List[Dict]:
    """Scan DynamoDB for all projects (for memory/org enrichment)."""
    table = dynamodb.Table(PROJECTS_TABLE)
    items = []
    kwargs = {
        "FilterExpression": "begins_with(SK, :prefix)",
        "ExpressionAttributeValues": {":prefix": "PROJECT#"},
    }
    while True:
        resp = table.scan(**kwargs)
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items


def build_project_lookup(projects: List[Dict]) -> Dict[str, Dict]:
    """
    Build a lookup: lambda_function_name → project metadata.
    Handles both stored function_name and github_url fallback.
    """
    lookup = {}
    for project in projects:
        stored_fn = project.get("function_name")
        if stored_fn:
            full_name = f"{LAMBDA_FUNCTION_PREFIX}{stored_fn}"
            lookup[full_name] = project
        # Also index by github repo name as fallback
        github_url = project.get("github_url", "")
        if github_url:
            repo_name = github_url.rstrip("/").split("/")[-1]
            if repo_name:
                alt_name = f"{LAMBDA_FUNCTION_PREFIX}{repo_name}"
                if alt_name not in lookup:
                    lookup[alt_name] = project
    return lookup


# ── CloudWatch metrics ────────────────────────────────────────────────

def get_metric_sum(
    function_name: str,
    metric_name: str,
    start_time: datetime,
    end_time: datetime,
) -> float:
    """Get the Sum of a CloudWatch metric across the full time range."""
    try:
        resp = cloudwatch.get_metric_statistics(
            Namespace="AWS/Lambda",
            MetricName=metric_name,
            Dimensions=[{"Name": "FunctionName", "Value": function_name}],
            StartTime=start_time,
            EndTime=end_time,
            Period=CW_PERIOD,
            Statistics=["Sum"],
        )
        datapoints = resp.get("Datapoints", [])
        return sum(dp.get("Sum", 0.0) for dp in datapoints)
    except Exception as e:
        print(f"  ⚠ CloudWatch error for {function_name}/{metric_name}: {e}")
        return 0.0


def get_function_memory(function_name: str) -> Optional[int]:
    """Try to get current memory config from live Lambda function."""
    try:
        resp = lambda_client.get_function_configuration(FunctionName=function_name)
        return resp.get("MemorySize", DEFAULT_MEMORY_MB)
    except Exception:
        return None


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Calculate lifetime Lambda usage for Shorlabs")
    parser.add_argument(
        "--since",
        type=str,
        default="2025-01-01",
        help="Start date (YYYY-MM-DD). Default: 2025-01-01",
    )
    parser.add_argument(
        "--csv",
        action="store_true",
        help="Output results as CSV",
    )
    args = parser.parse_args()

    start_time = datetime.strptime(args.since, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_time = datetime.now(timezone.utc)

    print(f"{'='*70}")
    print(f"  Shorlabs — Lifetime Usage Report (CloudWatch-based)")
    print(f"  Period: {start_time.strftime('%Y-%m-%d')} → {end_time.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"  Includes deleted functions")
    print(f"{'='*70}")
    print()

    # ── Step 1: Discover ALL shorlabs-* functions from CloudWatch ──
    print("Discovering functions from CloudWatch metrics...")
    cw_functions = discover_all_functions_from_cloudwatch()
    print(f"Found {len(cw_functions)} functions in CloudWatch\n")

    # ── Step 2: Load DynamoDB projects for enrichment ─────────────
    print("Loading DynamoDB projects for enrichment...")
    projects = get_all_projects()
    project_lookup = build_project_lookup(projects)
    print(f"Found {len(projects)} projects in DynamoDB")
    print(f"Matched {len(set(cw_functions) & set(project_lookup.keys()))} to DB records")
    print(f"Deleted/orphaned functions: {len(cw_functions - set(project_lookup.keys()))}")
    print()

    # ── Step 3: Query metrics for every discovered function ───────
    results = []
    grand_invocations = 0
    grand_gb_seconds = 0.0

    for function_name in sorted(cw_functions):
        # Enrichment from DynamoDB
        db_record = project_lookup.get(function_name)
        if db_record:
            org_id = db_record.get("organization_id", "?")
            project_id = db_record.get("project_id", "?")
            status = db_record.get("status", "UNKNOWN")
            memory_mb = int(db_record.get("memory", DEFAULT_MEMORY_MB))
        else:
            org_id = "DELETED"
            project_id = "DELETED"
            status = "DELETED"
            # Try live Lambda for memory, fall back to default
            live_mem = get_function_memory(function_name)
            memory_mb = live_mem if live_mem else DEFAULT_MEMORY_MB

        label = f"[{status:>8}]"
        print(f"  {label} {function_name} ({memory_mb} MB)  ", end="", flush=True)

        # Query CloudWatch
        invocations = get_metric_sum(function_name, "Invocations", start_time, end_time)
        duration_ms = get_metric_sum(function_name, "Duration", start_time, end_time)

        # GB-Seconds = (duration_ms / 1000) * (memory_mb / 1024)
        duration_s = duration_ms / 1000.0
        memory_gb = memory_mb / 1024.0
        gb_seconds = duration_s * memory_gb

        inv_int = int(invocations)
        grand_invocations += inv_int
        grand_gb_seconds += gb_seconds

        print(f"→ {inv_int:,} invocations, {gb_seconds:,.2f} GB-s")

        results.append({
            "project_id": project_id,
            "org_id": org_id,
            "function_name": function_name,
            "status": status,
            "memory_mb": memory_mb,
            "invocations": inv_int,
            "duration_s": round(duration_s, 2),
            "gb_seconds": round(gb_seconds, 2),
        })

    # ── Summary ───────────────────────────────────────────────────
    live_count = sum(1 for r in results if r["status"] != "DELETED")
    deleted_count = sum(1 for r in results if r["status"] == "DELETED")
    deleted_invocations = sum(r["invocations"] for r in results if r["status"] == "DELETED")
    deleted_gb = sum(r["gb_seconds"] for r in results if r["status"] == "DELETED")

    print()
    print(f"{'='*70}")
    print(f"  TOTALS (all functions, including deleted)")
    print(f"{'='*70}")
    print(f"  Total Function Invocations:  {grand_invocations:>14,}")
    print(f"  Total GB-Seconds:            {grand_gb_seconds:>14,.2f}")
    print(f"{'='*70}")
    print(f"  Functions in CloudWatch:   {len(cw_functions):>6}")
    print(f"    Live (in DynamoDB):      {live_count:>6}")
    print(f"    Deleted/orphaned:        {deleted_count:>6}")
    print()
    if deleted_count > 0:
        print(f"  From deleted functions alone:")
        print(f"    Invocations:  {deleted_invocations:>14,}")
        print(f"    GB-Seconds:   {deleted_gb:>14,.2f}")
        print()

    # ── Per-org breakdown ─────────────────────────────────────────
    orgs: Dict[str, Dict] = {}
    for r in results:
        oid = r["org_id"]
        if oid not in orgs:
            orgs[oid] = {"invocations": 0, "gb_seconds": 0.0, "projects": 0}
        orgs[oid]["invocations"] += r["invocations"]
        orgs[oid]["gb_seconds"] += r["gb_seconds"]
        orgs[oid]["projects"] += 1

    print("  Per-Organization Breakdown:")
    print(f"  {'Org ID':<44} {'Funcs':>5} {'Invocations':>14} {'GB-Seconds':>14}")
    print(f"  {'-'*44} {'-'*5} {'-'*14} {'-'*14}")
    for oid, data in sorted(orgs.items(), key=lambda x: x[1]["invocations"], reverse=True):
        print(
            f"  {oid:<44} {data['projects']:>5} "
            f"{data['invocations']:>14,} {data['gb_seconds']:>14,.2f}"
        )
    print()

    # ── CSV output ────────────────────────────────────────────────
    if args.csv:
        print("--- CSV OUTPUT ---")
        print("project_id,org_id,function_name,status,memory_mb,invocations,duration_s,gb_seconds")
        for r in results:
            print(
                f"{r['project_id']},{r['org_id']},{r['function_name']},"
                f"{r['status']},{r['memory_mb']},{r['invocations']},"
                f"{r['duration_s']},{r['gb_seconds']}"
            )


if __name__ == "__main__":
    main()
