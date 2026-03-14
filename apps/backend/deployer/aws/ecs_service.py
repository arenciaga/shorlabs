"""
ECS Fargate Service Operations

Manages ECS clusters, task definitions, and Fargate services.
"""

import time

from ..clients import get_ecs_client, get_ec2_client, get_logs_client, get_aws_region
from ..config import (
    ECS_CLUSTER_PREFIX,
    ECS_SERVICE_PREFIX,
    ECS_SECURITY_GROUP_NAME,
    FARGATE_CONTAINER_PORT,
)
from .lambda_service import filter_env_vars


def get_cluster_name(org_id: str) -> str:
    """Get the ECS cluster name for an organization."""
    return f"{ECS_CLUSTER_PREFIX}-{org_id}"


def get_ecs_service_name(project_name: str) -> str:
    """Get the ECS service name for a project."""
    return f"{ECS_SERVICE_PREFIX}-{project_name}"


def get_task_definition_family(project_name: str) -> str:
    """Get the task definition family name for a project."""
    return f"{ECS_SERVICE_PREFIX}-task-{project_name}"


def get_ecs_log_group(project_name: str) -> str:
    """Get the CloudWatch log group name for an ECS service."""
    return f"/ecs/{ECS_SERVICE_PREFIX}-{project_name}"


def ensure_ecs_cluster(org_id: str) -> str:
    """
    Ensure the ECS cluster for an organization exists.

    Each organization gets its own cluster (free — just a logical grouping).
    Idempotent: reuses existing cluster if present.

    Args:
        org_id: Organization ID for per-org cluster naming

    Returns:
        The cluster ARN
    """
    ecs_client = get_ecs_client()
    cluster_name = get_cluster_name(org_id)

    try:
        response = ecs_client.describe_clusters(clusters=[cluster_name])
        clusters = response.get("clusters", [])
        for cluster in clusters:
            if cluster.get("status") == "ACTIVE":
                print(f"✅ ECS cluster exists: {cluster_name}")
                return cluster["clusterArn"]
    except Exception:
        pass

    print(f"🔧 Creating ECS cluster: {cluster_name}")
    response = ecs_client.create_cluster(
        clusterName=cluster_name,
        capacityProviders=["FARGATE"],
        defaultCapacityProviderStrategy=[
            {
                "capacityProvider": "FARGATE",
                "weight": 1,
            }
        ],
    )
    cluster_arn = response["cluster"]["clusterArn"]
    print(f"✅ ECS cluster created: {cluster_name}")
    return cluster_arn


def _ensure_log_group(project_name: str) -> str:
    """Ensure CloudWatch log group exists for ECS task."""
    logs_client = get_logs_client()
    log_group = get_ecs_log_group(project_name)

    try:
        logs_client.create_log_group(logGroupName=log_group)
        print(f"✅ Created log group: {log_group}")
    except logs_client.exceptions.ResourceAlreadyExistsException:
        pass

    return log_group


def register_task_definition(
    project_name: str,
    image_uri: str,
    cpu: int,
    memory: int,
    execution_role_arn: str,
    env_vars: dict = None,
    port: int = FARGATE_CONTAINER_PORT,
) -> str:
    """
    Register an ECS Fargate task definition.

    Args:
        project_name: Project name for naming
        image_uri: Docker image URI from ECR
        cpu: CPU units (256, 512, 1024, 2048, 4096)
        memory: Memory in MB (512, 1024, 2048, 4096, 8192)
        execution_role_arn: IAM role ARN for ECS task execution
        env_vars: Environment variables for the container
        port: Container port (default 8080)

    Returns:
        Task definition ARN
    """
    ecs_client = get_ecs_client()
    region = get_aws_region()
    family = get_task_definition_family(project_name)
    log_group = _ensure_log_group(project_name)

    # Build environment variable list
    container_env = []
    if env_vars:
        filtered, _skipped = filter_env_vars(env_vars)
        container_env = [
            {"name": k, "value": str(v)} for k, v in filtered.items()
        ]

    print(f"📋 Registering task definition: {family} (cpu={cpu}, memory={memory})")

    response = ecs_client.register_task_definition(
        family=family,
        networkMode="awsvpc",
        requiresCompatibilities=["FARGATE"],
        cpu=str(cpu),
        memory=str(memory),
        executionRoleArn=execution_role_arn,
        runtimePlatform={
            "cpuArchitecture": "X86_64",
            "operatingSystemFamily": "LINUX",
        },
        containerDefinitions=[
            {
                "name": project_name,
                "image": image_uri,
                "essential": True,
                "portMappings": [
                    {
                        "containerPort": port,
                        "protocol": "tcp",
                    }
                ],
                "environment": container_env,
                "logConfiguration": {
                    "logDriver": "awslogs",
                    "options": {
                        "awslogs-group": log_group,
                        "awslogs-region": region,
                        "awslogs-stream-prefix": "ecs",
                    },
                },
            }
        ],
    )

    task_def_arn = response["taskDefinition"]["taskDefinitionArn"]
    print(f"✅ Task definition registered: {task_def_arn}")
    return task_def_arn


def create_or_update_ecs_service(
    project_name: str,
    cluster_name: str,
    task_definition_arn: str,
    target_group_arn: str,
    subnets: list,
    security_group_id: str,
    desired_count: int = 1,
) -> str:
    """
    Create or update an ECS Fargate service.

    Idempotent: updates existing service if found, creates otherwise.

    Args:
        project_name: Project name for service naming
        cluster_name: ECS cluster name (per-org)
        task_definition_arn: Task definition ARN
        target_group_arn: ALB target group ARN
        subnets: VPC subnet IDs
        security_group_id: ECS security group ID
        desired_count: Number of tasks to run

    Returns:
        ECS service ARN
    """
    ecs_client = get_ecs_client()
    service_name = get_ecs_service_name(project_name)

    # Check if service exists
    try:
        response = ecs_client.describe_services(
            cluster=cluster_name,
            services=[service_name],
        )
        services = response.get("services", [])
        for svc in services:
            if svc.get("status") == "ACTIVE":
                print(f"🔄 Updating ECS service: {service_name}")
                ecs_client.update_service(
                    cluster=cluster_name,
                    service=service_name,
                    taskDefinition=task_definition_arn,
                    desiredCount=desired_count,
                    forceNewDeployment=True,
                )
                print(f"✅ ECS service updated: {service_name}")
                return svc["serviceArn"]
    except Exception:
        pass

    print(f"🚀 Creating ECS service: {service_name}")
    response = ecs_client.create_service(
        cluster=cluster_name,
        serviceName=service_name,
        taskDefinition=task_definition_arn,
        launchType="FARGATE",
        desiredCount=desired_count,
        networkConfiguration={
            "awsvpcConfiguration": {
                "subnets": subnets,
                "securityGroups": [security_group_id],
                "assignPublicIp": "ENABLED",
            }
        },
        loadBalancers=[
            {
                "targetGroupArn": target_group_arn,
                "containerName": project_name,
                "containerPort": FARGATE_CONTAINER_PORT,
            }
        ],
        deploymentConfiguration={
            "maximumPercent": 200,
            "minimumHealthyPercent": 100,
        },
        platformVersion="LATEST",
    )

    service_arn = response["service"]["serviceArn"]
    print(f"✅ ECS service created: {service_name}")
    return service_arn


def wait_for_service_stable(cluster_name: str, service_name: str, timeout: int = 600):
    """
    Wait for an ECS service to stabilize (running tasks match desired count).

    Args:
        cluster_name: ECS cluster name
        service_name: ECS service name
        timeout: Maximum wait time in seconds
    """
    ecs_client = get_ecs_client()
    start_time = time.time()

    print(f"⏳ Waiting for ECS service {service_name} to stabilize...")

    while time.time() - start_time < timeout:
        response = ecs_client.describe_services(
            cluster=cluster_name,
            services=[service_name],
        )
        services = response.get("services", [])
        if not services:
            raise Exception(f"ECS service {service_name} not found")

        svc = services[0]
        running = svc.get("runningCount", 0)
        desired = svc.get("desiredCount", 1)

        # Check deployment status
        deployments = svc.get("deployments", [])
        if deployments:
            primary = deployments[0]
            rollout_state = primary.get("rolloutState", "")
            if rollout_state == "COMPLETED":
                print(f"✅ ECS service stable: {running}/{desired} tasks running")
                return
            elif rollout_state == "FAILED":
                raise Exception(f"ECS service deployment failed: {primary.get('rolloutStateReason', 'unknown')}")

        if running == desired and running > 0:
            print(f"✅ ECS service stable: {running}/{desired} tasks running")
            return

        print(f"  ⏳ {running}/{desired} tasks running...")
        time.sleep(15)

    raise Exception(f"ECS service {service_name} did not stabilize within {timeout}s")


def delete_ecs_service(project_name: str, org_id: str) -> bool:
    """
    Delete an ECS Fargate service and deregister its task definitions.

    Args:
        project_name: Project name for service lookup
        org_id: Organization ID for cluster lookup

    Returns:
        True if deleted, False if not found
    """
    ecs_client = get_ecs_client()
    service_name = get_ecs_service_name(project_name)
    cluster_name = get_cluster_name(org_id)

    try:
        # Scale down first
        print(f"🗑️ Scaling down ECS service: {service_name}")
        ecs_client.update_service(
            cluster=cluster_name,
            service=service_name,
            desiredCount=0,
        )
        time.sleep(5)

        # Delete service
        ecs_client.delete_service(
            cluster=cluster_name,
            service=service_name,
            force=True,
        )
        print(f"✅ ECS service deleted: {service_name}")
    except ecs_client.exceptions.ServiceNotFoundException:
        print(f"⚠️ ECS service not found (already deleted?): {service_name}")
        return False
    except Exception as e:
        print(f"❌ Failed to delete ECS service: {e}")
        return False

    # Deregister task definitions
    family = get_task_definition_family(project_name)
    try:
        response = ecs_client.list_task_definitions(familyPrefix=family, status="ACTIVE")
        for task_def_arn in response.get("taskDefinitionArns", []):
            ecs_client.deregister_task_definition(taskDefinition=task_def_arn)
            print(f"  ↳ Deregistered task definition: {task_def_arn}")
    except Exception as e:
        print(f"⚠️ Failed to deregister task definitions: {e}")

    return True


def delete_ecs_log_group(project_name: str) -> bool:
    """
    Delete the CloudWatch log group for an ECS service.

    Returns:
        True if deleted, False if not found
    """
    logs_client = get_logs_client()
    log_group = get_ecs_log_group(project_name)

    try:
        logs_client.delete_log_group(logGroupName=log_group)
        print(f"✅ Deleted log group: {log_group}")
        return True
    except logs_client.exceptions.ResourceNotFoundException:
        print(f"⚠️ Log group not found (already deleted?): {log_group}")
        return False
    except Exception as e:
        print(f"❌ Failed to delete log group: {e}")
        return False


def ensure_ecs_security_group(vpc_id: str, alb_sg_id: str) -> str:
    """
    Get or create a security group for ECS Fargate tasks.

    Allows inbound traffic on port 8080 from the ALB security group.

    Returns:
        Security group ID
    """
    ec2 = get_ec2_client()

    # Check if SG already exists
    try:
        response = ec2.describe_security_groups(
            Filters=[
                {"Name": "group-name", "Values": [ECS_SECURITY_GROUP_NAME]},
                {"Name": "vpc-id", "Values": [vpc_id]},
            ]
        )
        groups = response.get("SecurityGroups", [])
        if groups:
            return groups[0]["GroupId"]
    except Exception:
        pass

    print(f"🔐 Creating ECS security group: {ECS_SECURITY_GROUP_NAME}")
    response = ec2.create_security_group(
        GroupName=ECS_SECURITY_GROUP_NAME,
        Description="Shorlabs - ECS Fargate tasks",
        VpcId=vpc_id,
        TagSpecifications=[
            {
                "ResourceType": "security-group",
                "Tags": [
                    {"Key": "Name", "Value": ECS_SECURITY_GROUP_NAME},
                    {"Key": "managed-by", "Value": "shorlabs"},
                ],
            }
        ],
    )
    sg_id = response["GroupId"]

    # Allow inbound on port 8080 from ALB security group
    ec2.authorize_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[
            {
                "IpProtocol": "tcp",
                "FromPort": FARGATE_CONTAINER_PORT,
                "ToPort": FARGATE_CONTAINER_PORT,
                "UserIdGroupPairs": [{"GroupId": alb_sg_id}],
            }
        ],
    )

    print(f"✅ ECS security group created: {sg_id}")
    return sg_id


def get_default_vpc_and_subnets() -> tuple:
    """
    Get the default VPC ID and its public subnet IDs.

    Returns:
        Tuple of (vpc_id, subnet_ids)
    """
    ec2 = get_ec2_client()

    # Get default VPC
    response = ec2.describe_vpcs(Filters=[{"Name": "isDefault", "Values": ["true"]}])
    vpcs = response.get("Vpcs", [])
    if not vpcs:
        raise Exception("No default VPC found. Please create a default VPC in your AWS account.")
    vpc_id = vpcs[0]["VpcId"]

    # Get subnets
    subnets_resp = ec2.describe_subnets(
        Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]
    )
    subnet_ids = [s["SubnetId"] for s in subnets_resp["Subnets"]]

    if len(subnet_ids) < 2:
        raise Exception(
            f"Need at least 2 subnets in the default VPC, found {len(subnet_ids)}"
        )

    return vpc_id, subnet_ids
