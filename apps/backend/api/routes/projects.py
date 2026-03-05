"""
Projects API routes - CRUD operations for projects.
"""
import os
import json
import threading
import traceback
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
from deployer import provision_database, delete_database_resources
from deployer.aws import (
    get_lambda_logs,
)
from deployer.aws.rds import get_cluster_secret, get_cluster_security_group_ids, get_security_group_rules
from api.db.pg_explorer import (
    list_schemas as pg_list_schemas,
    list_tables as pg_list_tables,
    get_columns as pg_get_columns,
    get_table_data as pg_get_table_data,
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


class CreateDatabaseProjectRequest(BaseModel):
    name: str
    organization_id: str
    db_name: Optional[str] = "shorlabs"
    min_acu: Optional[float] = 0
    max_acu: Optional[float] = 2


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
    commit_sha: Optional[str] = None,
    commit_message: Optional[str] = None,
    commit_author_name: Optional[str] = None,
    commit_author_username: Optional[str] = None,
    branch: Optional[str] = None,
    org_id: Optional[str] = None,
):
    """Synchronous deployment function - runs in thread pool using new deployer."""
    from datetime import datetime

    deployment = None
    build_id_holder = [None]  # Use list to allow mutation in nested function

    def on_build_start(build_id: str):
        """Callback called when build starts - creates deployment record immediately."""
        nonlocal deployment
        build_id_holder[0] = build_id
        deployment = create_deployment(
            project_id, build_id,
            commit_sha=commit_sha,
            commit_message=commit_message,
            commit_author_name=commit_author_name,
            commit_author_username=commit_author_username,
            branch=branch,
        )
        print(f"📝 Deployment record created: {deployment['deploy_id']} (build: {build_id})")
    
    try:
        # Update status to building
        update_project(project_id, {"status": "BUILDING"})

        # Determine CodeBuild compute type based on org plan:
        #   Hobby/Free → BUILD_GENERAL1_SMALL
        #   Paid (Pro/Plus) → BUILD_GENERAL1_LARGE
        codebuild_compute_type = "BUILD_GENERAL1_LARGE"  # default for paid
        if org_id:
            from api.lambda_warmer import _is_paid_org
            if not _is_paid_org(org_id):
                codebuild_compute_type = "BUILD_GENERAL1_SMALL"
                print(f"⚡ Hobby plan detected — using {codebuild_compute_type} compute")
            else:
                print(f"⚡ Paid plan detected — using {codebuild_compute_type} compute")

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
            codebuild_compute_type=codebuild_compute_type,
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

            # Post-deploy warming: pre-warm the new Lambda (paid plans only)
            if org_id:
                try:
                    from api.lambda_warmer import warm_single_function
                    warm_single_function(function_url, org_id=org_id, count=3)
                except Exception as warm_err:
                    print(f"⚠️ Post-deploy warming failed (non-fatal): {warm_err}")

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
    commit_sha: Optional[str] = None,
    commit_message: Optional[str] = None,
    commit_author_name: Optional[str] = None,
    commit_author_username: Optional[str] = None,
    branch: Optional[str] = None,
    org_id: Optional[str] = None,
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
            _run_deployment_sync(
                project_id, github_url, github_token, root_directory, start_command,
                env_vars, memory, timeout, ephemeral_storage,
                commit_sha=commit_sha, commit_message=commit_message,
                commit_author_name=commit_author_name,
                commit_author_username=commit_author_username, branch=branch,
                org_id=org_id,
            )
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
            _run_deployment_sync(
                project_id, github_url, github_token, root_directory, start_command,
                env_vars, memory, timeout, ephemeral_storage,
                commit_sha=commit_sha, commit_message=commit_message,
                commit_author_name=commit_author_name,
                commit_author_username=commit_author_username, branch=branch,
                org_id=org_id,
            )
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
        "commit_sha": commit_sha,
        "commit_message": commit_message,
        "commit_author_name": commit_author_name,
        "commit_author_username": commit_author_username,
        "branch": branch,
        "org_id": org_id,
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
# DATABASE PROVISIONING (BACKGROUND TASK)
# ─────────────────────────────────────────────────────────────

AURORA_SERVERLESS_V2_MIN_MAX_ACU = 1.0


def _round_to_half_step(value: float) -> float:
    """Aurora Serverless v2 values are expected in 0.5 ACU increments."""
    return round(float(value) * 2) / 2


def _normalize_serverless_v2_capacity(min_acu: float, max_acu: float) -> tuple[float, float]:
    """Normalize min/max ACU values so they satisfy Aurora Serverless v2 constraints."""
    try:
        parsed_min = float(min_acu)
    except (TypeError, ValueError):
        parsed_min = 0.0

    try:
        parsed_max = float(max_acu)
    except (TypeError, ValueError):
        parsed_max = 2.0

    normalized_min = max(0.0, _round_to_half_step(parsed_min))
    normalized_max = max(AURORA_SERVERLESS_V2_MIN_MAX_ACU, _round_to_half_step(parsed_max))
    if normalized_max < normalized_min:
        normalized_max = normalized_min
    return normalized_min, normalized_max


def _run_database_provision_sync(
    project_id: str,
    db_name: str = "shorlabs",
    min_acu: float = 0,
    max_acu: float = 2,
):
    """Synchronous database provisioning - runs in thread pool or via SQS."""
    try:
        normalized_min_acu, normalized_max_acu = _normalize_serverless_v2_capacity(min_acu, max_acu)
        update_project(project_id, {"status": "PROVISIONING"})

        result = provision_database(
            project_id=project_id,
            db_name=db_name,
            min_acu=normalized_min_acu,
            max_acu=normalized_max_acu,
        )

        update_project(project_id, {
            "status": "LIVE",
            "db_cluster_identifier": result["cluster_identifier"],
            "db_endpoint": result["endpoint"],
            "db_port": result["port"],
            "db_name": result["db_name"],
            "db_master_username": result["master_username"],
            "db_secret_arn": result["secret_arn"],
        })

        print(f"✅ Database provisioned: {result['endpoint']}:{result['port']}")

    except Exception as e:
        update_project(project_id, {"status": "FAILED"})
        print(f"❌ Database provisioning failed: {e}")
        import traceback
        traceback.print_exc()


def send_database_provision_to_sqs(
    project_id: str,
    db_name: str = "shorlabs",
    min_acu: float = 0,
    max_acu: float = 2,
):
    """Send database provisioning task to SQS queue for background processing."""
    import time
    normalized_min_acu, normalized_max_acu = _normalize_serverless_v2_capacity(min_acu, max_acu)

    # Check if running on Lambda
    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        # Running locally - use thread pool fallback
        def run_in_thread():
            _run_database_provision_sync(project_id, db_name, normalized_min_acu, normalized_max_acu)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        print(f"📤 Local: Database provisioning started in background thread for project {project_id}")
        return

    # Running on Lambda - send message to SQS queue
    sqs_client = boto3.client("sqs")

    queue_url = os.environ.get("DEPLOY_QUEUE_URL")
    if not queue_url:
        print("⚠️ DEPLOY_QUEUE_URL not set, falling back to thread-based execution")
        def run_in_thread():
            _run_database_provision_sync(project_id, db_name, normalized_min_acu, normalized_max_acu)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        return

    message_body = {
        "message_type": "database_provision",
        "project_id": project_id,
        "db_name": db_name,
        "min_acu": normalized_min_acu,
        "max_acu": normalized_max_acu,
    }

    response = sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(message_body),
        MessageGroupId=project_id,
        MessageDeduplicationId=f"{project_id}-db-{int(time.time())}",
    )

    print(f"📤 Database provisioning queued for project {project_id}, MessageId: {response['MessageId']}")


# ─────────────────────────────────────────────────────────────
# DATABASE DELETION (BACKGROUND TASK)
# ─────────────────────────────────────────────────────────────


def _run_database_delete_sync(project_id: str):
    """Synchronous database deletion - runs in thread pool or via SQS."""
    try:
        result = delete_database_resources(project_id)
        print(f"✅ Database resources deleted for project {project_id}: {result}")

        # Now remove the DynamoDB record
        delete_project(project_id)
        print(f"✅ Project record deleted for {project_id}")

    except Exception as e:
        # Mark as FAILED so the user knows something went wrong
        update_project(project_id, {"status": "FAILED"})
        print(f"❌ Database deletion failed for {project_id}: {e}")
        import traceback
        traceback.print_exc()


def send_database_delete_to_sqs(project_id: str):
    """Send database deletion task to SQS queue for background processing."""
    import time

    # Check if running on Lambda
    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        # Running locally - use thread pool fallback
        def run_in_thread():
            _run_database_delete_sync(project_id)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        print(f"📤 Local: Database deletion started in background thread for project {project_id}")
        return

    # Running on Lambda - send message to SQS queue
    sqs_client = boto3.client("sqs")

    queue_url = os.environ.get("DEPLOY_QUEUE_URL")
    if not queue_url:
        print("⚠️ DEPLOY_QUEUE_URL not set, falling back to thread-based execution")
        def run_in_thread():
            _run_database_delete_sync(project_id)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        return

    message_body = {
        "message_type": "database_delete",
        "project_id": project_id,
    }

    response = sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(message_body),
        MessageGroupId=project_id,
        MessageDeduplicationId=f"{project_id}-delete-{int(time.time())}",
    )

    print(f"📤 Database deletion queued for project {project_id}, MessageId: {response['MessageId']}")


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
    from api.routes.github import get_or_refresh_token, fetch_latest_commit

    github_url = f"https://github.com/{request.github_repo}"

    # Get GitHub token for private repos
    github_token = await get_or_refresh_token(request.organization_id, user_id)

    # Fetch latest commit info from GitHub API
    commit_info = {}
    if github_token:
        commit_info = await fetch_latest_commit(github_token, request.github_repo)

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
        **commit_info,
        org_id=request.organization_id,
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


@router.post("/database")
async def create_database_project(
    request: CreateDatabaseProjectRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Create a new database project and start provisioning."""
    if not request.organization_id or not request.organization_id.strip():
        raise HTTPException(status_code=400, detail="organization_id is required")

    normalized_min_acu, normalized_max_acu = _normalize_serverless_v2_capacity(
        request.min_acu if request.min_acu is not None else 0,
        request.max_acu if request.max_acu is not None else 2,
    )

    project = create_project(
        user_id=user_id,
        organization_id=request.organization_id,
        name=request.name,
        project_type="database",
        db_name=request.db_name,
        min_acu=normalized_min_acu,
        max_acu=normalized_max_acu,
    )

    send_database_provision_to_sqs(
        project["project_id"],
        request.db_name,
        normalized_min_acu,
        normalized_max_acu,
    )

    return {
        "project_id": project["project_id"],
        "organization_id": project.get("organization_id"),
        "name": project["name"],
        "project_type": "database",
        "status": project["status"],
    }


@router.get("")
async def get_projects(
    user_id: str = Depends(get_current_user_id),  # For auth
    org_id: str = Query(...),
):
    """List all projects for the organization."""
    projects = list_projects(org_id)

    # Check org-level throttle state (single lookup for all projects)
    from api.db.dynamodb import get_throttle_state, list_project_domains
    throttle_state = get_throttle_state(org_id)
    is_throttled = bool(throttle_state and throttle_state.get("is_throttled"))

    result = []
    for p in projects:
        # Find first active custom domain for this project
        domains = list_project_domains(p["project_id"])
        active_domain = next(
            (d["domain"] for d in domains if d.get("status") == "ACTIVE"),
            None,
        )

        project_data = {
            "project_id": p["project_id"],
            "organization_id": p.get("organization_id"),
            "name": p["name"],
            "project_type": p.get("project_type", "web-app"),
            "status": p["status"],
            "created_at": p["created_at"],
            "updated_at": p["updated_at"],
            "is_throttled": is_throttled,
        }

        if p.get("project_type", "web-app") == "database":
            project_data.update({
                "db_endpoint": p.get("db_endpoint"),
                "db_port": p.get("db_port"),
                "db_name": p.get("db_name"),
            })
        else:
            project_data.update({
                "github_url": p.get("github_url"),
                "github_repo": p.get("github_repo"),
                "function_url": p.get("function_url"),
                "subdomain": p.get("subdomain"),
                "custom_url": p.get("custom_url"),
                "active_custom_domain": active_domain,
            })

        result.append(project_data)

    return result


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

    project_type = project.get("project_type", "web-app")

    # Build base project response
    project_response = {
        "project_id": project["project_id"],
        "organization_id": project.get("organization_id"),
        "name": project["name"],
        "project_type": project_type,
        "status": project["status"],
        "created_at": project["created_at"],
        "updated_at": project["updated_at"],
    }

    if project_type == "database":
        # Database-specific fields
        project_response.update({
            "db_cluster_identifier": project.get("db_cluster_identifier"),
            "db_endpoint": project.get("db_endpoint"),
            "db_port": project.get("db_port"),
            "db_name": project.get("db_name"),
            "db_master_username": project.get("db_master_username"),
            "min_acu": project.get("min_acu"),
            "max_acu": project.get("max_acu"),
        })

        return {
            "project": project_response,
            "deployments": [],
            "custom_domains": [],
        }

    # Web-app-specific fields
    from api.db.dynamodb import get_throttle_state, list_project_domains
    throttle_state = get_throttle_state(org_id)
    is_throttled = bool(throttle_state and throttle_state.get("is_throttled"))

    project_response.update({
        "github_url": project.get("github_url"),
        "github_repo": project.get("github_repo"),
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
        "is_throttled": is_throttled,
    })

    deployments = list_deployments(project_id)
    custom_domains = list_project_domains(project_id)

    return {
        "project": project_response,
        "deployments": [
            {
                "deploy_id": d["deploy_id"],
                "build_id": d["build_id"],
                "status": d["status"],
                "started_at": d["started_at"],
                "finished_at": d.get("finished_at"),
                "commit_sha": d.get("commit_sha"),
                "commit_message": d.get("commit_message"),
                "commit_author_name": d.get("commit_author_name"),
                "commit_author_username": d.get("commit_author_username"),
                "branch": d.get("branch"),
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


@router.get("/{project_id}/connection")
async def get_database_connection(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Get connection details for a database project."""
    project = get_project_by_key(org_id, project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.get("project_type", "web-app") != "database":
        raise HTTPException(status_code=400, detail="Not a database project")

    cluster_id = project.get("db_cluster_identifier")
    if not cluster_id:
        raise HTTPException(status_code=404, detail="Database not yet provisioned")

    credentials = get_cluster_secret(cluster_id)

    endpoint = project["db_endpoint"]
    port = int(project.get("db_port", 5432))
    db_name = project["db_name"]
    username = credentials["username"]
    password = credentials["password"]

    return {
        "host": endpoint,
        "port": port,
        "database": db_name,
        "username": username,
        "password": password,
        "connection_string": f"postgresql://{username}:{password}@{endpoint}:{port}/{db_name}",
    }


# ─────────────────────────────────────────────────────────────
# DATABASE EXPLORER ENDPOINTS
# ─────────────────────────────────────────────────────────────


def _get_live_database_project(org_id: str, project_id: str) -> dict:
    """Shared validation for explorer endpoints."""
    project = get_project_by_key(org_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("project_type", "web-app") != "database":
        raise HTTPException(status_code=400, detail="Not a database project")
    cluster_id = project.get("db_cluster_identifier")
    if not cluster_id or project.get("status") != "LIVE":
        raise HTTPException(status_code=400, detail="Database not available")
    return project


@router.get("/{project_id}/database/schemas")
async def get_database_schemas(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """List all schemas in the user's database."""
    project = _get_live_database_project(org_id, project_id)
    try:
        schemas = pg_list_schemas(
            cluster_identifier=project["db_cluster_identifier"],
            db_name=project["db_name"],
            port=int(project.get("db_port", 5432)),
            endpoint=project["db_endpoint"],
        )
        return {"schemas": schemas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")


@router.get("/{project_id}/database/tables")
async def get_database_tables(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    schema: str = Query(default="public"),
):
    """List all tables in a schema."""
    project = _get_live_database_project(org_id, project_id)
    try:
        tables = pg_list_tables(
            cluster_identifier=project["db_cluster_identifier"],
            db_name=project["db_name"],
            port=int(project.get("db_port", 5432)),
            endpoint=project["db_endpoint"],
            schema=schema,
        )
        return {"tables": tables, "schema": schema}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")


@router.get("/{project_id}/database/tables/{table_name}/columns")
async def get_database_table_columns(
    project_id: str,
    table_name: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    schema: str = Query(default="public"),
):
    """Get column definitions for a table."""
    project = _get_live_database_project(org_id, project_id)
    try:
        columns = pg_get_columns(
            cluster_identifier=project["db_cluster_identifier"],
            db_name=project["db_name"],
            port=int(project.get("db_port", 5432)),
            endpoint=project["db_endpoint"],
            schema=schema,
            table_name=table_name,
        )
        return {"columns": columns, "schema": schema, "table_name": table_name}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")


@router.get("/{project_id}/database/tables/{table_name}/data")
async def get_database_table_data(
    project_id: str,
    table_name: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    schema: str = Query(default="public"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
):
    """Get paginated data rows from a table."""
    project = _get_live_database_project(org_id, project_id)
    try:
        result = pg_get_table_data(
            cluster_identifier=project["db_cluster_identifier"],
            db_name=project["db_name"],
            port=int(project.get("db_port", 5432)),
            endpoint=project["db_endpoint"],
            schema=schema,
            table_name=table_name,
            page=page,
            page_size=page_size,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")


# ─────────────────────────────────────────────────────────────
# DATABASE SECURITY RULES
# ─────────────────────────────────────────────────────────────


def _security_debug_context(org_id: str, project_id: str, project: Optional[dict] = None, sg_id: Optional[str] = None) -> dict:
    """Build a minimal debug context for security-rules handlers."""
    ctx = {
        "org_id": org_id,
        "project_id": project_id,
    }
    if project:
        ctx.update({
            "status": project.get("status"),
            "project_type": project.get("project_type"),
            "db_cluster_identifier": project.get("db_cluster_identifier"),
            "db_endpoint": project.get("db_endpoint"),
            "db_port": project.get("db_port"),
        })
    if sg_id:
        ctx["security_group_id"] = sg_id
    return ctx


def _get_sg_id_for_project(project: dict) -> str:
    """Get the first VPC security group ID attached to the project's cluster."""
    print(f"🔎 SG LOOKUP: cluster={project.get('db_cluster_identifier')} project_id={project.get('project_id')}")
    sg_ids = get_cluster_security_group_ids(project["db_cluster_identifier"])
    print(f"🔎 SG LOOKUP RESULT: cluster={project.get('db_cluster_identifier')} sg_ids={sg_ids}")
    if not sg_ids:
        raise HTTPException(status_code=404, detail="No security group found for this database")
    return sg_ids[0]


@router.get("/{project_id}/database/security-rules")
async def get_database_security_rules(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Get inbound and outbound security group rules for this database."""
    project = _get_live_database_project(org_id, project_id)
    debug_ctx = _security_debug_context(org_id, project_id, project=project)
    print(f"🛡️ SECURITY RULES GET START: {debug_ctx}")
    try:
        sg_id = _get_sg_id_for_project(project)
        debug_ctx = _security_debug_context(org_id, project_id, project=project, sg_id=sg_id)
        rules = get_security_group_rules(sg_id)
        print(
            "🛡️ SECURITY RULES GET SUCCESS: "
            f"{debug_ctx} inbound={len(rules.get('inbound', []))} outbound={len(rules.get('outbound', []))}"
        )
        return rules
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ SECURITY RULES GET ERROR: {debug_ctx} error={type(e).__name__}: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch security rules: {str(e)}")


class AddSecurityRuleRequest(BaseModel):
    direction: str  # "inbound" or "outbound"
    protocol: str  # "tcp", "udp", or "-1"
    from_port: Optional[int] = None
    to_port: Optional[int] = None
    cidr: str  # IPv4 CIDR e.g. "203.0.113.50/32"
    description: Optional[str] = None


@router.post("/{project_id}/database/security-rules")
async def add_database_security_rule(
    project_id: str,
    request: AddSecurityRuleRequest,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Add an inbound or outbound security group rule."""
    import ipaddress
    from botocore.exceptions import ClientError
    from deployer.clients import get_ec2_client

    project = _get_live_database_project(org_id, project_id)
    sg_id = _get_sg_id_for_project(project)
    debug_ctx = _security_debug_context(org_id, project_id, project=project, sg_id=sg_id)
    print(
        "🛡️ SECURITY RULES ADD START: "
        f"{debug_ctx} direction={request.direction} protocol={request.protocol} "
        f"from_port={request.from_port} to_port={request.to_port} cidr={request.cidr}"
    )

    if request.direction not in ("inbound", "outbound"):
        raise HTTPException(status_code=400, detail="direction must be 'inbound' or 'outbound'")

    if request.protocol not in ("tcp", "udp", "-1"):
        raise HTTPException(status_code=400, detail="protocol must be 'tcp', 'udp', or '-1'")

    if request.protocol in ("tcp", "udp") and (request.from_port is None or request.to_port is None):
        raise HTTPException(status_code=400, detail="from_port and to_port required for tcp/udp")

    # Validate and canonicalize CIDR
    try:
        network = ipaddress.ip_network(request.cidr, strict=False)
        cidr = str(network)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid CIDR format")

    ip_permission = {"IpProtocol": request.protocol}
    if request.protocol != "-1":
        ip_permission["FromPort"] = request.from_port
        ip_permission["ToPort"] = request.to_port

    ip_range = {"CidrIp": cidr}
    if request.description:
        ip_range["Description"] = request.description
    ip_permission["IpRanges"] = [ip_range]

    ec2 = get_ec2_client()
    try:
        if request.direction == "inbound":
            ec2.authorize_security_group_ingress(GroupId=sg_id, IpPermissions=[ip_permission])
        else:
            ec2.authorize_security_group_egress(GroupId=sg_id, IpPermissions=[ip_permission])
        print(f"🛡️ SECURITY RULES ADD SUCCESS: {debug_ctx}")
        return {"status": "created"}
    except ClientError as e:
        err = e.response.get("Error", {})
        print(f"❌ SECURITY RULES ADD AWS ERROR: {debug_ctx} code={err.get('Code')} message={err.get('Message')}")
        print(traceback.format_exc())
        if e.response["Error"]["Code"] == "InvalidPermission.Duplicate":
            raise HTTPException(status_code=409, detail="Rule already exists")
        raise HTTPException(status_code=500, detail=f"Failed to add rule: {str(e)}")
    except Exception as e:
        print(f"❌ SECURITY RULES ADD ERROR: {debug_ctx} error={type(e).__name__}: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to add rule: {str(e)}")


@router.delete("/{project_id}/database/security-rules/{rule_id}")
async def delete_database_security_rule(
    project_id: str,
    rule_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    direction: str = Query(...),
):
    """Remove a security group rule by its SecurityGroupRuleId."""
    from botocore.exceptions import ClientError
    from deployer.clients import get_ec2_client

    project = _get_live_database_project(org_id, project_id)
    sg_id = _get_sg_id_for_project(project)
    debug_ctx = _security_debug_context(org_id, project_id, project=project, sg_id=sg_id)
    print(f"🛡️ SECURITY RULES DELETE START: {debug_ctx} rule_id={rule_id} direction={direction}")

    if direction not in ("inbound", "outbound"):
        raise HTTPException(status_code=400, detail="direction must be 'inbound' or 'outbound'")

    # Verify rule belongs to this SG
    rules_data = get_security_group_rules(sg_id)
    rule_list = rules_data["inbound"] if direction == "inbound" else rules_data["outbound"]
    if not any(r["rule_id"] == rule_id for r in rule_list):
        raise HTTPException(status_code=404, detail="Rule not found in this security group")

    ec2 = get_ec2_client()
    try:
        if direction == "inbound":
            ec2.revoke_security_group_ingress(GroupId=sg_id, SecurityGroupRuleIds=[rule_id])
        else:
            ec2.revoke_security_group_egress(GroupId=sg_id, SecurityGroupRuleIds=[rule_id])
        print(f"🛡️ SECURITY RULES DELETE SUCCESS: {debug_ctx} rule_id={rule_id} direction={direction}")
        return {"status": "deleted"}
    except ClientError as e:
        err = e.response.get("Error", {})
        print(
            "❌ SECURITY RULES DELETE AWS ERROR: "
            f"{debug_ctx} rule_id={rule_id} direction={direction} "
            f"code={err.get('Code')} message={err.get('Message')}"
        )
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to delete rule: {str(e)}")
    except Exception as e:
        print(f"❌ SECURITY RULES DELETE ERROR: {debug_ctx} rule_id={rule_id} direction={direction} error={type(e).__name__}: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to delete rule: {str(e)}")


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
    from api.routes.github import get_or_refresh_token, fetch_latest_commit

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

    # Fetch latest commit info from GitHub API
    commit_info = {}
    if github_token:
        commit_info = await fetch_latest_commit(github_token, project.get("github_repo", ""))

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
        **commit_info,
        org_id=org_id,
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

    project_type = project.get("project_type", "web-app")

    print(f"🗑️ DELETE PROJECT: project_id={project_id}, type={project_type}")

    if project_type == "database":
        # Mark as DELETING immediately, then process deletion asynchronously via SQS
        update_project(project_id, {"status": "DELETING"})
        send_database_delete_to_sqs(project_id)

        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=202,
            content={"status": "DELETING", "message": "Database deletion initiated"},
        )

    # Web-app deletion (existing logic)
    function_name = project.get("function_name")

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
    result = delete_project_resources(project.get("github_url", ""), function_name=function_name)

    # Delete from DynamoDB (includes deployments + domain items)
    delete_project(project_id)

    return {
        "deleted": True,
        "lambda_deleted": result["lambda_deleted"],
        "ecr_deleted": result["ecr_deleted"],
        "logs_deleted": result["logs_deleted"],
    }
