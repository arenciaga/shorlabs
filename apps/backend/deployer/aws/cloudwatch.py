"""
CloudWatch Logs Operations

Fetching logs from CodeBuild builds and Lambda functions.
"""

from typing import Optional
from datetime import datetime, timedelta

from ..clients import get_logs_client, get_codebuild_client
from ..config import CODEBUILD_PROJECT_NAME
from .lambda_service import get_lambda_function_name
from .ecs_service import get_ecs_log_group


def get_build_logs(build_id: str, limit: int = 200) -> list[dict]:
    """
    Fetch logs from a CodeBuild build.
    
    Args:
        build_id: The CodeBuild build ID (e.g., "project:build-id")
        limit: Maximum number of log events to return
        
    Returns:
        List of log entries with timestamp and message
    """
    logs_client = get_logs_client()
    codebuild_client = get_codebuild_client()
    
    # Get build info to find log group and stream
    try:
        response = codebuild_client.batch_get_builds(ids=[build_id])
        if not response["builds"]:
            return []
        
        build = response["builds"][0]
        logs_info = build.get("logs", {})
        log_group = logs_info.get("groupName")
        log_stream = logs_info.get("streamName")
        
        if not log_group or not log_stream:
            # Build might still be initializing
            return [{"timestamp": datetime.utcnow().isoformat(), "message": "Waiting for build logs...", "level": "INFO"}]
        
    except Exception as e:
        return [{"timestamp": datetime.utcnow().isoformat(), "message": f"Error fetching build info: {e}", "level": "ERROR"}]
    
    # Fetch ALL log events by paginating
    try:
        all_events = []
        next_token = None
        
        while True:
            kwargs = {
                "logGroupName": log_group,
                "logStreamName": log_stream,
                "limit": 10000,  # Max per request
                "startFromHead": True,
            }
            if next_token:
                kwargs["nextToken"] = next_token
            
            response = logs_client.get_log_events(**kwargs)
            events = response.get("events", [])
            all_events.extend(events)
            
            # Check if we've reached the end (token doesn't change)
            new_token = response.get("nextForwardToken")
            if new_token == next_token or not events:
                break
            next_token = new_token
            
            # Safety limit - max 50000 log lines
            if len(all_events) >= 50000:
                break
        
        return [
            {
                "timestamp": datetime.utcfromtimestamp(e["timestamp"] / 1000).isoformat(),
                "message": e["message"].rstrip("\n"),
                "level": _detect_log_level(e["message"]),
            }
            for e in all_events
        ]
        
    except logs_client.exceptions.ResourceNotFoundException:
        return [{"timestamp": datetime.utcnow().isoformat(), "message": "Log stream not found yet...", "level": "INFO"}]
    except Exception as e:
        return [{"timestamp": datetime.utcnow().isoformat(), "message": f"Error fetching logs: {e}", "level": "ERROR"}]


def get_build_logs_stream(build_id: str, next_token: str = None, limit: int = 50) -> dict:
    """
    Fetch logs from a CodeBuild build with pagination support for streaming.
    
    Args:
        build_id: The CodeBuild build ID (e.g., "project:build-id")
        next_token: Pagination token from previous call
        limit: Maximum number of log events per call
        
    Returns:
        dict with 'logs', 'next_token', 'build_status', and 'build_phase'
    """
    logs_client = get_logs_client()
    codebuild_client = get_codebuild_client()
    
    result = {
        "logs": [],
        "next_token": None,
        "build_status": "UNKNOWN",
        "build_phase": "UNKNOWN",
    }
    
    # Get build info
    try:
        response = codebuild_client.batch_get_builds(ids=[build_id])
        if not response["builds"]:
            return result
        
        build = response["builds"][0]
        result["build_status"] = build.get("buildStatus", "UNKNOWN")
        result["build_phase"] = build.get("currentPhase", "UNKNOWN")
        
        logs_info = build.get("logs", {})
        log_group = logs_info.get("groupName")
        log_stream = logs_info.get("streamName")
        
        if not log_group or not log_stream:
            result["logs"] = [{"timestamp": datetime.utcnow().isoformat(), "message": "Waiting for build logs...", "level": "INFO"}]
            return result
            
    except Exception as e:
        result["logs"] = [{"timestamp": datetime.utcnow().isoformat(), "message": f"Error fetching build info: {e}", "level": "ERROR"}]
        return result
    
    # Fetch log events with pagination
    try:
        kwargs = {
            "logGroupName": log_group,
            "logStreamName": log_stream,
            "limit": limit,
            "startFromHead": True,
        }
        
        if next_token:
            kwargs["nextToken"] = next_token
        
        response = logs_client.get_log_events(**kwargs)
        
        events = response.get("events", [])
        result["logs"] = [
            {
                "timestamp": datetime.utcfromtimestamp(e["timestamp"] / 1000).isoformat(),
                "message": e["message"].rstrip("\n"),
                "level": _detect_log_level(e["message"]),
            }
            for e in events
        ]
        
        # Forward token for next page
        result["next_token"] = response.get("nextForwardToken")
        
    except logs_client.exceptions.ResourceNotFoundException:
        result["logs"] = [{"timestamp": datetime.utcnow().isoformat(), "message": "Log stream not found yet...", "level": "INFO"}]
    except Exception as e:
        result["logs"] = [{"timestamp": datetime.utcnow().isoformat(), "message": f"Error fetching logs: {e}", "level": "ERROR"}]
    
    return result


def get_lambda_logs(function_name: str, limit: int = 100, hours_back: int = 24) -> list[dict]:
    """
    Fetch recent logs from a Lambda function.
    
    Args:
        function_name: The Lambda function name
        limit: Maximum number of log events to return
        hours_back: How many hours back to search for logs
        
    Returns:
        List of log entries with timestamp and message
    """
    logs_client = get_logs_client()
    
    # Get the full Lambda function name (with prefix)
    full_function_name = get_lambda_function_name(function_name)
    log_group = f"/aws/lambda/{full_function_name}"
    
    # Calculate time range
    end_time = int(datetime.utcnow().timestamp() * 1000)
    start_time = int((datetime.utcnow() - timedelta(hours=hours_back)).timestamp() * 1000)
    
    try:
        # Get recent log streams (sorted by most recent first)
        streams_response = logs_client.describe_log_streams(
            logGroupName=log_group,
            orderBy="LastEventTime",
            descending=True,
            limit=5,  # Get last 5 streams
        )
        
        log_streams = streams_response.get("logStreams", [])
        if not log_streams:
            return [{"timestamp": datetime.utcnow().isoformat(), "message": "No logs available yet", "level": "INFO"}]
        
        # Collect logs from recent streams
        all_events = []
        remaining = limit
        
        for stream in log_streams:
            if remaining <= 0:
                break
                
            try:
                events_response = logs_client.get_log_events(
                    logGroupName=log_group,
                    logStreamName=stream["logStreamName"],
                    startTime=start_time,
                    endTime=end_time,
                    limit=remaining,
                    startFromHead=False,  # Get most recent first
                )
                
                events = events_response.get("events", [])
                all_events.extend(events)
                remaining -= len(events)
                
            except Exception:
                continue
        
        # Sort by timestamp and format
        all_events.sort(key=lambda x: x["timestamp"])
        
        return [
            {
                "timestamp": datetime.utcfromtimestamp(e["timestamp"] / 1000).isoformat(),
                "message": e["message"].rstrip("\n"),
                "level": _detect_log_level(e["message"]),
            }
            for e in all_events[-limit:]  # Return last N events
        ]
        
    except logs_client.exceptions.ResourceNotFoundException:
        return [{"timestamp": datetime.utcnow().isoformat(), "message": "No logs available - function has not been invoked yet", "level": "INFO"}]
    except Exception as e:
        return [{"timestamp": datetime.utcnow().isoformat(), "message": f"Error fetching logs: {e}", "level": "ERROR"}]


def _detect_log_level(message: str) -> str:
    """
    Detect log level from message content.
    
    Returns: "INFO", "WARN", "ERROR", or "SUCCESS"
    """
    msg_lower = message.lower()
    
    if any(x in msg_lower for x in ["error", "failed", "exception", "traceback", "❌"]):
        return "ERROR"
    if any(x in msg_lower for x in ["warn", "warning", "⚠"]):
        return "WARN"
    if any(x in msg_lower for x in ["success", "succeeded", "complete", "✅", "✓"]):
        return "SUCCESS"
    
    return "INFO"


def delete_lambda_logs(function_name: str) -> bool:
    """
    Delete CloudWatch log group for a Lambda function.

    Args:
        function_name: The Lambda function name (without prefix)

    Returns:
        True if deleted, False otherwise
    """
    from botocore.exceptions import ClientError

    logs_client = get_logs_client()

    # Get the full Lambda function name (with prefix)
    full_function_name = get_lambda_function_name(function_name)
    log_group = f"/aws/lambda/{full_function_name}"

    print(f"🗑️ Attempting to delete log group: {log_group}")

    try:
        # Just try to delete directly - boto3 will raise ResourceNotFoundException if it doesn't exist
        logs_client.delete_log_group(logGroupName=log_group)
        print(f"✅ Deleted CloudWatch log group: {log_group}")
        return True

    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        error_message = e.response.get("Error", {}).get("Message", str(e))

        if error_code == "ResourceNotFoundException":
            print(f"⚠️ Log group not found (already deleted or never existed): {log_group}")
            return True  # Not an error if it doesn't exist
        else:
            print(f"❌ Failed to delete log group {log_group}: [{error_code}] {error_message}")
            return False

    except Exception as e:
        print(f"❌ Unexpected error deleting log group {log_group}: {type(e).__name__}: {e}")
        return False


def get_ecs_logs(project_name: str, limit: int = 100, hours_back: int = 24) -> list[dict]:
    """
    Fetch recent logs from an ECS Fargate service.

    Args:
        project_name: The project name (used to derive log group)
        limit: Maximum number of log events to return
        hours_back: How many hours back to search for logs

    Returns:
        List of log entries with timestamp, message, and level
    """
    logs_client = get_logs_client()
    log_group = get_ecs_log_group(project_name)

    end_time = int(datetime.utcnow().timestamp() * 1000)
    start_time = int((datetime.utcnow() - timedelta(hours=hours_back)).timestamp() * 1000)

    try:
        streams_response = logs_client.describe_log_streams(
            logGroupName=log_group,
            orderBy="LastEventTime",
            descending=True,
            limit=5,
        )

        log_streams = streams_response.get("logStreams", [])
        if not log_streams:
            return [{"timestamp": datetime.utcnow().isoformat(), "message": "No logs available yet", "level": "INFO"}]

        all_events = []
        remaining = limit

        for stream in log_streams:
            if remaining <= 0:
                break

            try:
                events_response = logs_client.get_log_events(
                    logGroupName=log_group,
                    logStreamName=stream["logStreamName"],
                    startTime=start_time,
                    endTime=end_time,
                    limit=remaining,
                    startFromHead=False,
                )

                events = events_response.get("events", [])
                all_events.extend(events)
                remaining -= len(events)

            except Exception:
                continue

        all_events.sort(key=lambda x: x["timestamp"])

        return [
            {
                "timestamp": datetime.utcfromtimestamp(e["timestamp"] / 1000).isoformat(),
                "message": e["message"].rstrip("\n"),
                "level": _detect_log_level(e["message"]),
            }
            for e in all_events[-limit:]
        ]

    except logs_client.exceptions.ResourceNotFoundException:
        return [{"timestamp": datetime.utcnow().isoformat(), "message": "No logs available - service has not started yet", "level": "INFO"}]
    except Exception as e:
        return [{"timestamp": datetime.utcnow().isoformat(), "message": f"Error fetching logs: {e}", "level": "ERROR"}]


def delete_ecs_logs(project_name: str) -> bool:
    """
    Delete CloudWatch log group for an ECS service.

    Returns:
        True if deleted, False otherwise
    """
    from botocore.exceptions import ClientError

    logs_client = get_logs_client()
    log_group = get_ecs_log_group(project_name)

    print(f"🗑️ Attempting to delete ECS log group: {log_group}")

    try:
        logs_client.delete_log_group(logGroupName=log_group)
        print(f"✅ Deleted ECS log group: {log_group}")
        return True
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        if error_code == "ResourceNotFoundException":
            print(f"⚠️ ECS log group not found (already deleted?): {log_group}")
            return True
        else:
            print(f"❌ Failed to delete ECS log group: {e}")
            return False
    except Exception as e:
        print(f"❌ Unexpected error deleting ECS log group: {e}")
        return False
