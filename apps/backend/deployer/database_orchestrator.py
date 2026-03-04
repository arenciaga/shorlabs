"""
Database Orchestrator

Main provisioning logic for Aurora Serverless v2 PostgreSQL databases.
Mirrors the structure of orchestrator.py but for database resources.
"""

from typing import Optional

from .aws.rds import (
    ensure_db_security_group,
    ensure_db_subnet_group,
    create_aurora_cluster,
    wait_for_cluster_available,
    get_cluster_identifier,
    delete_aurora_cluster,
)
from .config import DEFAULT_DB_NAME, DEFAULT_MIN_ACU, DEFAULT_MAX_ACU


def provision_database(
    project_id: str,
    db_name: str = DEFAULT_DB_NAME,
    min_acu: float = DEFAULT_MIN_ACU,
    max_acu: float = DEFAULT_MAX_ACU,
) -> dict:
    """
    Provision an Aurora Serverless v2 PostgreSQL database.

    Steps:
    1. Ensure shared security group exists (port 5432 open)
    2. Create Aurora cluster + serverless instance
    3. Wait for cluster to become available
    4. Return connection details

    Args:
        project_id: Unique project identifier
        db_name: Initial database name
        min_acu: Minimum ACU (0 = scale to zero)
        max_acu: Maximum ACU

    Returns:
        Dict with cluster_identifier, endpoint, port, db_name, master_username, secret_arn
    """
    print(f"\n🗄️ Shorlabs Database Provisioner (Aurora Serverless v2)")
    print(f"   Project: {project_id}")
    print(f"   Database: {db_name}")
    print(f"   Capacity: {min_acu} - {max_acu} ACU\n")

    # Step 1: Ensure security group + public subnet group
    sg_id = ensure_db_security_group()
    print(f"✅ Security group ready: {sg_id}")

    subnet_group = ensure_db_subnet_group()
    print(f"✅ DB subnet group ready: {subnet_group}")

    # Step 2: Create cluster + instance
    result = create_aurora_cluster(
        project_id=project_id,
        db_name=db_name,
        security_group_id=sg_id,
        db_subnet_group_name=subnet_group,
        min_acu=min_acu,
        max_acu=max_acu,
    )

    # Step 3: Wait for availability
    cluster_info = wait_for_cluster_available(result["cluster_identifier"])

    print(f"\n✅ Database provisioned successfully!")
    print(f"🌐 Endpoint: {cluster_info['endpoint']}:{cluster_info['port']}")

    return {
        "cluster_identifier": result["cluster_identifier"],
        "endpoint": cluster_info["endpoint"],
        "port": cluster_info["port"],
        "db_name": db_name,
        "master_username": result["master_username"],
        "secret_arn": cluster_info["secret_arn"],
    }


def delete_database_resources(project_id: str) -> dict:
    """
    Delete Aurora cluster resources for a project.

    Does NOT delete the shared security group (reused across projects).

    Args:
        project_id: The project identifier

    Returns:
        Dict with deletion status
    """
    cluster_id = get_cluster_identifier(project_id)
    print(f"🗑️ Deleting database resources for project {project_id}")
    print(f"🗑️ Cluster identifier: {cluster_id}")

    cluster_deleted = delete_aurora_cluster(cluster_id)

    print(f"🗑️ Deletion complete - Cluster: {cluster_deleted}")

    return {
        "cluster_deleted": cluster_deleted,
    }
