"""
RDS Operations

Aurora Serverless v2 cluster management for database provisioning.
Uses the account's default VPC — no custom VPC/subnet setup needed.
"""

import json
import time
import traceback

from ..clients import get_rds_client, get_ec2_client, get_secretsmanager_client
from ..config import (
    AURORA_CLUSTER_PREFIX,
    DB_SECURITY_GROUP_NAME,
    DEFAULT_DB_NAME,
    DEFAULT_DB_PORT,
    DEFAULT_MIN_ACU,
    DEFAULT_MAX_ACU,
    AURORA_ENGINE_VERSION,
)


# ─────────────────────────────────────────────────────────────
# SECURITY GROUP (only EC2 API usage)
# ─────────────────────────────────────────────────────────────


def _get_default_vpc_id() -> str:
    """Get the default VPC ID for the account."""
    ec2 = get_ec2_client()
    response = ec2.describe_vpcs(Filters=[{"Name": "isDefault", "Values": ["true"]}])
    vpcs = response.get("Vpcs", [])
    if not vpcs:
        raise Exception("No default VPC found. Please create a default VPC in your AWS account.")
    return vpcs[0]["VpcId"]


def _ensure_vpc_dns_settings(vpc_id: str) -> None:
    """
    Ensure the VPC has DNS hostnames and DNS resolution enabled.

    Both are required for PubliclyAccessible RDS instances to get a
    public DNS name that resolves from outside AWS. enableDnsSupport
    is on by default, but enableDnsHostnames is OFF by default.
    Without it, the RDS endpoint hostname won't resolve externally.
    """
    ec2 = get_ec2_client()

    # Enable DNS resolution (usually already on, but ensure it)
    ec2.modify_vpc_attribute(
        VpcId=vpc_id,
        EnableDnsSupport={"Value": True},
    )

    # Enable DNS hostnames (OFF by default — this is the critical one)
    ec2.modify_vpc_attribute(
        VpcId=vpc_id,
        EnableDnsHostnames={"Value": True},
    )

    print(f"✅ VPC {vpc_id}: DNS support and DNS hostnames enabled")


def _db_security_group_name(project_id: str) -> str:
    """Per-project SG name to keep DB access policy isolated."""
    return f"{DB_SECURITY_GROUP_NAME}-{project_id[:12]}"


def ensure_db_security_group(project_id: str) -> str:
    """
    Get or create a per-project security group for PostgreSQL access.

    Idempotent: looks up by project SG name first, creates only if missing.

    Returns:
        The security group ID.
    """
    ec2 = get_ec2_client()
    vpc_id = _get_default_vpc_id()
    sg_name = _db_security_group_name(project_id)

    # Check if SG already exists
    try:
        response = ec2.describe_security_groups(
            Filters=[
                {"Name": "group-name", "Values": [sg_name]},
                {"Name": "vpc-id", "Values": [vpc_id]},
            ]
        )
        groups = response.get("SecurityGroups", [])
        if groups:
            return groups[0]["GroupId"]
    except Exception:
        pass

    # Create security group
    print(f"🔐 Creating database security group: {sg_name}")
    response = ec2.create_security_group(
        GroupName=sg_name,
        Description=f"Shorlabs - DB access for project {project_id[:12]}",
        VpcId=vpc_id,
        TagSpecifications=[
            {
                "ResourceType": "security-group",
                "Tags": [
                    {"Key": "Name", "Value": sg_name},
                    {"Key": "managed-by", "Value": "shorlabs"},
                    {"Key": "resource-type", "Value": "database-security-group"},
                    {"Key": "project-id", "Value": project_id},
                ],
            }
        ],
    )
    sg_id = response["GroupId"]

    # Allow inbound TCP 5432 from anywhere (public access)
    ec2.authorize_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[
            {
                "IpProtocol": "tcp",
                "FromPort": DEFAULT_DB_PORT,
                "ToPort": DEFAULT_DB_PORT,
                "IpRanges": [{"CidrIp": "0.0.0.0/0", "Description": "PostgreSQL public access"}],
            }
        ],
    )

    print(f"✅ Security group created: {sg_id}")
    return sg_id


def delete_db_security_group(project_id: str) -> bool:
    """
    Delete the project's DB security group.

    Returns:
        True if deleted, False if not found.
    """
    ec2 = get_ec2_client()
    vpc_id = _get_default_vpc_id()
    sg_name = _db_security_group_name(project_id)

    response = ec2.describe_security_groups(
        Filters=[
            {"Name": "group-name", "Values": [sg_name]},
            {"Name": "vpc-id", "Values": [vpc_id]},
        ]
    )
    groups = response.get("SecurityGroups", [])
    if not groups:
        print(f"   Security group {sg_name} not found (already deleted)")
        return False

    sg_id = groups[0]["GroupId"]

    for attempt in range(8):
        try:
            ec2.delete_security_group(GroupId=sg_id)
            print(f"✅ Security group deleted: {sg_id}")
            return True
        except Exception as e:
            # RDS can take a short time to detach SGs after cluster deletion.
            if "DependencyViolation" in str(e) and attempt < 7:
                time.sleep(5)
                continue
            raise

    return False


def get_cluster_security_group_ids(cluster_identifier: str) -> list[str]:
    """Get VPC security group IDs attached to an Aurora cluster."""
    rds = get_rds_client()
    try:
        response = rds.describe_db_clusters(DBClusterIdentifier=cluster_identifier)
        cluster = response["DBClusters"][0]
        sg_ids = [sg["VpcSecurityGroupId"] for sg in cluster.get("VpcSecurityGroups", [])]
        print(f"🔎 RDS SG IDS: cluster={cluster_identifier} sg_ids={sg_ids}")
        return sg_ids
    except Exception as e:
        print(f"❌ RDS SG IDS ERROR: cluster={cluster_identifier} error={type(e).__name__}: {e}")
        print(traceback.format_exc())
        raise


def get_security_group_rules(sg_id: str) -> dict:
    """
    Get inbound and outbound rules for a security group.

    Uses describe_security_group_rules (newer API) which returns
    individual SecurityGroupRuleId per rule.

    Returns:
        Dict with security_group_id, inbound (list), outbound (list).
    """
    ec2 = get_ec2_client()
    try:
        response = ec2.describe_security_group_rules(
            Filters=[{"Name": "group-id", "Values": [sg_id]}],
            MaxResults=1000,
        )
    except Exception as e:
        print(f"❌ EC2 SG RULES ERROR: sg_id={sg_id} error={type(e).__name__}: {e}")
        print(traceback.format_exc())
        raise

    inbound = []
    outbound = []

    for rule in response.get("SecurityGroupRules", []):
        parsed = {
            "rule_id": rule["SecurityGroupRuleId"],
            "security_group_id": rule.get("GroupId", sg_id),
            "protocol": rule.get("IpProtocol", "-1"),
            "from_port": rule.get("FromPort"),
            "to_port": rule.get("ToPort"),
            "cidr_ipv4": rule.get("CidrIpv4"),
            "cidr_ipv6": rule.get("CidrIpv6"),
            "description": rule.get("Description"),
        }
        if rule.get("IsEgress"):
            outbound.append(parsed)
        else:
            inbound.append(parsed)

    result = {
        "security_group_id": sg_id,
        "inbound": inbound,
        "outbound": outbound,
    }
    print(f"🔎 EC2 SG RULES: sg_id={sg_id} inbound={len(inbound)} outbound={len(outbound)}")
    return result


# ─────────────────────────────────────────────────────────────
# DB SUBNET GROUP (public subnets for external DNS resolution)
# ─────────────────────────────────────────────────────────────

DB_SUBNET_GROUP_NAME = "shorlabs-db-public-subnets"


def ensure_db_subnet_group() -> str:
    """
    Get or create a DB subnet group using the default VPC's public subnets.

    A PubliclyAccessible RDS instance must be in public subnets (subnets
    with a route to an internet gateway) for its hostname to resolve
    from outside AWS. Without an explicit subnet group, Aurora may use
    private subnets and the endpoint DNS won't resolve externally.

    Idempotent: reuses existing subnet group if present.

    Returns:
        The DB subnet group name.
    """
    rds = get_rds_client()
    ec2 = get_ec2_client()

    # Check if subnet group already exists
    try:
        rds.describe_db_subnet_groups(DBSubnetGroupName=DB_SUBNET_GROUP_NAME)
        return DB_SUBNET_GROUP_NAME
    except rds.exceptions.DBSubnetGroupNotFoundFault:
        pass

    # Get the default VPC's subnets that have a route to an internet gateway
    vpc_id = _get_default_vpc_id()
    subnets_resp = ec2.describe_subnets(
        Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]
    )
    subnet_ids = [s["SubnetId"] for s in subnets_resp["Subnets"]]

    if len(subnet_ids) < 2:
        raise Exception(
            f"Need at least 2 subnets in the default VPC for a DB subnet group, found {len(subnet_ids)}"
        )

    # Filter to public subnets (those with MapPublicIpOnLaunch or a route to an IGW)
    route_tables_resp = ec2.describe_route_tables(
        Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]
    )
    # Find subnets that have a route to an internet gateway
    public_subnet_ids = set()
    for rt in route_tables_resp["RouteTables"]:
        has_igw = any(
            r.get("GatewayId", "").startswith("igw-")
            for r in rt.get("Routes", [])
        )
        if has_igw:
            associations = rt.get("Associations", [])
            for assoc in associations:
                if assoc.get("Main", False):
                    # Main route table with IGW → all subnets without explicit association are public
                    public_subnet_ids.update(subnet_ids)
                elif assoc.get("SubnetId"):
                    public_subnet_ids.add(assoc["SubnetId"])

    # Intersect with actual subnet IDs
    public_subnet_ids = list(public_subnet_ids & set(subnet_ids))

    if len(public_subnet_ids) < 2:
        raise Exception(
            f"Need at least 2 public subnets for a DB subnet group, found {len(public_subnet_ids)}"
        )

    print(f"🔐 Creating DB subnet group: {DB_SUBNET_GROUP_NAME} with {len(public_subnet_ids)} public subnets")
    rds.create_db_subnet_group(
        DBSubnetGroupName=DB_SUBNET_GROUP_NAME,
        DBSubnetGroupDescription="Shorlabs - Public subnets for externally accessible databases",
        SubnetIds=public_subnet_ids,
    )

    print(f"✅ DB subnet group created: {DB_SUBNET_GROUP_NAME}")
    return DB_SUBNET_GROUP_NAME


# ─────────────────────────────────────────────────────────────
# AURORA CLUSTER MANAGEMENT
# ─────────────────────────────────────────────────────────────

AURORA_SERVERLESS_V2_MIN_MAX_ACU = 1.0


def _round_to_half_step(value: float) -> float:
    """Aurora Serverless v2 scaling values must be in 0.5 ACU increments."""
    return round(float(value) * 2) / 2


def _normalize_serverless_v2_capacity(min_acu: float, max_acu: float) -> tuple[float, float]:
    """
    Normalize Aurora Serverless v2 capacity values to AWS-compatible bounds.

    AWS requires:
    - 0.5 ACU increments
    - MaxCapacity > 0.5 (effectively >= 1.0)
    - MaxCapacity >= MinCapacity
    """
    try:
        parsed_min = float(min_acu)
    except (TypeError, ValueError):
        parsed_min = DEFAULT_MIN_ACU

    try:
        parsed_max = float(max_acu)
    except (TypeError, ValueError):
        parsed_max = DEFAULT_MAX_ACU

    normalized_min = max(0.0, _round_to_half_step(parsed_min))
    normalized_max = max(AURORA_SERVERLESS_V2_MIN_MAX_ACU, _round_to_half_step(parsed_max))

    if normalized_max < normalized_min:
        normalized_max = normalized_min

    return normalized_min, normalized_max


def get_cluster_identifier(project_id: str) -> str:
    """Generate a unique Aurora cluster identifier from project ID."""
    return f"{AURORA_CLUSTER_PREFIX}-db-{project_id[:8]}"


def get_instance_identifier(project_id: str) -> str:
    """Generate a unique Aurora instance identifier from project ID."""
    return f"{AURORA_CLUSTER_PREFIX}-db-{project_id[:8]}-instance"


def create_aurora_cluster(
    project_id: str,
    db_name: str = DEFAULT_DB_NAME,
    security_group_id: str = None,
    db_subnet_group_name: str = None,
    min_acu: float = DEFAULT_MIN_ACU,
    max_acu: float = DEFAULT_MAX_ACU,
) -> dict:
    """
    Create an Aurora Serverless v2 PostgreSQL cluster + instance.

    Uses manage_master_user_password=True so RDS auto-creates and rotates
    the master password in Secrets Manager.

    Args:
        project_id: Unique project identifier
        db_name: Initial database name
        security_group_id: VPC security group for port 5432 access
        db_subnet_group_name: DB subnet group with public subnets (required for external DNS)
        min_acu: Minimum ACU (0 = scale to zero)
        max_acu: Maximum ACU

    Returns:
        Dict with cluster_identifier, instance_identifier, db_name, master_username
    """
    rds = get_rds_client()

    cluster_id = get_cluster_identifier(project_id)
    instance_id = get_instance_identifier(project_id)
    master_username = "shorlabs_admin"

    normalized_min_acu, normalized_max_acu = _normalize_serverless_v2_capacity(min_acu, max_acu)
    if (normalized_min_acu, normalized_max_acu) != (min_acu, max_acu):
        print(
            "⚠️ Adjusted Aurora Serverless v2 capacity from "
            f"{min_acu}-{max_acu} to {normalized_min_acu}-{normalized_max_acu} ACU"
        )

    # Build cluster params
    cluster_params = {
        "DBClusterIdentifier": cluster_id,
        "Engine": "aurora-postgresql",
        "DatabaseName": db_name,
        "MasterUsername": master_username,
        "ManageMasterUserPassword": True,  # Auto-manage via Secrets Manager
        "StorageEncrypted": True,  # Required for managed credentials (uses default aws/rds KMS key)
        "ServerlessV2ScalingConfiguration": {
            "MinCapacity": normalized_min_acu,
            "MaxCapacity": normalized_max_acu,
        },
    }

    if security_group_id:
        cluster_params["VpcSecurityGroupIds"] = [security_group_id]

    if db_subnet_group_name:
        cluster_params["DBSubnetGroupName"] = db_subnet_group_name

    # Step 1: Create the cluster
    print(f"🗄️ Creating Aurora Serverless v2 cluster: {cluster_id}")
    response = rds.create_db_cluster(**cluster_params)
    cluster = response["DBCluster"]

    # Step 2: Create the serverless instance
    print(f"🗄️ Creating Aurora Serverless v2 instance: {instance_id}")
    rds.create_db_instance(
        DBInstanceIdentifier=instance_id,
        DBClusterIdentifier=cluster_id,
        DBInstanceClass="db.serverless",
        Engine="aurora-postgresql",
        PubliclyAccessible=True,
    )

    return {
        "cluster_identifier": cluster_id,
        "instance_identifier": instance_id,
        "db_name": db_name,
        "master_username": master_username,
    }


def wait_for_cluster_available(cluster_identifier: str, timeout: int = 900) -> dict:
    """
    Poll until the Aurora cluster AND its writer instance are both available.

    The cluster can report "available" before the writer instance is ready.
    Connections will fail until the instance is also available, so we must
    wait for both.

    Args:
        cluster_identifier: The DB cluster identifier
        timeout: Max wait time in seconds (default 15 minutes)

    Returns:
        Dict with endpoint, port, secret_arn
    """
    rds = get_rds_client()
    start = time.time()
    poll_interval = 15

    print(f"⏳ Waiting for cluster {cluster_identifier} to become available...")

    while time.time() - start < timeout:
        response = rds.describe_db_clusters(DBClusterIdentifier=cluster_identifier)
        cluster = response["DBClusters"][0]
        cluster_status = cluster["Status"]

        if cluster_status == "available":
            # Cluster is ready — now check if the writer instance is also available
            members = cluster.get("DBClusterMembers", [])
            writer_instance_id = None
            for member in members:
                if member.get("IsClusterWriter"):
                    writer_instance_id = member["DBInstanceIdentifier"]
                    break

            if writer_instance_id:
                try:
                    inst_response = rds.describe_db_instances(DBInstanceIdentifier=writer_instance_id)
                    instance = inst_response["DBInstances"][0]
                    instance_status = instance["DBInstanceStatus"]

                    if instance_status == "available":
                        endpoint = cluster["Endpoint"]
                        port = cluster["Port"]
                        secret_arn = cluster.get("MasterUserSecret", {}).get("SecretArn")

                        print(f"✅ Cluster + writer instance available: {endpoint}:{port}")
                        return {
                            "endpoint": endpoint,
                            "port": port,
                            "secret_arn": secret_arn,
                        }
                    else:
                        elapsed = int(time.time() - start)
                        print(f"   Cluster available, writer instance: {instance_status} ({elapsed}s elapsed)")
                except Exception:
                    elapsed = int(time.time() - start)
                    print(f"   Cluster available, waiting for writer instance to appear ({elapsed}s elapsed)")
            else:
                elapsed = int(time.time() - start)
                print(f"   Cluster available, no writer instance registered yet ({elapsed}s elapsed)")
        else:
            elapsed = int(time.time() - start)
            print(f"   Cluster status: {cluster_status} ({elapsed}s elapsed)")

        time.sleep(poll_interval)

    raise Exception(f"Cluster {cluster_identifier} did not become available within {timeout}s")


def get_cluster_status(cluster_identifier: str) -> dict:
    """
    Get current cluster status and connection details.

    Returns:
        Dict with status, endpoint, port, or None if not found
    """
    rds = get_rds_client()
    try:
        response = rds.describe_db_clusters(DBClusterIdentifier=cluster_identifier)
        cluster = response["DBClusters"][0]
        return {
            "status": cluster["Status"],
            "endpoint": cluster.get("Endpoint"),
            "port": cluster.get("Port"),
        }
    except rds.exceptions.DBClusterNotFoundFault:
        return None


def get_cluster_secret(cluster_identifier: str) -> dict:
    """
    Retrieve the master credentials from Secrets Manager.

    When manage_master_user_password=True, RDS auto-creates a secret.
    The secret ARN is in the cluster's MasterUserSecret.SecretArn.

    Returns:
        Dict with username and password
    """
    rds = get_rds_client()
    sm = get_secretsmanager_client()

    # Get secret ARN from cluster
    response = rds.describe_db_clusters(DBClusterIdentifier=cluster_identifier)
    cluster = response["DBClusters"][0]
    secret_arn = cluster.get("MasterUserSecret", {}).get("SecretArn")

    if not secret_arn:
        raise Exception(f"No managed secret found for cluster {cluster_identifier}")

    # Retrieve the secret value
    secret_response = sm.get_secret_value(SecretId=secret_arn)
    secret_data = json.loads(secret_response["SecretString"])

    return {
        "username": secret_data.get("username"),
        "password": secret_data.get("password"),
    }


def delete_aurora_cluster(cluster_identifier: str) -> bool:
    """
    Delete an Aurora cluster and its instances.

    Steps:
    1. Delete all DB instances in the cluster
    2. Wait for instance deletion
    3. Delete the cluster (skip final snapshot)

    Returns:
        True if deleted, False if not found
    """
    rds = get_rds_client()

    try:
        # Step 1: Find and delete all instances
        response = rds.describe_db_clusters(DBClusterIdentifier=cluster_identifier)
        cluster = response["DBClusters"][0]
        members = cluster.get("DBClusterMembers", [])

        for member in members:
            instance_id = member["DBInstanceIdentifier"]
            print(f"🗑️ Deleting DB instance: {instance_id}")
            try:
                rds.delete_db_instance(
                    DBInstanceIdentifier=instance_id,
                    SkipFinalSnapshot=True,
                )
            except rds.exceptions.DBInstanceNotFoundFault:
                print(f"   Instance {instance_id} already deleted")

        # Step 2: Wait for instances to be deleted
        if members:
            print("⏳ Waiting for instance deletion...")
            for member in members:
                instance_id = member["DBInstanceIdentifier"]
                try:
                    waiter = rds.get_waiter("db_instance_deleted")
                    waiter.wait(
                        DBInstanceIdentifier=instance_id,
                        WaiterConfig={"Delay": 15, "MaxAttempts": 40},
                    )
                except Exception:
                    pass  # Instance may already be gone

        # Step 3: Delete the cluster
        print(f"🗑️ Deleting Aurora cluster: {cluster_identifier}")
        rds.delete_db_cluster(
            DBClusterIdentifier=cluster_identifier,
            SkipFinalSnapshot=True,
        )

        print(f"✅ Cluster {cluster_identifier} deleted")
        return True

    except rds.exceptions.DBClusterNotFoundFault:
        print(f"   Cluster {cluster_identifier} not found (already deleted)")
        return False
