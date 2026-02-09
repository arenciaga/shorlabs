"""
Deployments API routes - Deployment logs and streaming.
"""
import asyncio
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from api.db.dynamodb import get_project_by_key, get_deployment
from deployer.aws.cloudwatch import get_build_logs, get_build_logs_stream

router = APIRouter(prefix="/api/deployments", tags=["deployments"])


@router.get("/{project_id}/{deploy_id}/logs")
async def get_deployment_logs(
    project_id: str,
    deploy_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """
    Fetch all logs for a deployment.

    Returns build logs from CloudWatch for the associated CodeBuild build.
    """
    # Verify project belongs to organization
    project = get_project_by_key(org_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the deployment to find the build_id
    deployment = get_deployment(project_id, deploy_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    build_id = deployment.get("build_id")
    if not build_id:
        return {
            "logs": [{"timestamp": datetime.utcnow().isoformat(), "message": "No build ID associated with this deployment", "level": "WARN"}],
            "status": deployment.get("status", "UNKNOWN"),
            "phase": "UNKNOWN",
        }
    
    # Fetch logs from CloudWatch
    logs = get_build_logs(build_id)
    
    return {
        "logs": logs,
        "status": deployment.get("status", "UNKNOWN"),
        "build_id": build_id,
        "deploy_id": deploy_id,
    }


@router.get("/{project_id}/{deploy_id}/logs/stream")
async def stream_deployment_logs(
    project_id: str,
    deploy_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """
    Server-Sent Events endpoint for real-time log streaming during active builds.

    Streams log events as they happen until the build completes.
    """
    # Verify project belongs to organization
    project = get_project_by_key(org_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the deployment
    deployment = get_deployment(project_id, deploy_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    build_id = deployment.get("build_id")
    if not build_id:
        raise HTTPException(status_code=400, detail="No build ID for this deployment")
    
    async def log_generator():
        """Generate SSE events for log streaming."""
        import json
        
        next_token = None
        last_status = None
        
        while True:
            try:
                # Fetch logs with pagination
                result = get_build_logs_stream(build_id, next_token)
                
                logs = result.get("logs", [])
                new_token = result.get("next_token")
                build_status = result.get("build_status", "UNKNOWN")
                build_phase = result.get("build_phase", "UNKNOWN")
                
                # Send new logs
                for log in logs:
                    yield f"event: log\ndata: {json.dumps(log)}\n\n"
                
                # Send phase update if changed
                if build_status != last_status:
                    phase_event = {
                        "status": build_status,
                        "phase": build_phase,
                    }
                    yield f"event: phase\ndata: {json.dumps(phase_event)}\n\n"
                    last_status = build_status
                
                # Check if build is complete
                if build_status in ["SUCCEEDED", "FAILED", "STOPPED", "TIMED_OUT"]:
                    complete_event = {
                        "status": build_status,
                        "phase": build_phase,
                        "complete": True,
                    }
                    yield f"event: complete\ndata: {json.dumps(complete_event)}\n\n"
                    break
                
                # Update token for next iteration
                if new_token and new_token != next_token:
                    next_token = new_token
                
                # Wait before next poll
                await asyncio.sleep(2)
                
            except Exception as e:
                error_event = {"error": str(e)}
                yield f"event: error\ndata: {json.dumps(error_event)}\n\n"
                break
    
    return StreamingResponse(
        log_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )
