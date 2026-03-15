"""
Usage Metrics Aggregator - Scheduled service for CloudWatch → Autumn

This service runs hourly via EventBridge to:
1. Fetch CloudWatch metrics for all Lambda functions
2. Calculate incremental usage (requests + GB-Seconds)
3. Sync usage to Autumn (billing provider)

Autumn is the sole source of truth for usage and billing.
"""
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import boto3
import httpx
from boto3.dynamodb.conditions import Key

from api.db.dynamodb import (
    get_or_create_table,
    list_deployments,
)
from deployer import extract_project_name
from deployer.aws.lambda_service import get_lambda_function_name


# CloudWatch client
cloudwatch = boto3.client("cloudwatch")

AUTUMN_BASE_URL = os.environ.get("AUTUMN_BASE_URL", "https://api.useautumn.com/v1").rstrip("/")


def _get_aggregation_window_seconds() -> int:
    """
    Aggregation window size.

    - Default: 3600 (hourly)
    - For debugging: set AGGREGATION_WINDOW_SECONDS=60 and schedule every minute
    """
    try:
        value = int(os.environ.get("AGGREGATION_WINDOW_SECONDS", "3600"))
        # Keep within sane bounds
        return max(60, min(value, 24 * 60 * 60))
    except Exception:
        return 900

def _window_bucket_end(now: datetime, window_seconds: int) -> datetime:
    """
    Return a deterministic window end time for idempotency.

    Example:
      - window=3600 → end at the current hour boundary
      - window=60   → end at the current minute boundary
    """
    epoch = int(now.timestamp())
    bucket_end_epoch = (epoch // window_seconds) * window_seconds
    return datetime.utcfromtimestamp(bucket_end_epoch)


def _autumn_track_usage(
    *,
    customer_id: str,
    feature_id: str,
    value: float,
    idempotency_key: Optional[str] = None,
) -> None:
    """
    Record usage into Autumn using the documented /track endpoint.
    """
    autumn_key = os.environ.get("AUTUMN_API_KEY")
    if not autumn_key:
        # Don't fail the whole job if billing env var isn't set.
        print("⚠️ AUTUMN_API_KEY not set; skipping Autumn sync.")
        return

    url = f"{AUTUMN_BASE_URL}/track"
    payload = {
        "customer_id": customer_id,
        "feature_id": feature_id,
        "value": value,
    }
    if idempotency_key:
        # Use Autumn's idempotency key to avoid double-counting the same window.
        payload["idempotency_key"] = idempotency_key

    try:
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {autumn_key}"},
            json=payload,
            timeout=15.0,
        )
        if resp.status_code == 409:
            # Duplicate idempotency key / already recorded – safe to ignore.
            print(f"ℹ️ Autumn already has usage for org={customer_id} feature={feature_id}")
        elif resp.status_code >= 400:
            print(f"⚠️ Autumn track failed ({resp.status_code}): {resp.text}")
        else:
            print(f"💸 Autumn synced: org={customer_id} feature={feature_id} value={value}")
    except Exception as e:
        print(f"⚠️ Autumn track exception: {e}")


def get_cloudwatch_metric_sum(
    function_name: str,
    metric_name: str,
    start_time: datetime,
    end_time: datetime,
    period_seconds: int,
) -> float:
    """
    Get sum of a CloudWatch metric for a Lambda function over a time period.
    
    Args:
        function_name: Lambda function name
        metric_name: CloudWatch metric name (e.g., "Invocations", "Duration")
        start_time: Start of time range
        end_time: End of time range
        period_seconds: CloudWatch period in seconds
        
    Returns:
        Sum of metric values, or 0.0 if no data
    """
    try:
        response = cloudwatch.get_metric_statistics(
            Namespace="AWS/Lambda",
            MetricName=metric_name,
            Dimensions=[
                {
                    "Name": "FunctionName",
                    "Value": function_name,
                }
            ],
            StartTime=start_time,
            EndTime=end_time,
            Period=period_seconds,
            Statistics=["Sum"],
        )
        
        datapoints = response.get("Datapoints", [])
        if not datapoints:
            return 0.0
        
        # Sum all datapoint values
        total = sum(dp.get("Sum", 0.0) for dp in datapoints)
        return float(total)
        
    except Exception as e:
        print(f"Error fetching {metric_name} for {function_name}: {e}")
        return 0.0


def get_invocations(
    function_name: str,
    *,
    window_seconds: int,
    window_end: datetime,
) -> int:
    """Get number of invocations in the aggregation window."""
    # Use the deterministic window_end passed from the aggregator so repeated
    # runs for the same bucket look at exactly the same CloudWatch range.
    end_time = window_end
    start_time = end_time - timedelta(seconds=window_seconds)
    
    invocations = get_cloudwatch_metric_sum(
        function_name,
        "Invocations",
        start_time,
        end_time,
        window_seconds,
    )
    return int(invocations)


def get_gb_seconds(
    function_name: str,
    memory_mb: int,
    *,
    window_seconds: int,
    window_end: datetime,
) -> float:
    """
    Calculate GB-Seconds for a function in the aggregation window.
    
    GB-Seconds = (Duration_ms / 1000) * (Memory_MB / 1024) / 1000
    
    Note: CloudWatch Duration is in milliseconds, Memory is in MB.
    We convert to GB-Seconds for billing calculations.
    """
    # Use the deterministic window_end passed from the aggregator so repeated
    # runs for the same bucket look at exactly the same CloudWatch range.
    end_time = window_end
    start_time = end_time - timedelta(seconds=window_seconds)
    
    # Get total duration in milliseconds
    total_duration_ms = get_cloudwatch_metric_sum(
        function_name,
        "Duration",
        start_time,
        end_time,
        window_seconds,
    )
    
    if total_duration_ms == 0:
        return 0.0
    
    # Convert to GB-Seconds
    # Duration: ms → seconds (/ 1000)
    # Memory: MB → GB (/ 1024)
    # Result in GB-Seconds
    duration_seconds = total_duration_ms / 1000.0
    memory_gb = memory_mb / 1024.0
    gb_seconds = duration_seconds * memory_gb
    
    return gb_seconds


def _get_ecs_uptime_metrics(service: Dict, window_seconds: int) -> tuple:
    """
    Calculate wall-clock vCPU-seconds and GB-seconds for an ECS service.

    ECS services run on dedicated EC2 instances 24/7, so we bill for the
    full aggregation window (no CloudWatch calls needed).
    """
    cpu_units = int(service.get("cpu", 2048))
    memory_mb = int(service.get("memory", 1024))
    vcpu_seconds = (cpu_units / 1024.0) * window_seconds
    memory_gb_seconds = (memory_mb / 1024.0) * window_seconds
    return vcpu_seconds, memory_gb_seconds


def get_all_services() -> List[Dict]:
    """Get all web-app and web-service items from DynamoDB."""
    table = get_or_create_table()
    
    # Scan for service items only (not project containers)
    # In production with many users, use pagination
    response = table.scan(
        FilterExpression="entity_type = :et AND service_type IN (:st1, :st2)",
        ExpressionAttributeValues={
            ":et": "service",
            ":st1": "web-app",
            ":st2": "web-service",
        },
    )
    
    return response.get("Items", [])


def _get_build_seconds_for_service(
    service_id: str,
    *,
    window_seconds: int,
    window_end: datetime,
) -> float:
    """
    Calculate total build time in seconds for a service within the aggregation window.

    We derive build time from deployment records:
      - Each deployment has started_at / finished_at timestamps
      - We include deployments whose started_at falls inside the window
      - Duration is (finished_at - started_at) in seconds (or until window_end if unfinished)

    This gives us per-service build time that we can aggregate per organization and
    send to Autumn as a separate "build_seconds" feature.
    """
    deployments = list_deployments(service_id)
    if not deployments:
        return 0.0

    window_start = window_end - timedelta(seconds=window_seconds)
    total_seconds = 0.0

    for dep in deployments:
        started_at = dep.get("started_at")
        if not started_at:
            continue

        try:
            start_dt = datetime.fromisoformat(started_at)
        except Exception:
            # Ignore malformed timestamps
            continue

        # Only count deployments that started within this window bucket
        if not (window_start <= start_dt <= window_end):
            continue

        finished_at = dep.get("finished_at")
        if finished_at:
            try:
                end_dt = datetime.fromisoformat(finished_at)
            except Exception:
                end_dt = window_end
        else:
            # Ongoing deployment – count up to the end of the window
            end_dt = window_end

        # Guard against negative durations if timestamps are out of order
        duration_seconds = max(0.0, (end_dt - start_dt).total_seconds())
        total_seconds += duration_seconds

    return total_seconds


def aggregate_usage_metrics():
    """
    Main aggregation function - called by EventBridge hourly.
    
    Fetches CloudWatch metrics for all projects and syncs to Autumn.
    """
    print(f"🔄 Starting usage metrics aggregation at {datetime.utcnow().isoformat()}")
    
    # Get all web-app services
    services = get_all_services()
    print(f"📊 Found {len(services)} services to aggregate")
    
    if not services:
        print("✅ No services to aggregate")
        return
    
    # Group services by organization_id (orgs are the billing entity)
    orgs_services: Dict[str, List[Dict]] = {}
    for svc in services:
        org_id = svc.get("organization_id")
        if not org_id:
            continue
        if org_id not in orgs_services:
            orgs_services[org_id] = []
        orgs_services[org_id].append(svc)
    
    print(f"🏢 Aggregating for {len(orgs_services)} organizations")
    
    # Period label for logging only
    period = datetime.utcnow().strftime("%Y-%m")
    window_seconds = _get_aggregation_window_seconds()
    window_end = _window_bucket_end(datetime.utcnow(), window_seconds)
    window_key = window_end.strftime("%Y%m%dT%H%M%SZ")
    
    # Aggregate metrics for each organization
    total_requests = 0
    total_gb_seconds = 0.0
    total_build_seconds = 0.0
    total_vcpu_seconds = 0.0
    total_memory_seconds = 0.0

    for org_id, org_svcs in orgs_services.items():
        org_requests = 0
        org_gb_seconds = 0.0
        org_build_seconds = 0.0
        org_vcpu_seconds = 0.0
        org_memory_seconds = 0.0

        for svc in org_svcs:
            # Skip if service is not LIVE
            if svc.get("status") != "LIVE":
                continue

            service_type = svc.get("service_type", "web-app")

            if service_type == "web-app":
                # ── Lambda: fetch CloudWatch metrics ──────────────────
                # Get function name - prefer stored function_name, fallback to deriving from github_url
                # for backwards compatibility with services that don't have function_name stored
                stored_function_name = svc.get("function_name")
                if stored_function_name:
                    # Apply shorlabs- prefix to get full Lambda function name
                    function_name = get_lambda_function_name(stored_function_name)
                else:
                    # Fallback: derive from github_url and apply prefix
                    project_name = extract_project_name(svc.get("github_url", ""))
                    if not project_name:
                        continue
                    function_name = get_lambda_function_name(project_name)

                memory_mb = int(svc.get("memory", 1024))
                # Fetch metrics from CloudWatch
                try:
                    invocations = get_invocations(
                        function_name,
                        window_seconds=window_seconds,
                        window_end=window_end,
                    )
                    gb_seconds = get_gb_seconds(
                        function_name,
                        memory_mb,
                        window_seconds=window_seconds,
                        window_end=window_end,
                    )

                    # Deployment/build time (seconds) from deployments table
                    build_seconds = _get_build_seconds_for_service(
                        svc.get("service_id"),
                        window_seconds=window_seconds,
                        window_end=window_end,
                    )

                    if invocations > 0 or gb_seconds > 0 or build_seconds > 0:
                        print(
                            f"  📈 {function_name}: "
                            f"{invocations} invocations, "
                            f"{gb_seconds:.2f} GB-s, "
                            f"{build_seconds:.1f} build-s"
                        )
                        org_requests += invocations
                        org_gb_seconds += gb_seconds
                        org_build_seconds += build_seconds

                except Exception as e:
                    print(f"  ❌ Error aggregating {function_name}: {e}")
                    continue

            elif service_type == "web-service":
                # ── ECS: wall-clock uptime billing ────────────────────
                svc_name = svc.get("function_name") or svc.get("name", "unknown")
                try:
                    vcpu_s, mem_s = _get_ecs_uptime_metrics(svc, window_seconds)

                    build_seconds = _get_build_seconds_for_service(
                        svc.get("service_id"),
                        window_seconds=window_seconds,
                        window_end=window_end,
                    )

                    if vcpu_s > 0 or mem_s > 0 or build_seconds > 0:
                        print(
                            f"  📈 ECS {svc_name}: "
                            f"{vcpu_s:.0f} vCPU-s, "
                            f"{mem_s:.2f} mem-GB-s, "
                            f"{build_seconds:.1f} build-s"
                        )
                        org_vcpu_seconds += vcpu_s
                        org_memory_seconds += mem_s
                        org_build_seconds += build_seconds

                except Exception as e:
                    print(f"  ❌ Error aggregating ECS {svc_name}: {e}")
                    continue

        # Sync usage to Autumn (sole source of truth for billing)
        has_lambda_usage = org_requests > 0 or org_gb_seconds > 0
        has_ecs_usage = org_vcpu_seconds > 0 or org_memory_seconds > 0
        has_build_usage = org_build_seconds > 0

        if has_lambda_usage or has_ecs_usage or has_build_usage:
            total_requests += org_requests
            total_gb_seconds += org_gb_seconds
            total_build_seconds += org_build_seconds
            total_vcpu_seconds += org_vcpu_seconds
            total_memory_seconds += org_memory_seconds

            # Sync to Autumn (feature IDs must match the dashboard) using an
            # idempotency key per org/feature/window so repeated runs don't
            # double-count usage for the same bucket.
            if org_requests > 0:
                _autumn_track_usage(
                    customer_id=org_id,
                    feature_id="invocations",
                    value=float(org_requests),
                    idempotency_key=f"{org_id}:invocations:{window_key}",
                )
            if org_gb_seconds > 0:
                _autumn_track_usage(
                    customer_id=org_id,
                    feature_id="compute",
                    value=float(org_gb_seconds),
                    idempotency_key=f"{org_id}:compute:{window_key}",
                )
            if org_build_seconds > 0:
                _autumn_track_usage(
                    customer_id=org_id,
                    feature_id="build_seconds",
                    value=float(org_build_seconds),
                    idempotency_key=f"{org_id}:build_seconds:{window_key}",
                )
            if org_vcpu_seconds > 0:
                _autumn_track_usage(
                    customer_id=org_id,
                    feature_id="vcpu_time",
                    value=float(org_vcpu_seconds),
                    idempotency_key=f"{org_id}:vcpu_time:{window_key}",
                )
            if org_memory_seconds > 0:
                _autumn_track_usage(
                    customer_id=org_id,
                    feature_id="memory_time",
                    value=float(org_memory_seconds),
                    idempotency_key=f"{org_id}:memory_time:{window_key}",
                )
    
    # ── Quota enforcement for hobby orgs ─────────────────────────
    print("🛡️ Running quota enforcement pass...")
    from api.quota_enforcer import check_and_enforce_quota

    for org_id in orgs_services.keys():
        try:
            result = check_and_enforce_quota(org_id)
            if result == "throttled":
                print(f"  🚫 ORG {org_id} throttled (quota exceeded)")
            elif result == "already_throttled":
                print(f"  🚫 ORG {org_id} already throttled")
            elif result == "unthrottled":
                print(f"  ✅ ORG {org_id} unthrottled (quota restored)")
        except Exception as e:
            print(f"  ❌ Quota enforcement error for {org_id}: {e}")

    print(f"🎉 Aggregation + enforcement complete!")
    print(
        f"   Total: {total_requests} requests, "
        f"{total_gb_seconds:.2f} GB-Seconds, "
        f"{total_build_seconds:.1f} build-seconds, "
        f"{total_vcpu_seconds:.0f} vCPU-seconds, "
        f"{total_memory_seconds:.2f} mem-GB-seconds"
    )
    print(f"   Period: {period}")
    print(f"   Window: {window_seconds}s ending {window_key}")
