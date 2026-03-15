"""
ECS EC2 Service Operations

Manages ECS clusters, task definitions, and EC2-backed services using t4g (ARM64) instances.
"""

import base64
import time

from ..clients import (
    get_ecs_client,
    get_ec2_client,
    get_logs_client,
    get_aws_region,
    get_autoscaling_client,
    get_ssm_client,
)
from ..config import (
    ECS_CLUSTER_PREFIX,
    ECS_SERVICE_PREFIX,
    ECS_SECURITY_GROUP_NAME,
    ECS_EC2_SECURITY_GROUP_NAME,
    ECS_CONTAINER_PORT,
    ECS_LAUNCH_TEMPLATE_PREFIX,
    ECS_ASG_PREFIX,
    ECS_CAPACITY_PROVIDER_PREFIX,
    DEFAULT_INSTANCE_TYPE,
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


def ensure_ecs_cluster(org_id: str, capacity_provider_name: str = None) -> str:
    """
    Ensure the ECS cluster for an organization exists.

    Each organization gets its own cluster (free — just a logical grouping).
    Idempotent: reuses existing cluster if present.

    If capacity_provider_name is given, associates it with the cluster and sets it
    as the default capacity provider strategy.

    Args:
        org_id: Organization ID for per-org cluster naming
        capacity_provider_name: Optional EC2 capacity provider to associate

    Returns:
        The cluster ARN
    """
    ecs_client = get_ecs_client()
    cluster_name = get_cluster_name(org_id)

    import time

    try:
        response = ecs_client.describe_clusters(clusters=[cluster_name])
        clusters = response.get("clusters", [])
        for cluster in clusters:
            status = cluster.get("status")
            if status == "ACTIVE":
                print(f"✅ ECS cluster exists: {cluster_name}")
                # If capacity provider given, ensure it's associated
                if capacity_provider_name:
                    existing_providers = cluster.get("capacityProviders", [])
                    if capacity_provider_name not in existing_providers:
                        print(f"🔧 Associating capacity provider {capacity_provider_name} with cluster {cluster_name}")
                        updated_providers = existing_providers + [capacity_provider_name]
                        ecs_client.put_cluster_capacity_providers(
                            cluster=cluster_name,
                            capacityProviders=updated_providers,
                            defaultCapacityProviderStrategy=[
                                {
                                    "capacityProvider": capacity_provider_name,
                                    "weight": 1,
                                    "base": 1,
                                }
                            ],
                        )
                    else:
                        # CP already associated — just update the default strategy
                        # so this service's CP is used for new tasks
                        print(f"🔧 Updating default capacity provider strategy to {capacity_provider_name}")
                        ecs_client.put_cluster_capacity_providers(
                            cluster=cluster_name,
                            capacityProviders=existing_providers,
                            defaultCapacityProviderStrategy=[
                                {
                                    "capacityProvider": capacity_provider_name,
                                    "weight": 1,
                                    "base": 1,
                                }
                            ],
                        )
                return cluster["clusterArn"]
            elif status in ("INACTIVE", "DRAINING"):
                # Stale cluster from a failed cleanup — delete and wait for
                # it to fully disappear before recreating
                print(f"🧹 Found {status} cluster {cluster_name}, deleting before recreating...")
                try:
                    ecs_client.delete_cluster(cluster=cluster_name)
                except Exception:
                    pass
                # Wait for the cluster to fully disappear
                for i in range(12):
                    time.sleep(5)
                    try:
                        resp = ecs_client.describe_clusters(clusters=[cluster_name])
                        remaining = [c for c in resp.get("clusters", [])
                                     if c.get("status") != "INACTIVE"]
                        if not remaining:
                            print(f"  ✅ Stale cluster cleaned up")
                            break
                    except Exception:
                        break
                else:
                    print(f"  ⚠️ Stale cluster still lingering, attempting create anyway")
    except Exception as e:
        print(f"⚠️ Error checking existing cluster: {e}")

    print(f"🔧 Creating ECS cluster: {cluster_name}")
    # Create cluster WITHOUT capacity provider first to avoid
    # InvalidParameterException when an INACTIVE cluster with different
    # params still lingers.  We associate the CP separately afterwards.
    response = ecs_client.create_cluster(clusterName=cluster_name)
    cluster_arn = response["cluster"]["clusterArn"]
    print(f"📝 Cluster created, waiting for ACTIVE status...")

    # Poll until the cluster is confirmed ACTIVE before associating the
    # capacity provider.
    for i in range(24):  # up to ~2 minutes
        try:
            desc = ecs_client.describe_clusters(clusters=[cluster_name])
            cl = desc.get("clusters", [])
            if cl and cl[0].get("status") == "ACTIVE":
                print(f"✅ ECS cluster active: {cluster_name}")
                break
            else:
                status = cl[0].get("status") if cl else "NOT_FOUND"
                print(f"  ⏳ Cluster status: {status} ({i+1}/24)...")
        except Exception as e:
            print(f"  ⚠️ Error checking cluster status: {e}")
        time.sleep(5)
    else:
        print(f"⚠️ Cluster may not be fully active yet, proceeding anyway")

    # Now associate the capacity provider separately — this avoids the
    # InvalidParameterException when create_cluster is idempotent-matched
    # against a lingering INACTIVE cluster with different params.
    if capacity_provider_name:
        print(f"🔧 Associating capacity provider {capacity_provider_name} with cluster {cluster_name}")
        ecs_client.put_cluster_capacity_providers(
            cluster=cluster_name,
            capacityProviders=[capacity_provider_name],
            defaultCapacityProviderStrategy=[
                {
                    "capacityProvider": capacity_provider_name,
                    "weight": 1,
                    "base": 1,
                }
            ],
        )
        # Wait for attachment to settle
        for i in range(24):
            try:
                desc = ecs_client.describe_clusters(clusters=[cluster_name])
                cl = desc.get("clusters", [])
                if cl:
                    attachments = cl[0].get("attachments", [])
                    all_ready = all(
                        a.get("status") in ("CREATED", "PRECREATED")
                        for a in attachments
                    ) if attachments else True
                    if all_ready:
                        print(f"✅ Capacity provider attached to cluster")
                        return cluster_arn
                    print(f"  ⏳ Capacity provider attachments still processing ({i+1}/24)...")
            except Exception as e:
                print(f"  ⚠️ Error checking attachment status: {e}")
            time.sleep(5)

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
    port: int = ECS_CONTAINER_PORT,
) -> str:
    """
    Register an ECS EC2 task definition for ARM64 (t4g) instances.

    Args:
        project_name: Project name for naming
        image_uri: Docker image URI from ECR
        cpu: CPU units (2048 for all t4g instances = 2 vCPUs)
        memory: Memory in MB (512, 1024, 2048, 4096)
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
        requiresCompatibilities=["EC2"],
        cpu=str(cpu),
        memory=str(memory),
        executionRoleArn=execution_role_arn,
        runtimePlatform={
            "cpuArchitecture": "ARM64",
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
    capacity_provider_name: str = None,
    desired_count: int = 1,
) -> str:
    """
    Create or update an ECS EC2-backed service.

    Idempotent: updates existing service if found, creates otherwise.
    Uses capacity provider strategy for EC2 launch type.

    Args:
        project_name: Project name for service naming
        cluster_name: ECS cluster name (per-org)
        task_definition_arn: Task definition ARN
        target_group_arn: ALB target group ARN
        subnets: VPC subnet IDs
        security_group_id: ECS security group ID
        capacity_provider_name: EC2 capacity provider name
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

    awsvpc_config = {
        "subnets": subnets,
        "securityGroups": [security_group_id],
    }

    create_kwargs = {
        "cluster": cluster_name,
        "serviceName": service_name,
        "taskDefinition": task_definition_arn,
        "desiredCount": desired_count,
        "loadBalancers": [
            {
                "targetGroupArn": target_group_arn,
                "containerName": project_name,
                "containerPort": ECS_CONTAINER_PORT,
            }
        ],
        "deploymentConfiguration": {
            "maximumPercent": 200,
            "minimumHealthyPercent": 100,
        },
    }

    if capacity_provider_name:
        # EC2 launch type — instances get public IPs from subnet, not the task
        create_kwargs["capacityProviderStrategy"] = [
            {
                "capacityProvider": capacity_provider_name,
                "weight": 1,
                "base": 1,
            }
        ]
    else:
        # Fargate fallback — tasks need assignPublicIp
        awsvpc_config["assignPublicIp"] = "ENABLED"
        create_kwargs["launchType"] = "FARGATE"
        create_kwargs["platformVersion"] = "LATEST"

    create_kwargs["networkConfiguration"] = {"awsvpcConfiguration": awsvpc_config}

    response = ecs_client.create_service(**create_kwargs)

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
    Force-delete an ECS service, stop all running tasks, and deregister task definitions.

    Works in any state: running, mid-deployment, pending, draining.

    Args:
        project_name: Project name for service lookup
        org_id: Organization ID for cluster lookup

    Returns:
        True if deleted, False if not found
    """
    ecs_client = get_ecs_client()
    service_name = get_ecs_service_name(project_name)
    cluster_name = get_cluster_name(org_id)

    # Stop all running/pending tasks for this service
    try:
        for status in ["RUNNING", "PENDING"]:
            task_arns = ecs_client.list_tasks(
                cluster=cluster_name,
                serviceName=service_name,
                desiredStatus=status,
            ).get("taskArns", [])
            for task_arn in task_arns:
                try:
                    ecs_client.stop_task(
                        cluster=cluster_name,
                        task=task_arn,
                        reason="Service being force-deleted",
                    )
                    print(f"  ↳ Stopped task: {task_arn.split('/')[-1]}")
                except Exception:
                    pass
    except Exception:
        pass  # Service may not exist yet

    try:
        # Scale down
        print(f"🗑️ Scaling down ECS service: {service_name}")
        try:
            ecs_client.update_service(
                cluster=cluster_name,
                service=service_name,
                desiredCount=0,
            )
        except Exception:
            pass  # May fail if service is already draining

        # Force delete service — kills remaining tasks immediately
        ecs_client.delete_service(
            cluster=cluster_name,
            service=service_name,
            force=True,
        )
        print(f"✅ ECS service deleted: {service_name}")
    except ecs_client.exceptions.ServiceNotFoundException:
        print(f"⚠️ ECS service not found (already deleted?): {service_name}")
    except Exception as e:
        print(f"❌ Failed to delete ECS service: {e}")

    # Deregister all task definitions (active and inactive)
    family = get_task_definition_family(project_name)
    try:
        for status in ["ACTIVE", "INACTIVE"]:
            response = ecs_client.list_task_definitions(familyPrefix=family, status=status)
            for task_def_arn in response.get("taskDefinitionArns", []):
                try:
                    ecs_client.deregister_task_definition(taskDefinition=task_def_arn)
                    print(f"  ↳ Deregistered: {task_def_arn.split('/')[-1]}")
                except Exception:
                    pass
    except Exception as e:
        print(f"⚠️ Failed to deregister task definitions: {e}")

    return True


def delete_service_infra(project_name: str, org_id: str) -> dict:
    """
    Force-delete all per-service ECS infrastructure.

    Handles any state: mid-deployment, running, partially created, stuck.
    Order: deregister container instances → disassociate CP → cancel instance
    refreshes → force-delete ASG → delete CP → delete launch template.

    Args:
        project_name: Service project name (used in resource naming)
        org_id: Organization ID (for cluster-level cleanup)

    Returns:
        Dict with cleanup results
    """
    import time
    ecs_client = get_ecs_client()
    autoscaling = get_autoscaling_client()
    ec2 = get_ec2_client()
    cluster_name = get_cluster_name(org_id)
    asg_name = f"{ECS_ASG_PREFIX}-{project_name}"
    cp_name = f"{ECS_CAPACITY_PROVIDER_PREFIX}-{project_name}"
    lt_name = f"{ECS_LAUNCH_TEMPLATE_PREFIX}-{project_name}"

    result = {
        "capacity_provider_deleted": False,
        "asg_deleted": False,
        "launch_template_deleted": False,
        "container_instances_deregistered": False,
    }

    print(f"🧹 Force-deleting service infrastructure for {project_name}...")

    # 1. Force-deregister ALL container instances for this service
    #    (regardless of running/pending tasks — we already stopped them)
    try:
        ci_response = ecs_client.list_container_instances(cluster=cluster_name)
        ci_arns = ci_response.get("containerInstanceArns", [])
        if ci_arns:
            ci_details = ecs_client.describe_container_instances(
                cluster=cluster_name,
                containerInstances=ci_arns,
            )
            for ci in ci_details.get("containerInstances", []):
                # Check if this instance belongs to this service's ASG
                # by matching the EC2 instance tags
                ec2_instance_id = ci.get("ec2InstanceId")
                if ec2_instance_id:
                    try:
                        tags_resp = ec2.describe_tags(
                            Filters=[
                                {"Name": "resource-id", "Values": [ec2_instance_id]},
                                {"Name": "key", "Values": ["service"]},
                                {"Name": "value", "Values": [project_name]},
                            ]
                        )
                        if not tags_resp.get("Tags"):
                            continue  # Not our instance, skip
                    except Exception:
                        pass  # If we can't check tags, deregister anyway

                try:
                    ecs_client.deregister_container_instance(
                        cluster=cluster_name,
                        containerInstance=ci["containerInstanceArn"],
                        force=True,
                    )
                    print(f"  ↳ Force-deregistered container instance: {ci.get('ec2InstanceId', 'unknown')}")
                except Exception:
                    pass
            result["container_instances_deregistered"] = True
    except Exception as e:
        print(f"  ⚠️ Could not clean up container instances: {e}")

    # 2. Disassociate capacity provider from cluster
    try:
        response = ecs_client.describe_clusters(clusters=[cluster_name])
        clusters = response.get("clusters", [])
        if clusters:
            current_providers = clusters[0].get("capacityProviders", [])
            if cp_name in current_providers:
                remaining_providers = [p for p in current_providers if p != cp_name]
                remaining_strategy = [
                    {"capacityProvider": p, "weight": 1, "base": 1}
                    for p in remaining_providers
                ]
                ecs_client.put_cluster_capacity_providers(
                    cluster=cluster_name,
                    capacityProviders=remaining_providers,
                    defaultCapacityProviderStrategy=remaining_strategy,
                )
                print(f"  ↳ Disassociated capacity provider {cp_name} from cluster")
    except Exception as e:
        print(f"  ⚠️ Could not disassociate capacity provider: {e}")

    # 3. Cancel any in-progress instance refreshes (blocks ASG deletion)
    try:
        refreshes = autoscaling.describe_instance_refreshes(
            AutoScalingGroupName=asg_name,
        ).get("InstanceRefreshes", [])
        for refresh in refreshes:
            if refresh["Status"] in ("Pending", "InProgress"):
                try:
                    autoscaling.cancel_instance_refresh(
                        AutoScalingGroupName=asg_name,
                    )
                    print(f"  ↳ Cancelled in-progress instance refresh")
                    time.sleep(2)
                except Exception:
                    pass
                break
    except Exception:
        pass

    # 4. Force-delete ASG (terminates all EC2 instances immediately)
    try:
        autoscaling.delete_auto_scaling_group(
            AutoScalingGroupName=asg_name,
            ForceDelete=True,
        )
        print(f"  ✅ Force-deleted ASG (EC2 instances terminating): {asg_name}")
        result["asg_deleted"] = True
    except Exception as e:
        if "not found" not in str(e).lower():
            print(f"  ⚠️ Could not delete ASG {asg_name}: {e}")

    # 5. Delete capacity provider (may need a moment after disassociation)
    for attempt in range(3):
        try:
            ecs_client.delete_capacity_provider(capacityProvider=cp_name)
            print(f"  ✅ Deleted capacity provider: {cp_name}")
            result["capacity_provider_deleted"] = True
            break
        except Exception as e:
            if "not found" in str(e).lower() or "does not exist" in str(e).lower():
                break
            if attempt < 2:
                time.sleep(3)
            else:
                print(f"  ⚠️ Could not delete capacity provider {cp_name}: {e}")

    # 6. Delete launch template (all versions)
    try:
        ec2.delete_launch_template(LaunchTemplateName=lt_name)
        print(f"  ✅ Deleted launch template: {lt_name}")
        result["launch_template_deleted"] = True
    except Exception as e:
        if "not found" not in str(e).lower():
            print(f"  ⚠️ Could not delete launch template {lt_name}: {e}")

    # 7. Directly terminate any EC2 instances tagged for this service
    #    (safety net in case ASG ForceDelete didn't catch them all)
    try:
        instances_resp = ec2.describe_instances(
            Filters=[
                {"Name": "tag:service", "Values": [project_name]},
                {"Name": "tag:managed-by", "Values": ["shorlabs"]},
                {"Name": "instance-state-name", "Values": ["running", "pending", "stopping", "stopped"]},
            ]
        )
        instance_ids = []
        for reservation in instances_resp.get("Reservations", []):
            for inst in reservation.get("Instances", []):
                instance_ids.append(inst["InstanceId"])
        if instance_ids:
            ec2.terminate_instances(InstanceIds=instance_ids)
            print(f"  ✅ Terminated {len(instance_ids)} orphaned EC2 instance(s): {', '.join(instance_ids)}")
    except Exception as e:
        print(f"  ⚠️ Could not terminate orphaned instances: {e}")

    print(f"🧹 Service infrastructure cleanup complete for {project_name}")
    return result


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
    Get or create a security group for ECS tasks.

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
        Description="Shorlabs - ECS tasks",
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
                "FromPort": ECS_CONTAINER_PORT,
                "ToPort": ECS_CONTAINER_PORT,
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


def get_ecs_optimized_ami() -> str:
    """
    Fetch the latest ECS-optimized Amazon Linux 2023 ARM64 AMI ID via SSM.

    Returns:
        AMI ID string
    """
    ssm = get_ssm_client()
    response = ssm.get_parameter(
        Name="/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
    )
    ami_id = response["Parameter"]["Value"]
    print(f"✅ ECS-optimized ARM64 AMI: {ami_id}")
    return ami_id


def ensure_ec2_security_group(vpc_id: str, alb_sg_id: str) -> str:
    """
    Get or create a security group for ECS EC2 instances.

    Allows inbound on container port from ALB SG and all outbound.

    Returns:
        Security group ID
    """
    ec2 = get_ec2_client()

    # Check if SG already exists
    try:
        response = ec2.describe_security_groups(
            Filters=[
                {"Name": "group-name", "Values": [ECS_EC2_SECURITY_GROUP_NAME]},
                {"Name": "vpc-id", "Values": [vpc_id]},
            ]
        )
        groups = response.get("SecurityGroups", [])
        if groups:
            return groups[0]["GroupId"]
    except Exception:
        pass

    print(f"🔐 Creating EC2 instance security group: {ECS_EC2_SECURITY_GROUP_NAME}")
    response = ec2.create_security_group(
        GroupName=ECS_EC2_SECURITY_GROUP_NAME,
        Description="Shorlabs - ECS EC2 container instances",
        VpcId=vpc_id,
        TagSpecifications=[
            {
                "ResourceType": "security-group",
                "Tags": [
                    {"Key": "Name", "Value": ECS_EC2_SECURITY_GROUP_NAME},
                    {"Key": "managed-by", "Value": "shorlabs"},
                ],
            }
        ],
    )
    sg_id = response["GroupId"]

    # Allow inbound on container port from ALB security group
    ec2.authorize_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[
            {
                "IpProtocol": "tcp",
                "FromPort": ECS_CONTAINER_PORT,
                "ToPort": ECS_CONTAINER_PORT,
                "UserIdGroupPairs": [{"GroupId": alb_sg_id}],
            }
        ],
    )

    print(f"✅ EC2 instance security group created: {sg_id}")
    return sg_id


def ensure_launch_template(
    project_name: str,
    cluster_name: str,
    instance_profile_arn: str,
    security_group_id: str,
    instance_type: str = None,
) -> tuple:
    """
    Create or update an EC2 launch template for ECS container instances.

    The launch template configures:
    - ECS-optimized ARM64 AMI
    - Instance profile for ECS agent
    - User data script to join the correct ECS cluster
    - Security group for the instance

    Args:
        project_name: Service project name for naming
        cluster_name: ECS cluster name the instances should join
        instance_profile_arn: IAM instance profile ARN
        security_group_id: Security group ID for EC2 instances
        instance_type: EC2 instance type (default from config)

    Returns:
        Tuple of (launch_template_id, instance_type_changed: bool)
    """
    ec2 = get_ec2_client()
    instance_type = instance_type or DEFAULT_INSTANCE_TYPE
    lt_name = f"{ECS_LAUNCH_TEMPLATE_PREFIX}-{project_name}"

    ami_id = get_ecs_optimized_ami()

    # User data script to configure ECS agent to join the correct cluster
    user_data_script = f"""#!/bin/bash
echo "ECS_CLUSTER={cluster_name}" >> /etc/ecs/ecs.config
echo "ECS_ENABLE_TASK_ENI=true" >> /etc/ecs/ecs.config
"""
    user_data_b64 = base64.b64encode(user_data_script.encode()).decode()

    launch_template_data = {
        "ImageId": ami_id,
        "InstanceType": instance_type,
        "IamInstanceProfile": {"Arn": instance_profile_arn},
        "SecurityGroupIds": [security_group_id],
        "UserData": user_data_b64,
        "TagSpecifications": [
            {
                "ResourceType": "instance",
                "Tags": [
                    {"Key": "Name", "Value": f"shorlabs-ecs-{project_name}"},
                    {"Key": "managed-by", "Value": "shorlabs"},
                    {"Key": "service", "Value": project_name},
                ],
            }
        ],
    }

    # Check if launch template exists — create new version if so
    try:
        response = ec2.describe_launch_templates(
            LaunchTemplateNames=[lt_name],
        )
        templates = response.get("LaunchTemplates", [])
        if templates:
            lt_id = templates[0]["LaunchTemplateId"]

            # Check if instance type changed by reading the current default version
            instance_type_changed = False
            try:
                ver_resp = ec2.describe_launch_template_versions(
                    LaunchTemplateId=lt_id,
                    Versions=["$Default"],
                )
                current_data = ver_resp["LaunchTemplateVersions"][0]["LaunchTemplateData"]
                old_instance_type = current_data.get("InstanceType", "")
                if old_instance_type != instance_type:
                    instance_type_changed = True
                    print(f"🔄 Instance type changing: {old_instance_type} → {instance_type}")
            except Exception:
                pass

            print(f"🔧 Updating launch template: {lt_name}")
            ec2.create_launch_template_version(
                LaunchTemplateId=lt_id,
                LaunchTemplateData=launch_template_data,
            )
            # Set latest version as default
            ec2.modify_launch_template(
                LaunchTemplateId=lt_id,
                DefaultVersion="$Latest",
            )
            print(f"✅ Launch template updated: {lt_name} ({lt_id})")
            return lt_id, instance_type_changed
    except ec2.exceptions.ClientError:
        pass

    print(f"🔧 Creating launch template: {lt_name}")
    response = ec2.create_launch_template(
        LaunchTemplateName=lt_name,
        LaunchTemplateData=launch_template_data,
    )
    lt_id = response["LaunchTemplate"]["LaunchTemplateId"]
    print(f"✅ Launch template created: {lt_name} ({lt_id})")
    return lt_id, False  # Fresh create, no instance type change


def ensure_auto_scaling_group(
    project_name: str,
    launch_template_id: str,
    subnet_ids: list,
    max_size: int = 1,
    instance_type_changed: bool = False,
) -> tuple:
    """
    Create or update an Auto Scaling Group for ECS container instances.

    The ASG starts with MinSize=0 and DesiredCapacity=0. ECS managed scaling
    will provision instances as needed when tasks are placed.

    Args:
        project_name: Service project name for naming
        launch_template_id: EC2 launch template ID
        subnet_ids: VPC subnet IDs for instance placement
        max_size: Maximum number of instances
        instance_type_changed: If True, triggers instance refresh to replace running instances

    Returns:
        Tuple of (asg_name, instance_refresh_started: bool)
    """
    autoscaling = get_autoscaling_client()
    asg_name = f"{ECS_ASG_PREFIX}-{project_name}"

    # Check if ASG exists
    try:
        response = autoscaling.describe_auto_scaling_groups(
            AutoScalingGroupNames=[asg_name],
        )
        groups = response.get("AutoScalingGroups", [])
        if groups:
            print(f"🔧 Updating ASG: {asg_name}")
            autoscaling.update_auto_scaling_group(
                AutoScalingGroupName=asg_name,
                LaunchTemplate={
                    "LaunchTemplateId": launch_template_id,
                    "Version": "$Latest",
                },
                MaxSize=max_size,
                VPCZoneIdentifier=",".join(subnet_ids),
            )
            # Only trigger instance refresh when the instance type actually
            # changed — otherwise we'd needlessly replace running instances
            # on every normal redeploy.
            refresh_started = False
            if instance_type_changed:
                try:
                    autoscaling.start_instance_refresh(
                        AutoScalingGroupName=asg_name,
                        Strategy="Rolling",
                        Preferences={
                            "MinHealthyPercentage": 0,
                            "InstanceWarmup": 120,
                        },
                    )
                    refresh_started = True
                    print(f"🔄 Instance refresh started (replacing old instances with new type)")
                except Exception as e:
                    if "in progress" in str(e).lower():
                        refresh_started = True
                        print(f"🔄 Instance refresh already in progress")
                    else:
                        print(f"⚠️ Could not start instance refresh: {e}")
            print(f"✅ ASG updated: {asg_name}")
            return asg_name, refresh_started
    except Exception:
        pass

    print(f"🔧 Creating ASG: {asg_name}")
    import time
    for attempt in range(12):
        try:
            autoscaling.create_auto_scaling_group(
                AutoScalingGroupName=asg_name,
                LaunchTemplate={
                    "LaunchTemplateId": launch_template_id,
                    "Version": "$Latest",
                },
                MinSize=0,
                MaxSize=max_size,
                DesiredCapacity=0,
                VPCZoneIdentifier=",".join(subnet_ids),
                NewInstancesProtectedFromScaleIn=False,
                Tags=[
                    {
                        "Key": "Name",
                        "Value": f"shorlabs-ecs-{project_name}",
                        "PropagateAtLaunch": True,
                    },
                    {
                        "Key": "managed-by",
                        "Value": "shorlabs",
                        "PropagateAtLaunch": True,
                    },
                    {
                        "Key": "AmazonECSManaged",
                        "Value": "true",
                        "PropagateAtLaunch": True,
                    },
                ],
            )
            break
        except autoscaling.exceptions.AlreadyExistsFault:
            if attempt < 11:
                wait_secs = 10
                print(f"  ⏳ ASG pending delete, waiting {wait_secs}s... ({attempt + 1}/12)")
                time.sleep(wait_secs)
            else:
                raise Exception(f"ASG {asg_name} still pending delete after 2 minutes")
    print(f"✅ ASG created: {asg_name}")
    return asg_name, False  # No instance refresh needed on fresh create


def wait_for_instance_refresh(asg_name: str, timeout: int = 300):
    """
    Wait for an ASG instance refresh to complete.

    The new EC2 instance must be running and registered with ECS before
    we can update the ECS service to use the new task definition.

    Args:
        asg_name: Auto Scaling Group name
        timeout: Maximum wait time in seconds (default 5 minutes)
    """
    autoscaling = get_autoscaling_client()
    start_time = time.time()

    print(f"⏳ Waiting for instance refresh on {asg_name}...")

    while time.time() - start_time < timeout:
        try:
            response = autoscaling.describe_instance_refreshes(
                AutoScalingGroupName=asg_name,
                MaxRecords=1,
            )
            refreshes = response.get("InstanceRefreshes", [])
            if not refreshes:
                print(f"✅ No active instance refresh (already complete)")
                return

            refresh = refreshes[0]
            status = refresh.get("Status", "")

            if status == "Successful":
                print(f"✅ Instance refresh complete")
                return
            elif status in ("Cancelled", "Failed", "RollbackSuccessful", "RollbackFailed"):
                print(f"⚠️ Instance refresh ended with status: {status}")
                return
            else:
                pct = refresh.get("PercentageComplete", 0)
                print(f"  ⏳ Instance refresh {status} ({pct}% complete)...")
        except Exception as e:
            print(f"  ⚠️ Error checking instance refresh: {e}")

        time.sleep(15)

    print(f"⚠️ Instance refresh did not complete within {timeout}s, proceeding anyway")


def ensure_ec2_capacity_provider(project_name: str, asg_name: str) -> str:
    """
    Create an ECS capacity provider wrapping the ASG with managed scaling.

    Managed scaling automatically adjusts the ASG desired count to match
    the number of tasks that need to be placed. When no tasks exist,
    the ASG scales to 0 (zero cost).

    Args:
        project_name: Service project name for naming
        asg_name: Auto Scaling Group name

    Returns:
        Capacity provider name
    """
    ecs_client = get_ecs_client()
    cp_name = f"{ECS_CAPACITY_PROVIDER_PREFIX}-{project_name}"

    # Check if capacity provider exists
    try:
        response = ecs_client.describe_capacity_providers(
            capacityProviders=[cp_name],
        )
        providers = response.get("capacityProviders", [])
        for cp in providers:
            if cp.get("status") == "ACTIVE":
                print(f"✅ Capacity provider exists: {cp_name}")
                return cp_name
    except Exception:
        pass

    print(f"🔧 Creating capacity provider: {cp_name}")

    autoscaling = get_autoscaling_client()
    # Get ASG ARN
    response = autoscaling.describe_auto_scaling_groups(
        AutoScalingGroupNames=[asg_name],
    )
    asg_arn = response["AutoScalingGroups"][0]["AutoScalingGroupARN"]

    import time
    for attempt in range(12):
        try:
            ecs_client.create_capacity_provider(
                name=cp_name,
                autoScalingGroupProvider={
                    "autoScalingGroupArn": asg_arn,
                    "managedScaling": {
                        "status": "ENABLED",
                        "targetCapacity": 100,
                        "minimumScalingStepSize": 1,
                        "maximumScalingStepSize": 1,
                    },
                    "managedTerminationProtection": "DISABLED",
                },
            )
            break
        except Exception as e:
            if "already exists" in str(e).lower() or "update in progress" in str(e).lower():
                if attempt < 11:
                    print(f"  ⏳ Capacity provider pending delete, waiting 10s... ({attempt + 1}/12)")
                    time.sleep(10)
                else:
                    raise Exception(f"Capacity provider {cp_name} still pending delete after 2 minutes")
            else:
                raise

    print(f"✅ Capacity provider created: {cp_name}")
    return cp_name
