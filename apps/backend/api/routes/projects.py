"""
Projects API routes - CRUD operations for projects.
"""
import os
import json
import threading
from typing import Optional
from datetime import datetime

import boto3
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import httpx

from api.auth import get_current_user_id
from api.db.dynamodb import (
    create_project,
    get_project,
    get_project_by_key,
    list_projects,
    update_project,
    delete_project,
    create_deployment,
    list_deployments,
    update_deployment,
)

# Import from deployer package
from deployer import deploy_project, delete_project_resources, extract_project_name
from deployer.aws import (
    get_lambda_logs,
)
from deployer.aws.ecr import get_ecr_repo_name

router = APIRouter(prefix="/api/projects", tags=["projects"])

AUTUMN_BASE_URL = os.environ.get("AUTUMN_BASE_URL", "https://api.useautumn.com/v1").rstrip("/")




class CreateProjectRequest(BaseModel):
    name: str
    organization_id: str
    github_repo: str  # e.g., "aryankashyap0/amber-backend"
    root_directory: Optional[str] = "./"  # Root directory for monorepos
    env_vars: Optional[dict] = None  # Environment variables
    start_command: str  # Required: e.g., "uvicorn main:app --host 0.0.0.0 --port 8080"
    memory: Optional[int] = 1024  # Memory in MB (1024, 2048, 4096)
    timeout: Optional[int] = 30  # Timeout in seconds
    ephemeral_storage: Optional[int] = 512  # Ephemeral storage in MB (512, 1024, 2048)


class ProjectResponse(BaseModel):
    project_id: str
    organization_id: Optional[str] = None
    name: str
    github_url: str
    github_repo: str
    status: str
    function_url: Optional[str] = None
    subdomain: Optional[str] = None
    custom_url: Optional[str] = None
    ecr_repo: Optional[str] = None
    created_at: str
    updated_at: str


# ─────────────────────────────────────────────────────────────
# BACKGROUND DEPLOYMENT TASK
# ─────────────────────────────────────────────────────────────


def _run_deployment_sync(
    project_id: str,
    github_url: str,
    github_token: Optional[str],
    root_directory: str = "./",
    start_command: str = "uvicorn main:app --host 0.0.0.0 --port 8080",
    env_vars: Optional[dict] = None,
    memory: int = 1024,
    timeout: int = 30,
    ephemeral_storage: int = 512,
):
    """Synchronous deployment function - runs in thread pool using new deployer."""
    from datetime import datetime
    
    deployment = None
    build_id_holder = [None]  # Use list to allow mutation in nested function
    
    def on_build_start(build_id: str):
        """Callback called when build starts - creates deployment record immediately."""
        nonlocal deployment
        build_id_holder[0] = build_id
        deployment = create_deployment(project_id, build_id)
        print(f"📝 Deployment record created: {deployment['deploy_id']} (build: {build_id})")
    
    try:
        # Update status to building
        update_project(project_id, {"status": "BUILDING"})
        
        # Use the new deploy_project from deployer with callback
        # Pass project_id to ensure unique Lambda function per deployment
        result = deploy_project(
            github_url=github_url,
            github_token=github_token,
            root_directory=root_directory,
            start_command=start_command,
            env_vars=env_vars,  # Pass env vars to Lambda configuration
            memory=memory,
            timeout=timeout,
            ephemeral_storage=ephemeral_storage,
            on_build_start=on_build_start,  # Create deployment record immediately
            project_id=project_id,  # Pass project_id for unique Lambda naming
        )
        
        function_url = result["function_url"]
        function_name = result.get("function_name")  # Get the actual Lambda function name
        
        # Update deployment as successful
        if deployment:
            update_deployment(project_id, deployment["deploy_id"], {
                "status": "SUCCEEDED",
                "finished_at": datetime.utcnow().isoformat(),
            })
        
        # Update project as complete, including the function_name for usage tracking
        update_project(project_id, {
            "status": "LIVE",
            "function_url": function_url,
            "function_name": function_name,  # Store for usage aggregation
        })

        # Propagate new function_url to all custom domain items
        # Lambda@Edge reads function_url from DOMAIN items, so they must stay in sync
        try:
            from api.db.dynamodb import list_project_domains, update_domain
            custom_domains = list_project_domains(project_id)
            for domain_item in custom_domains:
                if domain_item.get("status") == "ACTIVE":
                    update_domain(domain_item["domain"], {
                        "function_url": function_url,
                    })
                    print(f"  ↳ Updated domain {domain_item['domain']} function_url")
        except Exception as domain_err:
            print(f"⚠️ Failed to propagate function_url to domains: {domain_err}")

        # If the org is throttled, immediately throttle this new function too
        project_data = get_project(project_id)
        if project_data:
            org_id = project_data.get("organization_id")
            if org_id:
                from api.db.dynamodb import get_throttle_state
                throttle_state = get_throttle_state(org_id)
                if throttle_state and throttle_state.get("is_throttled"):
                    try:
                        from deployer.aws.lambda_service import get_lambda_function_name
                        full_fn = get_lambda_function_name(function_name) if function_name else None
                        if full_fn:
                            boto3.client("lambda").put_function_concurrency(
                                FunctionName=full_fn,
                                ReservedConcurrentExecutions=0,
                            )
                            print(f"🚫 New deploy throttled: {full_fn} (org {org_id} is throttled)")
                    except Exception as throttle_err:
                        print(f"⚠️ Failed to throttle new deploy: {throttle_err}")

        print(f"✅ Deployment complete: {function_url}")

    except Exception as e:
        # Update deployment as failed if it was created
        if deployment:
            update_deployment(project_id, deployment["deploy_id"], {
                "status": "FAILED",
                "finished_at": datetime.utcnow().isoformat(),
            })
        
        update_project(project_id, {"status": "FAILED"})
        print(f"❌ Deployment failed: {e}")
        import traceback
        traceback.print_exc()


def send_deployment_to_sqs(
    project_id: str,
    github_url: str,
    github_token: Optional[str],
    root_directory: str = "./",
    start_command: str = "uvicorn main:app --host 0.0.0.0 --port 8080",
    env_vars: Optional[dict] = None,
    memory: int = 1024,
    timeout: int = 30,
    ephemeral_storage: int = 512,
):
    """
    Send deployment task to SQS queue for background processing.
    
    This is the industry-standard approach for Lambda background tasks:
    - SQS provides automatic retries on failure
    - Dead-letter queue captures failed deployments
    - Same Lambda handles both HTTP requests and SQS events
    - No risk of recursive invocation loops
    """
    import time
    
    # Check if running on Lambda
    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        # Running locally - use thread pool fallback
        def run_in_thread():
            _run_deployment_sync(project_id, github_url, github_token, root_directory, start_command, env_vars, memory, timeout, ephemeral_storage)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        print(f"📤 Local: Deployment started in background thread for project {project_id}")
        return
    
    # Running on Lambda - send message to SQS queue
    sqs_client = boto3.client("sqs")
    
    # Get queue URL from environment
    queue_url = os.environ.get("DEPLOY_QUEUE_URL")
    if not queue_url:
        print("⚠️ DEPLOY_QUEUE_URL not set, falling back to thread-based execution")
        def run_in_thread():
            _run_deployment_sync(project_id, github_url, github_token, root_directory, start_command, env_vars, memory, timeout, ephemeral_storage)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        return
    
    message_body = {
        "project_id": project_id,
        "github_url": github_url,
        "github_token": github_token,
        "root_directory": root_directory,
        "start_command": start_command,
        "env_vars": env_vars or {},
        "memory": memory,
        "timeout": timeout,
        "ephemeral_storage": ephemeral_storage,
    }
    
    response = sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(message_body),
        # Use project_id as MessageGroupId so each project gets its own deployment lane
        # This allows different projects to deploy in parallel while maintaining strict
        # ordering within each project (industry-standard pattern for multi-tenant systems)
        MessageGroupId=project_id,  # Required for FIFO queue - one lane per project
        MessageDeduplicationId=f"{project_id}-{int(time.time())}",
    )
    
    print(f"📤 Deployment queued for project {project_id}, MessageId: {response['MessageId']}")



# ─────────────────────────────────────────────────────────────
# API ENDPOINTS
# ─────────────────────────────────────────────────────────────






# ─────────────────────────────────────────────────────────────
# API ENDPOINTS
# ─────────────────────────────────────────────────────────────


@router.post("")
async def create_new_project(
    request: CreateProjectRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Create a new project and start deployment."""
    from api.routes.github import get_or_refresh_token

    github_url = f"https://github.com/{request.github_repo}"

    # Get GitHub token for private repos
    github_token = await get_or_refresh_token(request.organization_id, user_id)
    
    # Normalize root_directory
    root_directory = request.root_directory or "./"
    
    # Validate organization_id is not empty (organization-only mode)
    if not request.organization_id or not request.organization_id.strip():
        raise HTTPException(status_code=400, detail="organization_id is required")
    
    # Get compute settings with defaults
    memory = request.memory or 1024
    timeout = request.timeout or 30
    ephemeral_storage = request.ephemeral_storage or 512
    
    # Create project in DynamoDB
    project = create_project(
        user_id=user_id,
        organization_id=request.organization_id,
        name=request.name,
        github_url=github_url,
        github_repo=request.github_repo,
        env_vars=request.env_vars,
        root_directory=root_directory,
        start_command=request.start_command,
        memory=memory,
        timeout=timeout,
        ephemeral_storage=ephemeral_storage,
    )
    
    # Start deployment via SQS queue (industry-standard background task pattern)
    send_deployment_to_sqs(
        project["project_id"],
        github_url,
        github_token,
        root_directory,
        request.start_command,
        request.env_vars,  # Pass env_vars to deployment
        memory,
        timeout,
        ephemeral_storage,
    )
    
    return {
        "project_id": project["project_id"],
        "organization_id": project.get("organization_id"),
        "name": project["name"],
        "github_url": project["github_url"],
        "status": project["status"],
        "subdomain": project.get("subdomain"),
        "custom_url": project.get("custom_url"),
    }


@router.get("")
async def get_projects(
    user_id: str = Depends(get_current_user_id),  # For auth
    org_id: str = Query(...),
):
    """List all projects for the organization."""
    projects = list_projects(org_id)

    # Check org-level throttle state (single lookup for all projects)
    from api.db.dynamodb import get_throttle_state
    throttle_state = get_throttle_state(org_id)
    is_throttled = bool(throttle_state and throttle_state.get("is_throttled"))

    return [
        {
            "project_id": p["project_id"],
            "organization_id": p.get("organization_id"),
            "name": p["name"],
            "github_url": p["github_url"],
            "github_repo": p["github_repo"],
            "status": p["status"],
            "function_url": p.get("function_url"),
            "subdomain": p.get("subdomain"),
            "custom_url": p.get("custom_url"),
            "created_at": p["created_at"],
            "updated_at": p["updated_at"],
            "is_throttled": is_throttled,
        }
        for p in projects
    ]


@router.get("/{project_id}")
async def get_project_details(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Get project details with deployment history."""

    project = get_project_by_key(org_id, project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    deployments = list_deployments(project_id)

    # Fetch custom domains for this project
    from api.db.dynamodb import get_throttle_state, list_project_domains
    throttle_state = get_throttle_state(org_id)
    is_throttled = bool(throttle_state and throttle_state.get("is_throttled"))

    custom_domains = list_project_domains(project_id)

    return {
        "project": {
            "project_id": project["project_id"],
            "organization_id": project.get("organization_id"),
            "name": project["name"],
            "github_url": project["github_url"],
            "github_repo": project["github_repo"],
            "status": project["status"],
            "function_url": project.get("function_url"),
            "subdomain": project.get("subdomain"),
            "custom_url": project.get("custom_url"),
            "ecr_repo": project.get("ecr_repo"),
            "env_vars": project.get("env_vars", {}),
            "start_command": project.get("start_command", ""),
            "root_directory": project.get("root_directory", "./"),
            "memory": project.get("memory", 1024),
            "timeout": project.get("timeout", 30),
            "ephemeral_storage": project.get("ephemeral_storage", 512),
            "created_at": project["created_at"],
            "updated_at": project["updated_at"],
            "is_throttled": is_throttled,
        },
        "deployments": [
            {
                "deploy_id": d["deploy_id"],
                "build_id": d["build_id"],
                "status": d["status"],
                "started_at": d["started_at"],
                "finished_at": d.get("finished_at"),
            }
            for d in deployments
        ],
        "custom_domains": [
            {
                "domain": d.get("domain"),
                "status": d.get("status"),
                "is_active": d.get("status") == "ACTIVE",
                "tenant_id": d.get("tenant_id"),
                "created_at": d.get("created_at"),
            }
            for d in custom_domains
        ],
    }


@router.get("/{project_id}/status")
async def get_project_status(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Get current project status (for polling)."""
    project = get_project(project_id)
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Auth check: organization matches (Clerk ensures user belongs to org)
    if project.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return {
        "project_id": project["project_id"],
        "status": project["status"],
        "function_url": project.get("function_url"),
    }


@router.get("/{project_id}/runtime")
async def get_runtime_logs(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Fetch runtime logs for a project's Lambda function."""
    project = get_project(project_id)
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Auth check: organization matches (Clerk ensures user belongs to org)
    if project.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Use stored function_name if available (new deployments), otherwise derive from github_url (old deployments)
    project_name = project.get("function_name")
    print(f"🔍 RUNTIME LOGS: project_id={project_id}")
    print(f"🔍 RUNTIME LOGS: function_name from DB = '{project_name}'")
    print(f"🔍 RUNTIME LOGS: github_url = '{project.get('github_url')}'")
    if not project_name:
        project_name = extract_project_name(project["github_url"])
        print(f"🔍 RUNTIME LOGS: derived project_name = '{project_name}'")
    logs = get_lambda_logs(project_name)
    print(f"🔍 RUNTIME LOGS: got {len(logs)} log entries")

    return {
        "logs": logs,
        "function_name": project_name,
    }


class UpdateEnvVarsRequest(BaseModel):
    env_vars: dict


@router.put("/{project_id}/env-vars")
async def update_project_env_vars(
    project_id: str,
    request: UpdateEnvVarsRequest,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Update project environment variables."""
    project = get_project_by_key(org_id, project_id)
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    updated = update_project(project_id, {"env_vars": request.env_vars})
    
    return {
        "project_id": project_id,
        "env_vars": updated.get("env_vars", {}),
        "message": "Environment variables updated. Redeploy to apply changes.",
    }


class UpdateProjectRequest(BaseModel):
    start_command: Optional[str] = None
    root_directory: Optional[str] = None
    name: Optional[str] = None
    memory: Optional[int] = None
    timeout: Optional[int] = None
    ephemeral_storage: Optional[int] = None


@router.patch("/{project_id}")
async def update_project_fields(
    project_id: str,
    request: UpdateProjectRequest,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Update project fields like start_command, root_directory, name."""

    project = get_project_by_key(org_id, project_id)
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Build updates dict from non-None fields
    updates = {}
    if request.start_command is not None:
        updates["start_command"] = request.start_command
    if request.root_directory is not None:
        updates["root_directory"] = request.root_directory
    if request.name is not None:
        updates["name"] = request.name
    if request.memory is not None:
        updates["memory"] = request.memory
    if request.timeout is not None:
        updates["timeout"] = request.timeout
    if request.ephemeral_storage is not None:
        updates["ephemeral_storage"] = request.ephemeral_storage
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    updated = update_project(project_id, updates)
    
    return {
        "project_id": project_id,
        "updated_fields": list(updates.keys()),
        "message": "Project updated. Redeploy to apply changes.",
    }


@router.post("/{project_id}/redeploy")
async def redeploy_project(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Trigger a redeployment of the project."""
    from api.routes.github import get_or_refresh_token

    # Use get_project_by_key for strong consistency to ensure we get the latest
    # compute settings (memory, timeout) if they were just updated.
    project = get_project_by_key(org_id, project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Immediately mark project as queued so the UI can reflect that a
    # redeployment has been scheduled, even if the actual build hasn't started yet.
    update_project(project_id, {"status": "PENDING"})

    # Get GitHub token for private repos
    github_token = await get_or_refresh_token(org_id, user_id)
    
    # Get root_directory and start_command from stored project
    root_directory = project.get("root_directory", "./")
    start_command = project.get("start_command", "uvicorn main:app --host 0.0.0.0 --port 8080")
    env_vars = project.get("env_vars", {})
    # Convert Decimal to int (DynamoDB returns Decimal which isn't JSON serializable)
    memory = int(project.get("memory", 1024))
    timeout = int(project.get("timeout", 30))
    ephemeral_storage = int(project.get("ephemeral_storage", 512))
    
    # Start redeployment via SQS queue
    send_deployment_to_sqs(
        project_id,
        project["github_url"],
        github_token,
        root_directory,
        start_command,
        env_vars,
        memory,
        timeout,
        ephemeral_storage,
    )
    
    return {
        "project_id": project_id,
        "message": "Redeployment started",
        "status": "PENDING",
    }


@router.delete("/{project_id}")
async def delete_project_endpoint(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Delete a project and all associated AWS resources."""

    project = get_project_by_key(org_id, project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get the stored function_name (for new projects) or derive from github_url (backwards compat)
    function_name = project.get("function_name")

    print(f"🗑️ DELETE PROJECT: project_id={project_id}")
    print(f"🗑️ DELETE PROJECT: function_name from DB = '{function_name}'")
    print(f"🗑️ DELETE PROJECT: github_url = '{project.get('github_url')}'")

    # Clean up custom domain resources (CloudFront distribution tenants)
    from api.db.dynamodb import list_project_domains
    from api.services.domain_service import delete_domain_tenant
    custom_domains = list_project_domains(project_id)
    for d in custom_domains:
        tenant_id = d.get("tenant_id")
        if tenant_id:
            delete_domain_tenant(tenant_id)

    # Delete AWS resources (Lambda, ECR, and CloudWatch log group)
    result = delete_project_resources(project["github_url"], function_name=function_name)

    # Delete from DynamoDB (includes deployments + domain items)
    delete_project(project_id)

    return {
        "deleted": True,
        "lambda_deleted": result["lambda_deleted"],
        "ecr_deleted": result["ecr_deleted"],
        "logs_deleted": result["logs_deleted"],
    }
