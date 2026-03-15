"""
Projects API routes - CRUD operations for projects and services.
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
from coolname import generate_slug

from api.auth import get_current_user_id
from api.db.dynamodb import (
    create_project,
    get_project,
    get_project_by_key,
    list_projects,
    update_project,
    delete_project,
    create_service,
    get_service,
    get_service_by_key,
    list_services,
    update_service,
    delete_service,
    get_project_with_services,
    create_deployment,
    list_deployments,
    update_deployment,
)

# Import from deployer package
from deployer import deploy_project, delete_project_resources, extract_project_name
from deployer import provision_database, delete_database_resources
from deployer import deploy_ecs_project, delete_ecs_resources
from deployer.aws import (
    get_lambda_logs,
    get_ecs_logs,
)
from deployer.aws.rds import get_cluster_secret, get_cluster_security_group_ids, get_security_group_rules, modify_aurora_cluster_scaling, _normalize_serverless_v2_capacity
from api.db.pg_explorer import (
    list_schemas as pg_list_schemas,
    list_tables as pg_list_tables,
    get_columns as pg_get_columns,
    get_table_data as pg_get_table_data,
    create_table as pg_create_table,
    add_column as pg_add_column,
    alter_column as pg_alter_column,
    drop_column as pg_drop_column,
    rename_table as pg_rename_table,
    drop_table as pg_drop_table,
)
from deployer.aws.ecr import get_ecr_repo_name

router = APIRouter(prefix="/api/projects", tags=["projects"])

AUTUMN_BASE_URL = os.environ.get("AUTUMN_BASE_URL", "https://api.useautumn.com/v1").rstrip("/")




def generate_project_name() -> str:
    """Generate a random project name like 'fantastic-acoustic-whale'."""
    return generate_slug(2)


class CreateProjectRequest(BaseModel):
    """Create a project container with an initial service."""
    name: str
    organization_id: str
    description: Optional[str] = ""
    # Web-app service fields (used when creating initial service)
    github_repo: str
    root_directory: Optional[str] = "./"
    env_vars: Optional[dict] = None
    start_command: str
    memory: Optional[int] = 1024
    timeout: Optional[int] = 30
    ephemeral_storage: Optional[int] = 512

class CreateBlankProjectRequest(BaseModel):
    """Create a blank project container with no services."""
    organization_id: str
    description: Optional[str] = ""

class CreateDatabaseProjectRequest(BaseModel):
    """Create a project container with an initial database service."""
    name: str
    organization_id: str
    description: Optional[str] = ""
    db_name: Optional[str] = "shorlabs"
    min_acu: Optional[float] = 0
    max_acu: Optional[float] = 2

class CreateWebServiceProjectRequest(BaseModel):
    """Create a project with an initial web-service (ECS) service."""
    name: str
    organization_id: str
    description: Optional[str] = ""
    github_repo: str
    root_directory: Optional[str] = "./"
    env_vars: Optional[dict] = None
    start_command: str
    cpu: Optional[int] = 2048
    memory: Optional[int] = 1024

class AddServiceRequest(BaseModel):
    """Add a new service to an existing project."""
    name: str
    service_type: str  # "web-app", "database", or "web-service"
    # Web-app fields
    github_repo: Optional[str] = None
    root_directory: Optional[str] = "./"
    env_vars: Optional[dict] = None
    start_command: Optional[str] = "uvicorn main:app --host 0.0.0.0 --port 8080"
    memory: Optional[int] = 1024
    timeout: Optional[int] = 30
    ephemeral_storage: Optional[int] = 512
    # Database fields
    db_name: Optional[str] = "shorlabs"
    min_acu: Optional[float] = 0
    max_acu: Optional[float] = 2
    # Web-service (ECS) fields
    cpu: Optional[int] = 256


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
    service_id: str,
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
            service_id, build_id,
            commit_sha=commit_sha,
            commit_message=commit_message,
            commit_author_name=commit_author_name,
            commit_author_username=commit_author_username,
            branch=branch,
        )
        print(f"📝 Deployment record created: {deployment['deploy_id']} (build: {build_id})")

    def on_status_change(status: str):
        update_service(service_id, {"status": status})

    try:
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
            on_build_start=on_build_start,
            on_status_change=on_status_change,
            project_id=service_id,
            codebuild_compute_type=codebuild_compute_type,
        )
        
        function_url = result["function_url"]
        function_name = result.get("function_name")  # Get the actual Lambda function name
        
        # Update deployment as successful
        if deployment:
            update_deployment(service_id, deployment["deploy_id"], {
                "status": "SUCCEEDED",
                "finished_at": datetime.utcnow().isoformat(),
            })
        
        # Update service as complete, including the function_name for usage tracking
        update_service(service_id, {
            "status": "LIVE",
            "function_url": function_url,
            "function_name": function_name,  # Store for usage aggregation
        })

        # Propagate new function_url to all custom domain items
        # Lambda@Edge reads function_url from DOMAIN items, so they must stay in sync
        try:
            from api.db.dynamodb import list_project_domains, update_domain
            custom_domains = list_project_domains(service_id)
            for domain_item in custom_domains:
                if domain_item.get("status") in ("ACTIVE", "PROVISIONING"):
                    update_domain(domain_item["domain"], {
                        "function_url": function_url,
                    })
                    print(f"  ↳ Updated domain {domain_item['domain']} function_url")
        except Exception as domain_err:
            print(f"⚠️ Failed to propagate function_url to domains: {domain_err}")

        # If the org is throttled, immediately throttle this new function too
        service_data = get_service(service_id)
        if service_data:
            org_id = service_data.get("organization_id")

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
            update_deployment(service_id, deployment["deploy_id"], {
                "status": "FAILED",
                "finished_at": datetime.utcnow().isoformat(),
            })
        
        update_service(service_id, {"status": "FAILED"})
        print(f"❌ Deployment failed: {e}")
        import traceback
        traceback.print_exc()


def send_deployment_to_sqs(
    service_id: str,
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
    # Legacy compat: callers may still pass project_id= keyword
    project_id: Optional[str] = None,
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

    # Legacy compat: allow callers to pass project_id= for now
    sid = service_id or project_id
    if not sid:
        raise ValueError("service_id is required")

    # Check if running on Lambda
    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        # Running locally - use thread pool fallback
        def run_in_thread():
            _run_deployment_sync(
                sid, github_url, github_token, root_directory, start_command,
                env_vars, memory, timeout, ephemeral_storage,
                commit_sha=commit_sha, commit_message=commit_message,
                commit_author_name=commit_author_name,
                commit_author_username=commit_author_username, branch=branch,
                org_id=org_id,
            )
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        print(f"📤 Local: Deployment started in background thread for service {sid}")
        return

    # Running on Lambda - send message to SQS queue
    sqs_client = boto3.client("sqs")

    # Get queue URL from environment
    queue_url = os.environ.get("DEPLOY_QUEUE_URL")
    if not queue_url:
        print("⚠️ DEPLOY_QUEUE_URL not set, falling back to thread-based execution")
        def run_in_thread():
            _run_deployment_sync(
                sid, github_url, github_token, root_directory, start_command,
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
        "service_id": sid,
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
        # Use service_id as MessageGroupId so each service gets its own deployment lane
        # This allows different services to deploy in parallel while maintaining strict
        # ordering within each service (industry-standard pattern for multi-tenant systems)
        MessageGroupId=sid,  # Required for FIFO queue - one lane per service
        MessageDeduplicationId=f"{sid}-{int(time.time())}",
    )
    
    print(f"📤 Deployment queued for service {sid}, MessageId: {response['MessageId']}")



# ─────────────────────────────────────────────────────────────
# DATABASE PROVISIONING (BACKGROUND TASK)
# ─────────────────────────────────────────────────────────────

# _normalize_serverless_v2_capacity is imported from deployer.aws.rds


def _run_database_provision_sync(
    service_id: str,
    db_name: str = "shorlabs",
    min_acu: float = 0,
    max_acu: float = 2,
):
    """Synchronous database provisioning - runs in thread pool or via SQS."""
    try:
        normalized_min_acu, normalized_max_acu = _normalize_serverless_v2_capacity(min_acu, max_acu)
        update_service(service_id, {"status": "PROVISIONING"})

        result = provision_database(
            project_id=service_id,
            db_name=db_name,
            min_acu=normalized_min_acu,
            max_acu=normalized_max_acu,
        )

        update_service(service_id, {
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
        update_service(service_id, {"status": "FAILED"})
        print(f"❌ Database provisioning failed: {e}")
        import traceback
        traceback.print_exc()


def send_database_provision_to_sqs(
    service_id: str,
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
            _run_database_provision_sync(service_id, db_name, normalized_min_acu, normalized_max_acu)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        print(f"📤 Local: Database provisioning started in background thread for service {service_id}")
        return

    # Running on Lambda - send message to SQS queue
    sqs_client = boto3.client("sqs")

    queue_url = os.environ.get("DEPLOY_QUEUE_URL")
    if not queue_url:
        print("⚠️ DEPLOY_QUEUE_URL not set, falling back to thread-based execution")
        def run_in_thread():
            _run_database_provision_sync(service_id, db_name, normalized_min_acu, normalized_max_acu)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        return

    message_body = {
        "message_type": "database_provision",
        "service_id": service_id,
        "db_name": db_name,
        "min_acu": normalized_min_acu,
        "max_acu": normalized_max_acu,
    }

    response = sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(message_body),
        MessageGroupId=service_id,
        MessageDeduplicationId=f"{service_id}-db-{int(time.time())}",
    )

    print(f"📤 Database provisioning queued for service {service_id}, MessageId: {response['MessageId']}")


# ─────────────────────────────────────────────────────────────
# DATABASE DELETION (BACKGROUND TASK)
# ─────────────────────────────────────────────────────────────


def _run_database_delete_sync(service_id: str):
    """Synchronous database deletion - runs in thread pool or via SQS."""
    try:
        result = delete_database_resources(service_id)
        print(f"✅ Database resources deleted for service {service_id}: {result}")

        # Now remove the DynamoDB record (service item)
        delete_service(service_id)
        print(f"✅ Service record deleted for {service_id}")

    except Exception as e:
        # Mark as FAILED so the user knows something went wrong
        update_service(service_id, {"status": "FAILED"})
        print(f"❌ Database deletion failed for {service_id}: {e}")
        import traceback
        traceback.print_exc()


def send_database_delete_to_sqs(service_id: str):
    """Send database deletion task to SQS queue for background processing."""
    import time

    # Check if running on Lambda
    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        # Running locally - use thread pool fallback
        def run_in_thread():
            _run_database_delete_sync(service_id)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        print(f"📤 Local: Database deletion started in background thread for service {service_id}")
        return

    # Running on Lambda - send message to SQS queue
    sqs_client = boto3.client("sqs")

    queue_url = os.environ.get("DEPLOY_QUEUE_URL")
    if not queue_url:
        print("⚠️ DEPLOY_QUEUE_URL not set, falling back to thread-based execution")
        def run_in_thread():
            _run_database_delete_sync(service_id)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        return

    message_body = {
        "message_type": "database_delete",
        "service_id": service_id,
    }

    response = sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(message_body),
        MessageGroupId=service_id,
        MessageDeduplicationId=f"{service_id}-delete-{int(time.time())}",
    )

    print(f"📤 Database deletion queued for service {service_id}, MessageId: {response['MessageId']}")


# ─────────────────────────────────────────────────────────────
# ECS DEPLOYMENT (BACKGROUND TASK)
# ─────────────────────────────────────────────────────────────


def _run_ecs_deployment_sync(
    service_id: str,
    github_url: str,
    github_token: Optional[str],
    root_directory: str = "./",
    start_command: str = "uvicorn main:app --host 0.0.0.0 --port 8080",
    env_vars: Optional[dict] = None,
    cpu: int = 2048,
    memory: int = 1024,
    commit_sha: Optional[str] = None,
    commit_message: Optional[str] = None,
    commit_author_name: Optional[str] = None,
    commit_author_username: Optional[str] = None,
    branch: Optional[str] = None,
    org_id: Optional[str] = None,
    instance_type: Optional[str] = None,
):
    """Synchronous ECS deployment function - runs in thread pool or via SQS."""
    from datetime import datetime

    deployment = None
    build_id_holder = [None]

    def on_build_start(build_id: str):
        nonlocal deployment
        build_id_holder[0] = build_id
        deployment = create_deployment(
            service_id, build_id,
            commit_sha=commit_sha,
            commit_message=commit_message,
            commit_author_name=commit_author_name,
            commit_author_username=commit_author_username,
            branch=branch,
        )
        print(f"📝 ECS deployment record created: {deployment['deploy_id']} (build: {build_id})")

    def on_status_change(status: str):
        update_service(service_id, {"status": status})

    try:
        codebuild_compute_type = "BUILD_GENERAL1_LARGE"
        if org_id:
            from api.lambda_warmer import _is_paid_org
            if not _is_paid_org(org_id):
                codebuild_compute_type = "BUILD_GENERAL1_SMALL"

        # Get subdomain from the service record
        svc = get_service(service_id)
        subdomain = svc.get("subdomain") if svc else None

        result = deploy_ecs_project(
            github_url=github_url,
            github_token=github_token,
            root_directory=root_directory,
            start_command=start_command,
            env_vars=env_vars,
            cpu=cpu,
            memory=memory,
            on_build_start=on_build_start,
            on_status_change=on_status_change,
            project_id=service_id,
            codebuild_compute_type=codebuild_compute_type,
            subdomain=subdomain,
            org_id=org_id,
            instance_type=instance_type,
        )

        if deployment:
            update_deployment(service_id, deployment["deploy_id"], {
                "status": "SUCCEEDED",
                "finished_at": datetime.utcnow().isoformat(),
            })

        update_service(service_id, {
            "status": "LIVE",
            "service_url": result["service_url"],
            "alb_dns_name": result.get("alb_dns_name"),
            "function_name": result.get("function_name"),
            "ecs_service_name": result.get("ecs_service_name"),
            "task_definition_arn": result.get("task_definition_arn"),
            "target_group_arn": result.get("target_group_arn"),
            "listener_rule_arn": result.get("listener_rule_arn"),
        })

        print(f"✅ ECS deployment complete: {result['service_url']}")

    except Exception as e:
        if deployment:
            update_deployment(service_id, deployment["deploy_id"], {
                "status": "FAILED",
                "finished_at": datetime.utcnow().isoformat(),
            })
        update_service(service_id, {"status": "FAILED"})
        print(f"❌ ECS deployment failed: {e}")
        traceback.print_exc()

        # Best-effort cleanup of partially created AWS resources to prevent
        # orphaned EC2 instances, ASGs, target groups, etc. from billing.
        print("🧹 Cleaning up orphaned resources from failed deployment...")
        try:
            # Derive project_name the same way the orchestrator does
            cleanup_function_name = f"{extract_project_name(github_url)}-{service_id[:8]}"
            delete_ecs_resources(
                github_url=github_url,
                function_name=cleanup_function_name,
                org_id=org_id,
            )
        except Exception as cleanup_err:
            print(f"⚠️ Cleanup failed (manual intervention may be needed): {cleanup_err}")


def send_ecs_deployment_to_sqs(
    service_id: str,
    github_url: str,
    github_token: Optional[str],
    root_directory: str = "./",
    start_command: str = "uvicorn main:app --host 0.0.0.0 --port 8080",
    env_vars: Optional[dict] = None,
    cpu: int = 2048,
    memory: int = 1024,
    commit_sha: Optional[str] = None,
    commit_message: Optional[str] = None,
    commit_author_name: Optional[str] = None,
    commit_author_username: Optional[str] = None,
    branch: Optional[str] = None,
    org_id: Optional[str] = None,
    instance_type: Optional[str] = None,
):
    """Send ECS deployment task to SQS queue for background processing."""
    import time

    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        def run_in_thread():
            _run_ecs_deployment_sync(
                service_id, github_url, github_token, root_directory, start_command,
                env_vars, cpu, memory,
                commit_sha=commit_sha, commit_message=commit_message,
                commit_author_name=commit_author_name,
                commit_author_username=commit_author_username, branch=branch,
                org_id=org_id, instance_type=instance_type,
            )
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        print(f"📤 Local: ECS deployment started in background thread for service {service_id}")
        return

    sqs_client = boto3.client("sqs")
    queue_url = os.environ.get("DEPLOY_QUEUE_URL")
    if not queue_url:
        def run_in_thread():
            _run_ecs_deployment_sync(
                service_id, github_url, github_token, root_directory, start_command,
                env_vars, cpu, memory,
                commit_sha=commit_sha, commit_message=commit_message,
                commit_author_name=commit_author_name,
                commit_author_username=commit_author_username, branch=branch,
                org_id=org_id, instance_type=instance_type,
            )
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        return

    message_body = {
        "message_type": "ecs_deploy",
        "service_id": service_id,
        "github_url": github_url,
        "github_token": github_token,
        "root_directory": root_directory,
        "start_command": start_command,
        "env_vars": env_vars or {},
        "cpu": cpu,
        "memory": memory,
        "commit_sha": commit_sha,
        "commit_message": commit_message,
        "commit_author_name": commit_author_name,
        "commit_author_username": commit_author_username,
        "branch": branch,
        "org_id": org_id,
        "instance_type": instance_type,
    }

    response = sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(message_body),
        MessageGroupId=service_id,
        MessageDeduplicationId=f"{service_id}-ecs-{int(time.time())}",
    )

    print(f"📤 ECS deployment queued for service {service_id}, MessageId: {response['MessageId']}")


def _run_ecs_delete_sync(service_id: str, org_id: Optional[str] = None):
    """Synchronous ECS service deletion."""
    try:
        svc = get_service(service_id)
        if not svc:
            print(f"⚠️ Service {service_id} not found for ECS deletion")
            return

        # Use org_id from param, fallback to service record
        effective_org_id = org_id or svc.get("organization_id")

        result = delete_ecs_resources(
            github_url=svc.get("github_url", ""),
            function_name=svc.get("function_name"),
            target_group_arn=svc.get("target_group_arn"),
            listener_rule_arn=svc.get("listener_rule_arn"),
            org_id=effective_org_id,
        )
        print(f"✅ ECS resources deleted for service {service_id}: {result}")

        delete_service(service_id)
        print(f"✅ Service record deleted for {service_id}")

    except Exception as e:
        update_service(service_id, {"status": "FAILED"})
        print(f"❌ ECS deletion failed for {service_id}: {e}")
        traceback.print_exc()


def send_ecs_delete_to_sqs(service_id: str, org_id: Optional[str] = None):
    """Send ECS deletion task to SQS queue for background processing."""
    import time

    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        def run_in_thread():
            _run_ecs_delete_sync(service_id, org_id=org_id)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        return

    sqs_client = boto3.client("sqs")
    queue_url = os.environ.get("DEPLOY_QUEUE_URL")
    if not queue_url:
        def run_in_thread():
            _run_ecs_delete_sync(service_id, org_id=org_id)
        thread = threading.Thread(target=run_in_thread)
        thread.start()
        return

    message_body = {
        "message_type": "ecs_delete",
        "service_id": service_id,
        "org_id": org_id,
    }

    response = sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(message_body),
        MessageGroupId=service_id,
        MessageDeduplicationId=f"{service_id}-ecs-delete-{int(time.time())}",
    )

    print(f"📤 ECS deletion queued for service {service_id}, MessageId: {response['MessageId']}")


# ─────────────────────────────────────────────────────────────
# API ENDPOINTS
# ─────────────────────────────────────────────────────────────


@router.post("")
async def create_new_project(
    request: CreateProjectRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Create a new project container with an initial web-app service."""
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

    # 1. Create project container (auto-generated name)
    project = create_project(
        user_id=user_id,
        organization_id=request.organization_id,
        name=generate_project_name(),
        description=request.description or "",
    )

    # 2. Create web-app service inside the project (user-provided name)
    service = create_service(
        user_id=user_id,
        organization_id=request.organization_id,
        project_id=project["project_id"],
        name=request.name,
        service_type="web-app",
        github_url=github_url,
        github_repo=request.github_repo,
        env_vars=request.env_vars,
        root_directory=root_directory,
        start_command=request.start_command,
        memory=memory,
        timeout=timeout,
        ephemeral_storage=ephemeral_storage,
    )

    # 3. Start deployment via SQS queue
    send_deployment_to_sqs(
        service["service_id"],
        github_url,
        github_token,
        root_directory,
        request.start_command,
        request.env_vars,
        memory,
        timeout,
        ephemeral_storage,
        **commit_info,
        org_id=request.organization_id,
    )
    
    return {
        "project_id": project["project_id"],
        "service_id": service["service_id"],
        "organization_id": project.get("organization_id"),
        "name": project["name"],
        "service_type": "web-app",
        "status": service["status"],
        "subdomain": service.get("subdomain"),
        "custom_url": service.get("custom_url"),
    }


@router.post("/blank")
async def create_blank_project(
    request: CreateBlankProjectRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Create a blank project container — no services, no deployment."""
    if not request.organization_id or not request.organization_id.strip():
        raise HTTPException(status_code=400, detail="organization_id is required")

    project = create_project(
        user_id=user_id,
        organization_id=request.organization_id,
        name=generate_project_name(),
        description=request.description or "",
    )

    return {
        "project_id": project["project_id"],
        "organization_id": project.get("organization_id"),
        "name": project["name"],
    }


@router.post("/database")
async def create_database_project(
    request: CreateDatabaseProjectRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Create a new project container with an initial database service."""
    if not request.organization_id or not request.organization_id.strip():
        raise HTTPException(status_code=400, detail="organization_id is required")

    normalized_min_acu, normalized_max_acu = _normalize_serverless_v2_capacity(
        request.min_acu if request.min_acu is not None else 0,
        request.max_acu if request.max_acu is not None else 2,
    )

    # 1. Create project container (auto-generated name)
    project = create_project(
        user_id=user_id,
        organization_id=request.organization_id,
        name=generate_project_name(),
        description=request.description or "",
    )

    # 2. Create database service inside the project (user-provided name)
    service = create_service(
        user_id=user_id,
        organization_id=request.organization_id,
        project_id=project["project_id"],
        name=request.name,
        service_type="database",
        db_name=request.db_name,
        min_acu=normalized_min_acu,
        max_acu=normalized_max_acu,
    )

    # 3. Start provisioning via SQS queue
    send_database_provision_to_sqs(
        service["service_id"],
        request.db_name,
        normalized_min_acu,
        normalized_max_acu,
    )

    return {
        "project_id": project["project_id"],
        "service_id": service["service_id"],
        "organization_id": project.get("organization_id"),
        "name": project["name"],
        "service_type": "database",
        "status": service["status"],
    }


@router.post("/web-service")
async def create_web_service_project(
    request: CreateWebServiceProjectRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Create a new project container with an initial web-service (ECS) service."""
    from api.routes.github import get_or_refresh_token, fetch_latest_commit

    if not request.organization_id or not request.organization_id.strip():
        raise HTTPException(status_code=400, detail="organization_id is required")

    # Plan gate: web-service requires Plus or Pro plan
    from api.lambda_warmer import _is_paid_org
    if not _is_paid_org(request.organization_id):
        raise HTTPException(status_code=403, detail="Web Service requires a Plus or Pro plan")

    github_url = f"https://github.com/{request.github_repo}"
    github_token = await get_or_refresh_token(request.organization_id, user_id)

    commit_info = {}
    if github_token:
        commit_info = await fetch_latest_commit(github_token, request.github_repo)

    root_directory = request.root_directory or "./"
    cpu = request.cpu or 2048
    memory = request.memory or 1024

    # 1. Create project container
    project = create_project(
        user_id=user_id,
        organization_id=request.organization_id,
        name=generate_project_name(),
        description=request.description or "",
    )

    # 2. Create web-service inside the project
    service = create_service(
        user_id=user_id,
        organization_id=request.organization_id,
        project_id=project["project_id"],
        name=request.name,
        service_type="web-service",
        github_url=github_url,
        github_repo=request.github_repo,
        env_vars=request.env_vars,
        root_directory=root_directory,
        start_command=request.start_command,
        cpu=cpu,
        memory=memory,
    )

    # 3. Start ECS deployment via SQS
    send_ecs_deployment_to_sqs(
        service["service_id"],
        github_url,
        github_token,
        root_directory,
        request.start_command,
        request.env_vars,
        cpu,
        memory,
        **commit_info,
        org_id=request.organization_id,
    )

    return {
        "project_id": project["project_id"],
        "service_id": service["service_id"],
        "organization_id": project.get("organization_id"),
        "name": project["name"],
        "service_type": "web-service",
        "status": service["status"],
        "subdomain": service.get("subdomain"),
        "custom_url": service.get("custom_url"),
    }


@router.post("/{project_id}/services")
async def add_service_to_project(
    project_id: str,
    request: AddServiceRequest,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Add a new service (web-app, database, or web-service) to an existing project."""
    project = get_project_by_key(org_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if request.service_type == "database":
        normalized_min_acu, normalized_max_acu = _normalize_serverless_v2_capacity(
            request.min_acu if request.min_acu is not None else 0,
            request.max_acu if request.max_acu is not None else 2,
        )
        service = create_service(
            user_id=user_id,
            organization_id=org_id,
            project_id=project_id,
            name=request.name,
            service_type="database",
            db_name=request.db_name,
            min_acu=normalized_min_acu,
            max_acu=normalized_max_acu,
        )
        send_database_provision_to_sqs(
            service["service_id"],
            request.db_name,
            normalized_min_acu,
            normalized_max_acu,
        )
    elif request.service_type == "web-service":
        # Plan gate: web-service requires Plus or Pro plan
        from api.lambda_warmer import _is_paid_org
        if not _is_paid_org(org_id):
            raise HTTPException(status_code=403, detail="Web Service requires a Plus or Pro plan")

        from api.routes.github import get_or_refresh_token, fetch_latest_commit
        if not request.github_repo:
            raise HTTPException(status_code=400, detail="github_repo is required for web-service")
        github_url = f"https://github.com/{request.github_repo}"
        github_token = await get_or_refresh_token(org_id, user_id)
        commit_info = {}
        if github_token:
            commit_info = await fetch_latest_commit(github_token, request.github_repo)

        cpu = request.cpu or 2048
        memory = request.memory or 1024

        service = create_service(
            user_id=user_id,
            organization_id=org_id,
            project_id=project_id,
            name=request.name,
            service_type="web-service",
            github_url=github_url,
            github_repo=request.github_repo,
            env_vars=request.env_vars,
            root_directory=request.root_directory or "./",
            start_command=request.start_command,
            cpu=cpu,
            memory=memory,
        )
        send_ecs_deployment_to_sqs(
            service["service_id"],
            github_url,
            github_token,
            request.root_directory or "./",
            request.start_command,
            request.env_vars,
            cpu,
            memory,
            **commit_info,
            org_id=org_id,
        )
    else:
        from api.routes.github import get_or_refresh_token, fetch_latest_commit
        if not request.github_repo:
            raise HTTPException(status_code=400, detail="github_repo is required for web-app services")
        github_url = f"https://github.com/{request.github_repo}"
        github_token = await get_or_refresh_token(org_id, user_id)
        commit_info = {}
        if github_token:
            commit_info = await fetch_latest_commit(github_token, request.github_repo)

        service = create_service(
            user_id=user_id,
            organization_id=org_id,
            project_id=project_id,
            name=request.name,
            service_type="web-app",
            github_url=github_url,
            github_repo=request.github_repo,
            env_vars=request.env_vars,
            root_directory=request.root_directory or "./",
            start_command=request.start_command,
            memory=request.memory or 1024,
            timeout=request.timeout or 30,
            ephemeral_storage=request.ephemeral_storage or 512,
        )
        send_deployment_to_sqs(
            service["service_id"],
            github_url,
            github_token,
            request.root_directory or "./",
            request.start_command,
            request.env_vars,
            request.memory or 1024,
            request.timeout or 30,
            request.ephemeral_storage or 512,
            **commit_info,
            org_id=org_id,
        )

    return {
        "project_id": project_id,
        "service_id": service["service_id"],
        "name": service["name"],
        "service_type": service["service_type"],
        "status": service["status"],
    }


@router.get("")
async def get_projects(
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """List all projects for the organization, each with its services."""
    projects = list_projects(org_id)

    # Check org-level throttle state (single lookup for all projects)
    from api.db.dynamodb import get_throttle_state, list_project_domains
    throttle_state = get_throttle_state(org_id)
    is_throttled = bool(throttle_state and throttle_state.get("is_throttled"))

    result = []
    for p in projects:
        pid = p["project_id"]
        services = list_services(pid, org_id=org_id)

        services_summary = []
        for svc in services:
            svc_data = {
                "service_id": svc["service_id"],
                "name": svc["name"],
                "service_type": svc.get("service_type", "web-app"),
                "status": svc["status"],
            }
            svc_type = svc.get("service_type", "web-app")
            if svc_type == "database":
                pass  # handled below
            elif svc_type == "web-service":
                svc_domains = list_project_domains(svc["service_id"])
                active_domain = next(
                    (d["domain"] for d in svc_domains if d.get("status") == "ACTIVE"),
                    None,
                )
                svc_data.update({
                    "subdomain": svc.get("subdomain"),
                    "custom_url": svc.get("custom_url"),
                    "service_url": svc.get("service_url"),
                    "active_custom_domain": active_domain,
                    "github_repo": svc.get("github_repo"),
                })
            else:
                svc_domains = list_project_domains(svc["service_id"])
                active_domain = next(
                    (d["domain"] for d in svc_domains if d.get("status") == "ACTIVE"),
                    None,
                )
                svc_data.update({
                    "subdomain": svc.get("subdomain"),
                    "custom_url": svc.get("custom_url"),
                    "function_url": svc.get("function_url"),
                    "active_custom_domain": active_domain,
                    "github_repo": svc.get("github_repo"),
                })
            if svc_type == "database":
                svc_data.update({
                    "db_endpoint": svc.get("db_endpoint"),
                    "db_port": svc.get("db_port"),
                    "db_name": svc.get("db_name"),
                })
            services_summary.append(svc_data)

        project_data = {
            "project_id": pid,
            "organization_id": p.get("organization_id"),
            "name": p["name"],
            "description": p.get("description", ""),
            "created_at": p["created_at"],
            "updated_at": p["updated_at"],
            "is_throttled": is_throttled,
            "services": services_summary,
        }

        result.append(project_data)

    return result


@router.get("/{project_id}")
async def get_project_details(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Get project container with all its services and their details."""

    project = get_project_by_key(org_id, project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from api.db.dynamodb import get_throttle_state, list_project_domains
    throttle_state = get_throttle_state(org_id)
    is_throttled = bool(throttle_state and throttle_state.get("is_throttled"))

    # Get all services for this project
    services = list_services(project_id, org_id=org_id)

    services_response = []
    for svc in services:
        sid = svc["service_id"]
        svc_type = svc.get("service_type", "web-app")

        svc_response = {
            "service_id": sid,
            "project_id": project_id,
            "name": svc["name"],
            "service_type": svc_type,
            "status": svc["status"],
            "created_at": svc["created_at"],
            "updated_at": svc["updated_at"],
        }

        if svc_type == "database":
            svc_response.update({
                "db_cluster_identifier": svc.get("db_cluster_identifier"),
                "db_endpoint": svc.get("db_endpoint"),
                "db_port": svc.get("db_port"),
                "db_name": svc.get("db_name"),
                "db_master_username": svc.get("db_master_username"),
                "min_acu": svc.get("min_acu"),
                "max_acu": svc.get("max_acu"),
            })
            svc_response["deployments"] = []
            svc_response["custom_domains"] = []
        elif svc_type == "web-service":
            svc_response.update({
                "github_url": svc.get("github_url"),
                "github_repo": svc.get("github_repo"),
                "service_url": svc.get("service_url"),
                "subdomain": svc.get("subdomain"),
                "custom_url": svc.get("custom_url"),
                "ecr_repo": svc.get("ecr_repo"),
                "env_vars": svc.get("env_vars", {}),
                "start_command": svc.get("start_command", ""),
                "root_directory": svc.get("root_directory", "./"),
                "cpu": svc.get("cpu", 2048),
                "memory": svc.get("memory", 1024),
                "ecs_service_name": svc.get("ecs_service_name"),
            })

            deployments = list_deployments(sid)
            custom_domains = list_project_domains(sid)

            svc_response["deployments"] = [
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
            ]
            svc_response["custom_domains"] = [
                {
                    "domain": d.get("domain"),
                    "status": d.get("status"),
                    "is_active": d.get("status") == "ACTIVE",
                    "tenant_id": d.get("tenant_id"),
                    "created_at": d.get("created_at"),
                }
                for d in custom_domains
            ]
        else:
            svc_response.update({
                "github_url": svc.get("github_url"),
                "github_repo": svc.get("github_repo"),
                "function_url": svc.get("function_url"),
                "subdomain": svc.get("subdomain"),
                "custom_url": svc.get("custom_url"),
                "ecr_repo": svc.get("ecr_repo"),
                "env_vars": svc.get("env_vars", {}),
                "start_command": svc.get("start_command", ""),
                "root_directory": svc.get("root_directory", "./"),
                "memory": svc.get("memory", 1024),
                "timeout": svc.get("timeout", 30),
                "ephemeral_storage": svc.get("ephemeral_storage", 512),
                "is_throttled": is_throttled,
            })

            deployments = list_deployments(sid)
            custom_domains = list_project_domains(sid)

            svc_response["deployments"] = [
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
            ]
            svc_response["custom_domains"] = [
                {
                    "domain": d.get("domain"),
                    "status": d.get("status"),
                    "is_active": d.get("status") == "ACTIVE",
                    "tenant_id": d.get("tenant_id"),
                    "created_at": d.get("created_at"),
                }
                for d in custom_domains
            ]

        services_response.append(svc_response)

    return {
        "project": {
            "project_id": project["project_id"],
            "organization_id": project.get("organization_id"),
            "name": project["name"],
            "description": project.get("description", ""),
            "created_at": project["created_at"],
            "updated_at": project["updated_at"],
            "is_throttled": is_throttled,
        },
        "services": services_response,
    }


def _resolve_service(org_id: str, project_id: str, service_id: str = None, service_type: str = None) -> dict:
    """Resolve a service from project_id and optional service_id.

    For backward compatibility: if no service_id is given, returns the first
    (or only) service under the project, optionally filtered by type.
    """
    if service_id:
        svc = get_service_by_key(org_id, project_id, service_id)
        if not svc:
            raise HTTPException(status_code=404, detail="Service not found")
        return svc

    services = list_services(project_id, org_id=org_id)
    if service_type:
        services = [s for s in services if s.get("service_type") == service_type]
    if not services:
        raise HTTPException(status_code=404, detail="No matching service found")
    return services[0]


@router.get("/{project_id}/status")
async def get_project_status(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    service_id: Optional[str] = Query(None),
):
    """Get current service status (for polling)."""
    if service_id:
        svc = _resolve_service(org_id, project_id, service_id)
    else:
        # Backward compat: return first service status
        svc = _resolve_service(org_id, project_id)

    return {
        "project_id": project_id,
        "service_id": svc.get("service_id"),
        "status": svc["status"],
        "function_url": svc.get("function_url"),
    }


@router.get("/{project_id}/connection")
async def get_database_connection(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    service_id: Optional[str] = Query(None),
):
    """Get connection details for a database service."""
    svc = _resolve_service(org_id, project_id, service_id, service_type="database")

    cluster_id = svc.get("db_cluster_identifier")
    if not cluster_id:
        raise HTTPException(status_code=404, detail="Database not yet provisioned")

    credentials = get_cluster_secret(cluster_id)

    endpoint = svc["db_endpoint"]
    port = int(svc.get("db_port", 5432))
    db_name = svc["db_name"]
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


@router.get("/{project_id}/cluster-status")
async def get_cluster_status_endpoint(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    service_id: Optional[str] = Query(None),
):
    """Get live Aurora cluster status (available, modifying, etc.)."""
    svc = _resolve_service(org_id, project_id, service_id, service_type="database")

    cluster_id = svc.get("db_cluster_identifier")
    if not cluster_id:
        raise HTTPException(status_code=404, detail="Database not yet provisioned")

    from deployer.aws.rds import get_cluster_status
    cluster_info = get_cluster_status(cluster_id)
    if not cluster_info:
        raise HTTPException(status_code=404, detail="Cluster not found")

    return {
        "cluster_identifier": cluster_id,
        "status": cluster_info["status"],
    }


# ─────────────────────────────────────────────────────────────
# DATABASE EXPLORER ENDPOINTS
# ─────────────────────────────────────────────────────────────


def _get_live_database_service(org_id: str, project_id: str, service_id: str = None) -> dict:
    """Shared validation for explorer endpoints."""
    svc = _resolve_service(org_id, project_id, service_id, service_type="database")
    cluster_id = svc.get("db_cluster_identifier")
    if not cluster_id or svc.get("status") != "LIVE":
        raise HTTPException(status_code=400, detail="Database not available")
    return svc


@router.get("/{project_id}/database/schemas")
async def get_database_schemas(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """List all schemas in the user's database."""
    svc = _get_live_database_service(org_id, project_id)
    try:
        schemas = pg_list_schemas(
            cluster_identifier=svc["db_cluster_identifier"],
            db_name=svc["db_name"],
            port=int(svc.get("db_port", 5432)),
            endpoint=svc["db_endpoint"],
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
    svc = _get_live_database_service(org_id, project_id)
    try:
        tables = pg_list_tables(
            cluster_identifier=svc["db_cluster_identifier"],
            db_name=svc["db_name"],
            port=int(svc.get("db_port", 5432)),
            endpoint=svc["db_endpoint"],
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
    svc = _get_live_database_service(org_id, project_id)
    try:
        columns = pg_get_columns(
            cluster_identifier=svc["db_cluster_identifier"],
            db_name=svc["db_name"],
            port=int(svc.get("db_port", 5432)),
            endpoint=svc["db_endpoint"],
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
    svc = _get_live_database_service(org_id, project_id)
    try:
        result = pg_get_table_data(
            cluster_identifier=svc["db_cluster_identifier"],
            db_name=svc["db_name"],
            port=int(svc.get("db_port", 5432)),
            endpoint=svc["db_endpoint"],
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
# DATABASE TABLE MANAGEMENT ENDPOINTS
# ─────────────────────────────────────────────────────────────


class ColumnDefinition(BaseModel):
    name: str
    type: str
    nullable: bool = True
    default: Optional[str] = None
    is_primary_key: bool = False


class CreateTableRequest(BaseModel):
    table_name: str
    columns: list[ColumnDefinition]


class AddColumnRequest(BaseModel):
    name: str
    type: str
    nullable: bool = True
    default: Optional[str] = None


class AlterColumnRequest(BaseModel):
    type: Optional[str] = None
    nullable: Optional[bool] = None
    default: Optional[str] = None
    new_name: Optional[str] = None


class RenameTableRequest(BaseModel):
    new_name: str


@router.post("/{project_id}/database/tables")
async def create_database_table(
    project_id: str,
    request: CreateTableRequest,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    schema: str = Query(default="public"),
):
    """Create a new table in the database."""
    svc = _get_live_database_service(org_id, project_id)
    try:
        result = pg_create_table(
            cluster_identifier=svc["db_cluster_identifier"],
            db_name=svc["db_name"],
            port=int(svc.get("db_port", 5432)),
            endpoint=svc["db_endpoint"],
            schema=schema,
            table_name=request.table_name,
            columns=[col.model_dump() for col in request.columns],
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create table: {str(e)}")


@router.delete("/{project_id}/database/tables/{table_name}")
async def delete_database_table(
    project_id: str,
    table_name: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    schema: str = Query(default="public"),
):
    """Drop a table from the database."""
    svc = _get_live_database_service(org_id, project_id)
    try:
        result = pg_drop_table(
            cluster_identifier=svc["db_cluster_identifier"],
            db_name=svc["db_name"],
            port=int(svc.get("db_port", 5432)),
            endpoint=svc["db_endpoint"],
            schema=schema,
            table_name=table_name,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to drop table: {str(e)}")


@router.put("/{project_id}/database/tables/{table_name}/rename")
async def rename_database_table(
    project_id: str,
    table_name: str,
    request: RenameTableRequest,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    schema: str = Query(default="public"),
):
    """Rename a table."""
    svc = _get_live_database_service(org_id, project_id)
    try:
        result = pg_rename_table(
            cluster_identifier=svc["db_cluster_identifier"],
            db_name=svc["db_name"],
            port=int(svc.get("db_port", 5432)),
            endpoint=svc["db_endpoint"],
            schema=schema,
            old_name=table_name,
            new_name=request.new_name,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rename table: {str(e)}")


@router.post("/{project_id}/database/tables/{table_name}/columns")
async def add_database_column(
    project_id: str,
    table_name: str,
    request: AddColumnRequest,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    schema: str = Query(default="public"),
):
    """Add a column to an existing table."""
    svc = _get_live_database_service(org_id, project_id)
    try:
        result = pg_add_column(
            cluster_identifier=svc["db_cluster_identifier"],
            db_name=svc["db_name"],
            port=int(svc.get("db_port", 5432)),
            endpoint=svc["db_endpoint"],
            schema=schema,
            table_name=table_name,
            column=request.model_dump(),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add column: {str(e)}")


@router.put("/{project_id}/database/tables/{table_name}/columns/{column_name}")
async def alter_database_column(
    project_id: str,
    table_name: str,
    column_name: str,
    request: AlterColumnRequest,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    schema: str = Query(default="public"),
):
    """Alter a column in a table."""
    svc = _get_live_database_service(org_id, project_id)
    changes = {k: v for k, v in request.model_dump().items() if v is not None}
    if not changes:
        raise HTTPException(status_code=400, detail="No changes specified")
    try:
        result = pg_alter_column(
            cluster_identifier=svc["db_cluster_identifier"],
            db_name=svc["db_name"],
            port=int(svc.get("db_port", 5432)),
            endpoint=svc["db_endpoint"],
            schema=schema,
            table_name=table_name,
            column_name=column_name,
            changes=changes,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to alter column: {str(e)}")


@router.delete("/{project_id}/database/tables/{table_name}/columns/{column_name}")
async def delete_database_column(
    project_id: str,
    table_name: str,
    column_name: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    schema: str = Query(default="public"),
):
    """Drop a column from a table."""
    svc = _get_live_database_service(org_id, project_id)
    try:
        result = pg_drop_column(
            cluster_identifier=svc["db_cluster_identifier"],
            db_name=svc["db_name"],
            port=int(svc.get("db_port", 5432)),
            endpoint=svc["db_endpoint"],
            schema=schema,
            table_name=table_name,
            column_name=column_name,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to drop column: {str(e)}")


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


def _get_sg_ids_for_service(svc: dict) -> list[str]:
    """Get all VPC security group IDs attached to the service's cluster."""
    print(f"🔎 SG LOOKUP: cluster={svc.get('db_cluster_identifier')} service_id={svc.get('service_id')}")
    sg_ids = get_cluster_security_group_ids(svc["db_cluster_identifier"])
    print(f"🔎 SG LOOKUP RESULT: cluster={svc.get('db_cluster_identifier')} sg_ids={sg_ids}")
    if not sg_ids:
        raise HTTPException(status_code=404, detail="No security group found for this database")
    return sg_ids


def _get_primary_sg_id_for_service(svc: dict) -> str:
    """Primary SG for add operations."""
    return _get_sg_ids_for_service(svc)[0]


@router.get("/{project_id}/database/security-rules")
async def get_database_security_rules(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Get inbound and outbound security group rules for this database."""
    svc = _get_live_database_service(org_id, project_id)
    debug_ctx = _security_debug_context(org_id, project_id, project=svc)
    print(f"🛡️ SECURITY RULES GET START: {debug_ctx}")
    try:
        sg_ids = _get_sg_ids_for_service(svc)
        inbound = []
        outbound = []
        for sg_id in sg_ids:
            rules = get_security_group_rules(sg_id)
            inbound.extend(rules.get("inbound", []))
            outbound.extend(rules.get("outbound", []))
        debug_ctx = _security_debug_context(org_id, project_id, project=svc, sg_id=sg_ids[0])
        rules = {
            "security_group_id": sg_ids[0],
            "inbound": inbound,
            "outbound": outbound,
        }
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

    svc = _get_live_database_service(org_id, project_id)
    sg_id = _get_primary_sg_id_for_service(svc)
    debug_ctx = _security_debug_context(org_id, project_id, project=svc, sg_id=sg_id)
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

    svc = _get_live_database_service(org_id, project_id)
    sg_ids = _get_sg_ids_for_service(svc)
    debug_ctx = _security_debug_context(org_id, project_id, project=svc, sg_id=sg_ids[0])
    print(f"🛡️ SECURITY RULES DELETE START: {debug_ctx} rule_id={rule_id} direction={direction} sg_ids={sg_ids}")

    if direction not in ("inbound", "outbound"):
        raise HTTPException(status_code=400, detail="direction must be 'inbound' or 'outbound'")

    # Find which attached SG actually owns this rule.
    owner_sg_id = None
    for sg_id in sg_ids:
        rules_data = get_security_group_rules(sg_id)
        rule_list = rules_data["inbound"] if direction == "inbound" else rules_data["outbound"]
        if any(r["rule_id"] == rule_id for r in rule_list):
            owner_sg_id = sg_id
            break
    if not owner_sg_id:
        raise HTTPException(status_code=404, detail="Rule not found in this database security groups")

    ec2 = get_ec2_client()
    try:
        if direction == "inbound":
            ec2.revoke_security_group_ingress(GroupId=owner_sg_id, SecurityGroupRuleIds=[rule_id])
        else:
            ec2.revoke_security_group_egress(GroupId=owner_sg_id, SecurityGroupRuleIds=[rule_id])
        print(
            f"🛡️ SECURITY RULES DELETE SUCCESS: {debug_ctx} rule_id={rule_id} "
            f"direction={direction} owner_sg_id={owner_sg_id}"
        )
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
    service_id: Optional[str] = Query(None),
):
    """Fetch runtime logs for a service (Lambda web-app or ECS web-service)."""
    # Resolve service without forcing type — so it works for both web-app and web-service
    if service_id:
        svc = _resolve_service(org_id, project_id, service_id)
    else:
        # Try web-app first (legacy default), fall back to web-service
        try:
            svc = _resolve_service(org_id, project_id, service_type="web-app")
        except HTTPException:
            svc = _resolve_service(org_id, project_id, service_type="web-service")

    svc_type = svc.get("service_type", "web-app")
    function_name = svc.get("function_name")
    print(f"🔍 RUNTIME LOGS: service_id={svc.get('service_id')} service_type={svc_type}")
    print(f"🔍 RUNTIME LOGS: function_name from DB = '{function_name}'")

    if svc_type == "web-service":
        # ECS services: logs live in /ecs/<service-prefix>-<project_name>
        # function_name stores the project_name used when registering the task definition
        project_name = function_name or extract_project_name(svc.get("github_url", ""))
        print(f"🔍 RUNTIME LOGS (ECS): project_name = '{project_name}'")
        logs = get_ecs_logs(project_name)
        print(f"🔍 RUNTIME LOGS (ECS): got {len(logs)} log entries")
        return {
            "logs": logs,
            "function_name": project_name,
        }
    else:
        # Lambda web-app services
        if not function_name:
            function_name = extract_project_name(svc["github_url"])
            print(f"🔍 RUNTIME LOGS: derived function_name = '{function_name}'")
        logs = get_lambda_logs(function_name)
        print(f"🔍 RUNTIME LOGS: got {len(logs)} log entries")
        return {
            "logs": logs,
            "function_name": function_name,
        }


class UpdateEnvVarsRequest(BaseModel):
    env_vars: dict


@router.put("/{project_id}/env-vars")
async def update_project_env_vars(
    project_id: str,
    request: UpdateEnvVarsRequest,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    service_id: Optional[str] = Query(None),
):
    """Update service environment variables."""
    svc = _resolve_service(org_id, project_id, service_id)
    
    updated = update_service(svc["service_id"], {"env_vars": request.env_vars})
    
    return {
        "project_id": project_id,
        "service_id": svc["service_id"],
        "env_vars": updated.get("env_vars", {}),
        "message": "Environment variables updated. Redeploy to apply changes.",
    }


class UpdateServiceRequest(BaseModel):
    start_command: Optional[str] = None
    root_directory: Optional[str] = None
    name: Optional[str] = None
    memory: Optional[int] = None
    timeout: Optional[int] = None
    ephemeral_storage: Optional[int] = None
    cpu: Optional[int] = None
    max_acu: Optional[float] = None


@router.patch("/{project_id}")
async def update_project_fields(
    project_id: str,
    request: UpdateServiceRequest,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    service_id: Optional[str] = Query(None),
):
    """Update service fields like start_command, root_directory, name, max_acu."""
    svc = _resolve_service(org_id, project_id, service_id)

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
    if request.cpu is not None:
        updates["cpu"] = request.cpu
    if request.max_acu is not None:
        from decimal import Decimal
        updates["max_acu"] = Decimal(str(request.max_acu))

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # For database max_acu changes, modify the Aurora cluster BEFORE writing to DynamoDB
    # so that on failure the stored value stays consistent with the actual cluster state.
    if request.max_acu is not None and svc.get("service_type") == "database":
        cluster_id = svc.get("db_cluster_identifier")
        if cluster_id and svc.get("status") == "LIVE":
            from deployer.aws.rds import get_cluster_status
            cluster_info = get_cluster_status(cluster_id)
            if cluster_info and cluster_info.get("status") != "available":
                raise HTTPException(
                    status_code=409,
                    detail=f"Cluster is currently {cluster_info.get('status')}. Please wait and try again.",
                )
            try:
                modify_aurora_cluster_scaling(
                    cluster_identifier=cluster_id,
                    min_acu=0,
                    max_acu=request.max_acu,
                )
            except Exception as e:
                print(f"⚠️ Failed to modify cluster scaling: {e}")
                traceback.print_exc()
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to apply scaling to cluster: {str(e)}",
                )

    updated = update_service(svc["service_id"], updates)

    return {
        "project_id": project_id,
        "service_id": svc["service_id"],
        "updated_fields": list(updates.keys()),
        "message": "Service updated." + (" Redeploy to apply changes." if svc.get("service_type") != "database" else ""),
    }


@router.post("/{project_id}/redeploy")
async def redeploy_project(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
    service_id: Optional[str] = Query(None),
):
    """Trigger a redeployment of a web-app or web-service."""
    from api.routes.github import get_or_refresh_token, fetch_latest_commit

    # Try to resolve by service_id first, then by type
    if service_id:
        svc = _resolve_service(org_id, project_id, service_id)
    else:
        # Try web-app first, then web-service
        try:
            svc = _resolve_service(org_id, project_id, service_type="web-app")
        except HTTPException:
            svc = _resolve_service(org_id, project_id, service_type="web-service")

    sid = svc["service_id"]
    svc_type = svc.get("service_type", "web-app")

    update_service(sid, {"status": "PENDING"})

    github_token = await get_or_refresh_token(org_id, user_id)

    commit_info = {}
    if github_token:
        commit_info = await fetch_latest_commit(github_token, svc.get("github_repo", ""))

    root_directory = svc.get("root_directory", "./")
    start_command = svc.get("start_command", "uvicorn main:app --host 0.0.0.0 --port 8080")
    env_vars = svc.get("env_vars", {})

    if svc_type == "web-service":
        cpu = int(svc.get("cpu", 2048))
        memory = int(svc.get("memory", 1024))
        send_ecs_deployment_to_sqs(
            sid,
            svc["github_url"],
            github_token,
            root_directory,
            start_command,
            env_vars,
            cpu,
            memory,
            **commit_info,
            org_id=org_id,
        )
    else:
        memory = int(svc.get("memory", 1024))
        timeout = int(svc.get("timeout", 30))
        ephemeral_storage = int(svc.get("ephemeral_storage", 512))
        send_deployment_to_sqs(
            sid,
            svc["github_url"],
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
        "service_id": sid,
        "message": "Redeployment started",
        "status": "PENDING",
    }


def _delete_single_service(svc: dict):
    """Shared helper: delete one service and its AWS resources."""
    sid = svc["service_id"]
    svc_type = svc.get("service_type", "web-app")

    if svc_type == "database":
        update_service(sid, {"status": "DELETING"})
        send_database_delete_to_sqs(sid)
        return "async"
    elif svc_type == "web-service":
        update_service(sid, {"status": "DELETING"})
        send_ecs_delete_to_sqs(sid, org_id=svc.get("organization_id"))
        return "async"
    else:
        function_name = svc.get("function_name")
        print(f"🗑️ DELETE SERVICE: service_id={sid}, function_name='{function_name}'")

        from api.db.dynamodb import list_project_domains
        from api.services.domain_service import delete_domain_tenant
        custom_domains = list_project_domains(sid)
        for d in custom_domains:
            tenant_id = d.get("tenant_id")
            if tenant_id:
                delete_domain_tenant(tenant_id)

        delete_project_resources(svc.get("github_url", ""), function_name=function_name)
        delete_service(sid)
        return "sync"


@router.delete("/{project_id}/services/{service_id}")
async def delete_service_endpoint(
    project_id: str,
    service_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Delete a single service from a project (without deleting the project itself)."""
    from fastapi.responses import JSONResponse

    svc = get_service_by_key(org_id, project_id, service_id)
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    print(f"🗑️ DELETE SERVICE: project_id={project_id}, service_id={service_id}")

    mode = _delete_single_service(svc)

    if mode == "async":
        return JSONResponse(
            status_code=202,
            content={
                "deleted": False,
                "status": "DELETING",
                "service_id": service_id,
                "message": "Database deletion initiated",
            },
        )

    return {
        "deleted": True,
        "service_id": service_id,
        "project_id": project_id,
    }


@router.delete("/{project_id}")
async def delete_project_endpoint(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    org_id: str = Query(...),
):
    """Delete a project and all its services + associated AWS resources."""

    project = get_project_by_key(org_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    print(f"🗑️ DELETE PROJECT: project_id={project_id}")

    services = list_services(project_id, org_id=org_id)
    for svc in services:
        _delete_single_service(svc)

    # Delete the project container itself
    delete_project(project_id)

    return {
        "deleted": True,
        "project_id": project_id,
        "services_deleted": len(services),
    }

