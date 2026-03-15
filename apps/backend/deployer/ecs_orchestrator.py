"""
ECS EC2 Deployment Orchestrator

Main deployment logic for ECS EC2-backed services using t4g (ARM64) instances.
Mirrors orchestrator.py but deploys to ECS EC2 instead of Lambda.
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
    get_or_create_ecs_instance_role,
    get_cluster_name,
    ensure_ecs_cluster,
    register_task_definition,
    create_or_update_ecs_service,
    wait_for_service_stable,
    delete_ecs_service,
    delete_ecs_log_group,
    delete_service_infra,
    ensure_ecs_security_group,
    ensure_ec2_security_group,
    ensure_launch_template,
    ensure_auto_scaling_group,
    wait_for_instance_refresh,
    ensure_ec2_capacity_provider,
    get_default_vpc_and_subnets,
    get_ecs_service_name,
    ensure_shared_alb,
    ensure_alb_security_group,
    create_target_group,
    create_listener_rule,
    delete_target_group,
    delete_listener_rule,
    delete_ecr_repository,
    get_target_group_for_host,
)
from .aws.ecr import get_ecr_repo_name
from .config import DEFAULT_TASK_CPU, DEFAULT_TASK_MEMORY, DEFAULT_INSTANCE_TYPE, get_instance_type_from_memory, get_task_memory


def deploy_ecs_project(
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
    instance_type: Optional[str] = None,
) -> dict:
    """
    Deploy a project from GitHub to ECS backed by EC2 t4g (ARM64) instances.

    Uses the same CodeBuild→ECR pipeline as Lambda deployments,
    but deploys the container to ECS EC2 instead of Lambda.

    Args:
        github_url: GitHub repository URL
        github_token: OAuth token for private repos
        root_directory: Root directory for monorepos
        start_command: Command to start the application
        env_vars: Environment variables for the container
        cpu: Task CPU units (2048 = 2 vCPUs, fixed for all t4g instances)
        memory: Task memory in MB (512, 1024, 2048, 4096) - determines instance type
        on_build_start: Optional callback(build_id) called when build starts
        project_id: Unique project identifier for naming
        codebuild_compute_type: CodeBuild compute type override
        subdomain: Subdomain for ALB routing (e.g., "my-project-abc123")
        instance_type: EC2 instance type (auto-determined from memory if not provided)

    Returns:
        Dict with service_url, build_id, ecs_service_name, task_definition_arn,
        target_group_arn, listener_rule_arn
    """
    if not github_token:
        raise ValueError("github_token is required for authentication")

    cpu = cpu or DEFAULT_TASK_CPU
    memory = memory or DEFAULT_TASK_MEMORY

    # Map memory to instance type if not explicitly provided
    # All t4g instances have 2 vCPUs, so instance type is determined by memory
    if not instance_type:
        instance_type = get_instance_type_from_memory(memory)

    # Task memory must be less than instance total RAM to leave room
    # for ECS agent, Docker daemon, and OS overhead
    task_memory = get_task_memory(memory)
    
    # Use project_id for unique naming if provided
    repo_name = extract_project_name(github_url)
    if project_id:
        project_name = f"{repo_name}-{project_id[:8]}"
    else:
        project_name = repo_name

    print(f"\n🔧 Shorlabs Deployer (ECS EC2 / {instance_type})")
    print(f"   Repository: {github_url}")
    print(f"   Project Name: {project_name}")
    print(f"   Start Command: {start_command}")
    print(f"   CPU: {cpu}, Memory: {memory}MB")
    print(f"   Instance Type: {instance_type}\n")

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
        arm_build=True,
    )
    print(f"🔨 Build started: {build_id}")

    if on_build_start:
        on_build_start(build_id)

    # Step 4: Wait for build
    if not wait_for_build(build_id):
        raise Exception("Build failed")
    print("✅ Build completed")

    # Step 5: Setup ECS EC2 infrastructure
    print("🚀 Deploying to ECS EC2...")

    # 5a: IAM roles
    execution_role_arn = get_or_create_ecs_task_execution_role()
    instance_profile_arn = get_or_create_ecs_instance_role()

    # 5b: Get VPC and subnets (same default VPC as Aurora)
    if not org_id:
        raise ValueError("org_id is required for ECS EC2 deployment")
    vpc_id, subnet_ids = get_default_vpc_and_subnets()

    # 5c: Setup security groups
    alb_sg_id = ensure_alb_security_group(vpc_id)
    ecs_sg_id = ensure_ecs_security_group(vpc_id, alb_sg_id)
    ec2_sg_id = ensure_ec2_security_group(vpc_id, alb_sg_id)

    # 5d: Setup per-service EC2 infrastructure (launch template → ASG → capacity provider)
    cluster_name = get_cluster_name(org_id)
    launch_template_id, instance_type_changed = ensure_launch_template(
        project_name=project_name,
        cluster_name=cluster_name,
        instance_profile_arn=instance_profile_arn,
        security_group_id=ec2_sg_id,
        instance_type=instance_type,
    )
    asg_name, instance_refresh_started = ensure_auto_scaling_group(
        project_name=project_name,
        launch_template_id=launch_template_id,
        subnet_ids=subnet_ids,
        instance_type_changed=instance_type_changed,
    )

    # If instance type changed, wait for the new EC2 instance to be ready
    # before updating the ECS service — otherwise the task can't be placed
    if instance_refresh_started:
        wait_for_instance_refresh(asg_name)

    capacity_provider_name = ensure_ec2_capacity_provider(
        project_name=project_name,
        asg_name=asg_name,
    )

    # 5e: Ensure ECS cluster with capacity provider
    cluster_arn = ensure_ecs_cluster(org_id, capacity_provider_name=capacity_provider_name)

    # 5f: Register task definition
    image_uri = f"{ecr_repo_uri}:latest"
    task_def_arn = register_task_definition(
        project_name=project_name,
        image_uri=image_uri,
        cpu=cpu,
        memory=task_memory,
        execution_role_arn=execution_role_arn,
        env_vars=env_vars,
    )

    # 5f: Create target group
    target_group_arn = create_target_group(project_name, vpc_id)

    # 5g: Setup ALB and listener rule
    alb_info = ensure_shared_alb(subnet_ids, alb_sg_id)
    host_header = f"{subdomain}.shorlabs.com" if subdomain else f"{project_name}.shorlabs.com"
    
    # Get the old target group ARN before updating the listener rule (for cleanup)
    old_target_group_arn = get_target_group_for_host(alb_info["https_listener_arn"], host_header)
    
    listener_rule_arn = create_listener_rule(
        listener_arn=alb_info["https_listener_arn"],
        target_group_arn=target_group_arn,
        host_header=host_header,
    )
    
    # Clean up old target group if this is a redeployment
    if old_target_group_arn and old_target_group_arn != target_group_arn:
        print(f"🧹 Cleaning up old target group from previous deployment...")
        delete_target_group(old_target_group_arn)

    # 5i: Create or update ECS service
    service_arn = create_or_update_ecs_service(
        project_name=project_name,
        cluster_name=cluster_name,
        task_definition_arn=task_def_arn,
        target_group_arn=target_group_arn,
        subnets=subnet_ids,
        security_group_id=ecs_sg_id,
        capacity_provider_name=capacity_provider_name,
    )

    # Step 6: Wait for service to stabilize
    ecs_service_name = get_ecs_service_name(project_name)
    wait_for_service_stable(cluster_name, ecs_service_name)

    service_url = f"https://{host_header}"

    print(f"\n✅ ECS EC2 deployment successful!")
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


def delete_ecs_resources(
    github_url: str,
    function_name: Optional[str] = None,
    target_group_arn: Optional[str] = None,
    listener_rule_arn: Optional[str] = None,
    org_id: Optional[str] = None,
) -> dict:
    """
    Force-delete ALL AWS resources for an ECS project.

    Works in any state: mid-deployment, running, partially created.
    If target_group_arn or listener_rule_arn are not provided, attempts
    to find them by naming convention.

    Args:
        github_url: GitHub repository URL
        function_name: The stored project name (for resource lookup)
        target_group_arn: ARN of the ALB target group (looked up if missing)
        listener_rule_arn: ARN of the ALB listener rule (looked up if missing)
        org_id: Organization ID for cluster lookup

    Returns:
        Dict with deletion status
    """
    import boto3

    if function_name:
        project_name = function_name
        print(f"🗑️ Force-deleting ECS resources using stored name: {project_name}")
    else:
        project_name = extract_project_name(github_url)
        print(f"🗑️ Force-deleting ECS resources using derived name: {project_name}")

    if not org_id:
        raise ValueError("org_id is required for ECS resource deletion")

    # If target group ARN is missing, try to find it by name
    if not target_group_arn:
        try:
            elbv2 = boto3.client("elbv2")
            tg_name = f"sl-tg-{project_name[:24]}"
            resp = elbv2.describe_target_groups(Names=[tg_name])
            tgs = resp.get("TargetGroups", [])
            if tgs:
                target_group_arn = tgs[0]["TargetGroupArn"]
                print(f"  ↳ Found target group by name: {tg_name}")
        except Exception:
            pass

    # If listener rule ARN is missing, try to find it via target group
    if not listener_rule_arn and target_group_arn:
        try:
            elbv2 = boto3.client("elbv2")
            # Find the ALB listener
            albs = elbv2.describe_load_balancers(Names=["shorlabs-alb"]).get("LoadBalancers", [])
            if albs:
                listeners = elbv2.describe_listeners(LoadBalancerArn=albs[0]["LoadBalancerArn"]).get("Listeners", [])
                for listener in listeners:
                    rules = elbv2.describe_rules(ListenerArn=listener["ListenerArn"]).get("Rules", [])
                    for rule in rules:
                        for action in rule.get("Actions", []):
                            if action.get("TargetGroupArn") == target_group_arn:
                                listener_rule_arn = rule["RuleArn"]
                                print(f"  ↳ Found listener rule for target group")
                                break
        except Exception:
            pass

    # 1. Delete listener rule first (before target group)
    rule_deleted = False
    if listener_rule_arn:
        rule_deleted = delete_listener_rule(listener_rule_arn)

    # 2. Force-delete ECS service (stops all tasks)
    print("🗑️ Force-deleting ECS service...")
    ecs_deleted = delete_ecs_service(project_name, org_id)

    # 3. Delete target group (after ECS service is gone)
    tg_deleted = False
    if target_group_arn:
        tg_deleted = delete_target_group(target_group_arn)

    # 4. Delete ECR repository
    print("🗑️ Deleting ECR repository...")
    ecr_deleted = delete_ecr_repository(get_ecr_repo_name(project_name))

    # 5. Delete CloudWatch log group
    print("🗑️ Deleting ECS log group...")
    logs_deleted = delete_ecs_log_group(project_name)

    # 6. Force-delete per-service infra (CP, ASG, LT, EC2 instances)
    print("🧹 Force-cleaning service infrastructure...")
    infra_cleanup = delete_service_infra(project_name, org_id)

    print(f"🗑️ Force-deletion complete - ECS: {ecs_deleted}, ECR: {ecr_deleted}, "
          f"TG: {tg_deleted}, Rule: {rule_deleted}, Logs: {logs_deleted}, "
          f"Infra cleanup: {infra_cleanup}")

    return {
        "ecs_deleted": ecs_deleted,
        "ecr_deleted": ecr_deleted,
        "target_group_deleted": tg_deleted,
        "listener_rule_deleted": rule_deleted,
        "logs_deleted": logs_deleted,
        "infra_cleanup": infra_cleanup,
    }
