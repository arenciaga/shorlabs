"""
Fargate Deployment Orchestrator

Main deployment logic for ECS Fargate services (WebSocket/persistent connection workloads).
Mirrors orchestrator.py but deploys to Fargate instead of Lambda.
"""

from typing import Optional

from .utils import extract_project_name
from .utils import detect_runtime_from_github
from .aws import (
    create_ecr_repository,
    get_or_create_codebuild_role,
    create_or_update_codebuild_project,
    start_build,
    wait_for_build,
    get_or_create_ecs_task_execution_role,
    get_cluster_name,
    ensure_ecs_cluster,
    register_task_definition,
    create_or_update_ecs_service,
    wait_for_service_stable,
    delete_ecs_service,
    delete_ecs_log_group,
    ensure_ecs_security_group,
    get_default_vpc_and_subnets,
    get_ecs_service_name,
    ensure_shared_alb,
    ensure_alb_security_group,
    create_target_group,
    create_listener_rule,
    delete_target_group,
    delete_listener_rule,
    delete_ecr_repository,
)
from .aws.ecr import get_ecr_repo_name
from .config import DEFAULT_FARGATE_CPU, DEFAULT_FARGATE_MEMORY


def deploy_fargate_project(
    github_url: str,
    github_token: Optional[str] = None,
    root_directory: str = "./",
    start_command: str = "uvicorn main:app --host 0.0.0.0 --port 8080",
    env_vars: Optional[dict] = None,
    cpu: Optional[int] = None,
    memory: Optional[int] = None,
    on_build_start: Optional[callable] = None,
    project_id: Optional[str] = None,
    codebuild_compute_type: Optional[str] = None,
    subdomain: Optional[str] = None,
    org_id: Optional[str] = None,
) -> dict:
    """
    Deploy a project from GitHub to ECS Fargate.

    Uses the same CodeBuild→ECR pipeline as Lambda deployments,
    but deploys the container to Fargate instead of Lambda.

    Args:
        github_url: GitHub repository URL
        github_token: OAuth token for private repos
        root_directory: Root directory for monorepos
        start_command: Command to start the application
        env_vars: Environment variables for the container
        cpu: Fargate CPU units (256, 512, 1024, 2048, 4096)
        memory: Fargate memory in MB (512, 1024, 2048, 4096, 8192)
        on_build_start: Optional callback(build_id) called when build starts
        project_id: Unique project identifier for naming
        codebuild_compute_type: CodeBuild compute type override
        subdomain: Subdomain for ALB routing (e.g., "my-project-abc123")

    Returns:
        Dict with service_url, build_id, ecs_service_name, task_definition_arn,
        target_group_arn, listener_rule_arn
    """
    if not github_token:
        raise ValueError("github_token is required for authentication")

    cpu = cpu or DEFAULT_FARGATE_CPU
    memory = memory or DEFAULT_FARGATE_MEMORY

    # Use project_id for unique naming if provided
    repo_name = extract_project_name(github_url)
    if project_id:
        project_name = f"{repo_name}-{project_id[:8]}"
    else:
        project_name = repo_name

    print(f"\n🔧 Shorlabs Deployer (ECS Fargate)")
    print(f"   Repository: {github_url}")
    print(f"   Project Name: {project_name}")
    print(f"   Start Command: {start_command}")
    print(f"   CPU: {cpu}, Memory: {memory}MB\n")

    # Step 1: Detect runtime
    print("🔍 Detecting runtime...")
    runtime = detect_runtime_from_github(github_url, github_token, root_directory)
    print(f"✅ Detected runtime: {runtime}")

    # Step 2: Create ECR repository (reused from Lambda pipeline)
    ecr_repo_name = get_ecr_repo_name(project_name)
    ecr_repo_uri = create_ecr_repository(ecr_repo_name)
    print(f"✅ ECR repository ready: {ecr_repo_name}")

    # Step 3: Build Docker image via CodeBuild (reused)
    print("🏗️ Setting up build environment...")
    codebuild_role = get_or_create_codebuild_role()
    create_or_update_codebuild_project(codebuild_role)

    print("🚀 Starting build from GitHub...")
    build_id = start_build(
        github_url=github_url,
        github_token=github_token,
        ecr_repo_uri=ecr_repo_uri,
        project_name=project_name,
        start_command=start_command,
        runtime=runtime,
        root_directory=root_directory,
        env_vars=env_vars,
        compute_type_override=codebuild_compute_type,
    )
    print(f"🔨 Build started: {build_id}")

    if on_build_start:
        on_build_start(build_id)

    # Step 4: Wait for build
    if not wait_for_build(build_id):
        raise Exception("Build failed")
    print("✅ Build completed")

    # Step 5: Setup ECS infrastructure
    print("🚀 Deploying to ECS Fargate...")

    # 5a: IAM role for ECS task execution
    execution_role_arn = get_or_create_ecs_task_execution_role()

    # 5b: Register task definition
    image_uri = f"{ecr_repo_uri}:latest"
    task_def_arn = register_task_definition(
        project_name=project_name,
        image_uri=image_uri,
        cpu=cpu,
        memory=memory,
        execution_role_arn=execution_role_arn,
        env_vars=env_vars,
    )

    # 5c: Ensure ECS cluster exists (per-org)
    if not org_id:
        raise ValueError("org_id is required for Fargate deployment")
    cluster_arn = ensure_ecs_cluster(org_id)

    # 5d: Get VPC and subnets (same default VPC as Aurora)
    vpc_id, subnet_ids = get_default_vpc_and_subnets()

    # 5e: Setup security groups
    alb_sg_id = ensure_alb_security_group(vpc_id)
    ecs_sg_id = ensure_ecs_security_group(vpc_id, alb_sg_id)

    # 5f: Create target group
    target_group_arn = create_target_group(project_name, vpc_id)

    # 5g: Setup ALB and listener rule
    alb_info = ensure_shared_alb(subnet_ids, alb_sg_id)
    host_header = f"{subdomain}.shorlabs.com" if subdomain else f"{project_name}.shorlabs.com"
    listener_rule_arn = create_listener_rule(
        listener_arn=alb_info["https_listener_arn"],
        target_group_arn=target_group_arn,
        host_header=host_header,
    )

    # 5h: Create or update ECS service
    cluster_name = get_cluster_name(org_id)
    service_arn = create_or_update_ecs_service(
        project_name=project_name,
        cluster_name=cluster_name,
        task_definition_arn=task_def_arn,
        target_group_arn=target_group_arn,
        subnets=subnet_ids,
        security_group_id=ecs_sg_id,
    )

    # Step 6: Wait for service to stabilize
    ecs_service_name = get_ecs_service_name(project_name)
    wait_for_service_stable(cluster_name, ecs_service_name)

    service_url = f"https://{host_header}"

    print(f"\n✅ Fargate deployment successful!")
    print(f"🌐 Your service is live at: {service_url}")

    return {
        "service_url": service_url,
        "alb_dns_name": alb_info["alb_dns_name"],
        "build_id": build_id,
        "ecs_service_name": ecs_service_name,
        "function_name": project_name,  # For ECR repo naming consistency
        "task_definition_arn": task_def_arn,
        "target_group_arn": target_group_arn,
        "listener_rule_arn": listener_rule_arn,
    }


def delete_fargate_resources(
    github_url: str,
    function_name: Optional[str] = None,
    target_group_arn: Optional[str] = None,
    listener_rule_arn: Optional[str] = None,
    org_id: Optional[str] = None,
) -> dict:
    """
    Delete all AWS resources for a Fargate project.

    Args:
        github_url: GitHub repository URL
        function_name: The stored project name (for resource lookup)
        target_group_arn: ARN of the ALB target group
        listener_rule_arn: ARN of the ALB listener rule

    Returns:
        Dict with deletion status
    """
    if function_name:
        project_name = function_name
        print(f"🗑️ Deleting Fargate resources using stored name: {project_name}")
    else:
        project_name = extract_project_name(github_url)
        print(f"🗑️ Deleting Fargate resources using derived name: {project_name}")

    # Delete listener rule first (before target group)
    rule_deleted = False
    if listener_rule_arn:
        rule_deleted = delete_listener_rule(listener_rule_arn)

    # Delete ECS service (scales down then deletes)
    print("🗑️ Deleting ECS service...")
    if not org_id:
        raise ValueError("org_id is required for Fargate resource deletion")
    ecs_deleted = delete_ecs_service(project_name, org_id)

    # Delete target group (after ECS service is gone)
    tg_deleted = False
    if target_group_arn:
        tg_deleted = delete_target_group(target_group_arn)

    # Delete ECR repository
    print("🗑️ Deleting ECR repository...")
    ecr_deleted = delete_ecr_repository(get_ecr_repo_name(project_name))

    # Delete CloudWatch log group
    print("🗑️ Deleting ECS log group...")
    logs_deleted = delete_ecs_log_group(project_name)

    print(f"🗑️ Deletion complete - ECS: {ecs_deleted}, ECR: {ecr_deleted}, "
          f"TG: {tg_deleted}, Rule: {rule_deleted}, Logs: {logs_deleted}")

    return {
        "ecs_deleted": ecs_deleted,
        "ecr_deleted": ecr_deleted,
        "target_group_deleted": tg_deleted,
        "listener_rule_deleted": rule_deleted,
        "logs_deleted": logs_deleted,
    }
