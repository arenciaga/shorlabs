"""
RDS Operations

Aurora Serverless v2 cluster management for database provisioning.
Uses the account's default VPC — no custom VPC/subnet setup needed.
"""

import json
import time

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


def ensure_db_security_group() -> str:
    """
    Get or create a security group that allows PostgreSQL inbound (port 5432).

    Idempotent: looks up by group name first, creates only if missing.
    One shared SG for all database projects.

    Returns:
        The security group ID.
    """
    ec2 = get_ec2_client()
    vpc_id = _get_default_vpc_id()

    # Check if SG already exists
    try:
        response = ec2.describe_security_groups(
            Filters=[
                {"Name": "group-name", "Values": [DB_SECURITY_GROUP_NAME]},
                {"Name": "vpc-id", "Values": [vpc_id]},
            ]
        )
        groups = response.get("SecurityGroups", [])
        if groups:
            return groups[0]["GroupId"]
    except Exception:
        pass

    # Create security group
    print(f"🔐 Creating database security group: {DB_SECURITY_GROUP_NAME}")
    response = ec2.create_security_group(
        GroupName=DB_SECURITY_GROUP_NAME,
        Description="Shorlabs - Allow PostgreSQL inbound (port 5432)",
        VpcId=vpc_id,
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


# ─────────────────────────────────────────────────────────────
# AURORA CLUSTER MANAGEMENT
# ─────────────────────────────────────────────────────────────


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
    min_acu: float = DEFAULT_MIN_ACU,
    max_acu: float = DEFAULT_MAX_ACU,
) -> dict:
    """
    Create an Aurora Serverless v2 PostgreSQL cluster + instance.

    Uses manage_master_user_password=True so RDS auto-creates and rotates
    the master password in Secrets Manager.

    No DBSubnetGroupName — uses the default VPC automatically.

    Args:
        project_id: Unique project identifier
        db_name: Initial database name
        security_group_id: VPC security group for port 5432 access
        min_acu: Minimum ACU (0 = scale to zero)
        max_acu: Maximum ACU

    Returns:
        Dict with cluster_identifier, instance_identifier, db_name, master_username
    """
    rds = get_rds_client()

    cluster_id = get_cluster_identifier(project_id)
    instance_id = get_instance_identifier(project_id)
    master_username = "shorlabs_admin"

    # Build cluster params
    cluster_params = {
        "DBClusterIdentifier": cluster_id,
        "Engine": "aurora-postgresql",
        "DatabaseName": db_name,
        "MasterUsername": master_username,
        "ManageMasterUserPassword": True,  # Auto-manage via Secrets Manager
        "StorageEncrypted": True,  # Required for managed credentials (uses default aws/rds KMS key)
        "ServerlessV2ScalingConfiguration": {
            "MinCapacity": min_acu,
            "MaxCapacity": max_acu,
        },
    }

    if security_group_id:
        cluster_params["VpcSecurityGroupIds"] = [security_group_id]

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
    Poll until the Aurora cluster and its instance are available.

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
        status = cluster["Status"]

        if status == "available":
            endpoint = cluster["Endpoint"]
            port = cluster["Port"]
            secret_arn = cluster.get("MasterUserSecret", {}).get("SecretArn")

            print(f"✅ Cluster available: {endpoint}:{port}")
            return {
                "endpoint": endpoint,
                "port": port,
                "secret_arn": secret_arn,
            }

        elapsed = int(time.time() - start)
        print(f"   Status: {status} ({elapsed}s elapsed)")
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
