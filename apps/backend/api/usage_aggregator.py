"""
Usage Metrics Aggregator - Scheduled service for CloudWatch → DynamoDB

This service runs hourly via EventBridge to:
1. Fetch CloudWatch metrics for all Lambda functions
2. Calculate incremental usage (requests + GB-Seconds)
3. Store aggregated data in DynamoDB

Industry-standard approach ensures usage persists even after function deletion.
"""
import os
from datetime import datetime, timedelta
from typing import Dict, List

import boto3
import httpx
from boto3.dynamodb.conditions import Key

from api.db.dynamodb import (
    get_or_create_table,
    get_current_period,
    increment_org_usage,
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
        return 3600


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
    idempotency_key: str,
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
        "idempotency_key": idempotency_key,
    }

    try:
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {autumn_key}"},
            json=payload,
            timeout=15.0,
        )
        if resp.status_code >= 400:
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


def get_invocations(function_name: str, *, window_seconds: int) -> int:
    """Get number of invocations in the aggregation window."""
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(seconds=window_seconds)
    
    invocations = get_cloudwatch_metric_sum(
        function_name,
        "Invocations",
        start_time,
        end_time,
        window_seconds,
    )
    return int(invocations)


def get_gb_seconds(function_name: str, memory_mb: int, *, window_seconds: int) -> float:
    """
    Calculate GB-Seconds for a function in the aggregation window.
    
    GB-Seconds = (Duration_ms / 1000) * (Memory_MB / 1024) / 1000
    
    Note: CloudWatch Duration is in milliseconds, Memory is in MB.
    We convert to GB-Seconds for billing calculations.
    """
    end_time = datetime.utcnow()
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


def get_all_projects() -> List[Dict]:
    """Get all projects from DynamoDB."""
    table = get_or_create_table()
    
    # Scan for all project items
    # In production with many users, use pagination
    response = table.scan(
        FilterExpression="begins_with(SK, :sk_prefix)",
        ExpressionAttributeValues={
            ":sk_prefix": "PROJECT#",
        },
    )
    
    return response.get("Items", [])


def aggregate_usage_metrics():
    """
    Main aggregation function - called by EventBridge hourly.
    
    Fetches CloudWatch metrics for all projects and stores in DynamoDB.
    """
    print(f"🔄 Starting usage metrics aggregation at {datetime.utcnow().isoformat()}")
    
    # Get all projects
    projects = get_all_projects()
    print(f"📊 Found {len(projects)} projects to aggregate")
    
    if not projects:
        print("✅ No projects to aggregate")
        return
    
    # Group projects by organization_id (orgs are the billing entity)
    orgs_projects: Dict[str, List[Dict]] = {}
    for project in projects:
        org_id = project.get("organization_id")
        if not org_id:
            continue
        if org_id not in orgs_projects:
            orgs_projects[org_id] = []
        orgs_projects[org_id].append(project)
    
    print(f"🏢 Aggregating for {len(orgs_projects)} organizations")
    
    # Get current billing period
    period = get_current_period()
    window_seconds = _get_aggregation_window_seconds()
    window_end = _window_bucket_end(datetime.utcnow(), window_seconds)
    window_key = window_end.strftime("%Y%m%dT%H%M%SZ")
    
    # Aggregate metrics for each organization
    total_requests = 0
    total_gb_seconds = 0.0
    
    for org_id, org_projects in orgs_projects.items():
        org_requests = 0
        org_gb_seconds = 0.0
        
        for project in org_projects:
            # Skip if project is not LIVE
            if project.get("status") != "LIVE":
                continue
            
            # Get function name - prefer stored function_name, fallback to deriving from github_url
            # for backwards compatibility with projects that don't have function_name stored
            stored_function_name = project.get("function_name")
            if stored_function_name:
                # Apply shorlabs- prefix to get full Lambda function name
                function_name = get_lambda_function_name(stored_function_name)
            else:
                # Fallback: derive from github_url and apply prefix
                project_name = extract_project_name(project.get("github_url", ""))
                if not project_name:
                    continue
                function_name = get_lambda_function_name(project_name)
            
            memory_mb = int(project.get("memory", 1024))
            
            # Fetch metrics from CloudWatch
            try:
                invocations = get_invocations(function_name, window_seconds=window_seconds)
                gb_seconds = get_gb_seconds(function_name, memory_mb, window_seconds=window_seconds)
                
                if invocations > 0 or gb_seconds > 0:
                    print(f"  📈 {function_name}: {invocations} invocations, {gb_seconds:.2f} GB-s")
                    org_requests += invocations
                    org_gb_seconds += gb_seconds
                    
            except Exception as e:
                print(f"  ❌ Error aggregating {function_name}: {e}")
                continue
        
        # Update organization's usage in DynamoDB if there's any activity
        if org_requests > 0 or org_gb_seconds > 0:
            try:
                increment_org_usage(
                    org_id=org_id,
                    period=period,
                    requests=org_requests,
                    gb_seconds=org_gb_seconds,
                )
                print(f"✅ Updated usage for org {org_id}: +{org_requests} requests, +{org_gb_seconds:.2f} GB-s")
                total_requests += org_requests
                total_gb_seconds += org_gb_seconds
            except Exception as e:
                print(f"❌ Failed to update usage for org {org_id}: {e}")

            # Sync to Autumn (feature IDs must match the dashboard)
            # Important: send *deltas* for this window. Idempotency prevents double-counting on retries.
            if org_requests > 0:
                _autumn_track_usage(
                    customer_id=org_id,
                    feature_id="invocations",
                    value=float(org_requests),
                    idempotency_key=f"agg:{org_id}:{window_key}:invocations",
                )
            if org_gb_seconds > 0:
                _autumn_track_usage(
                    customer_id=org_id,
                    feature_id="compute",
                    value=float(org_gb_seconds),
                    idempotency_key=f"agg:{org_id}:{window_key}:compute",
                )
    
    print(f"🎉 Aggregation complete!")
    print(f"   Total: {total_requests} requests, {total_gb_seconds:.2f} GB-Seconds")
    print(f"   Period: {period}")
    print(f"   Window: {window_seconds}s ending {window_key}")
