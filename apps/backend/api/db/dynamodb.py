"""
DynamoDB operations for Shorlabs projects and deployments.
"""
import os
import re
import time
import uuid
import random
import string
from typing import Optional
from datetime import datetime
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

# Table name
TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "shorlabs-projects")

# Shorlabs domain for custom URLs
SHORLABS_DOMAIN = os.environ.get("SHORLABS_DOMAIN", "shorlabs.com")

# DynamoDB client
dynamodb = boto3.resource("dynamodb")


def get_or_create_table():
    """Get or create the DynamoDB table."""
    try:
        table = dynamodb.Table(TABLE_NAME)
        table.load()
        return table
    except dynamodb.meta.client.exceptions.ResourceNotFoundException:
        pass

    print(f"📦 Creating DynamoDB table: {TABLE_NAME}")
    table = dynamodb.create_table(
        TableName=TABLE_NAME,
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
            {"AttributeName": "project_id", "AttributeType": "S"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "project-id-index",
                "KeySchema": [
                    {"AttributeName": "project_id", "KeyType": "HASH"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    table.wait_until_exists()
    print(f"✅ Created DynamoDB table: {TABLE_NAME}")
    return table


def generate_project_id() -> str:
    """Generate a unique project ID."""
    return uuid.uuid4().hex[:12]


def generate_deploy_id() -> str:
    """Generate a unique deployment ID (Vercel-style)."""
    chars = string.ascii_letters + string.digits
    return ''.join(random.choices(chars, k=9))


# ─────────────────────────────────────────────────────────────
# PROJECT OPERATIONS
# ─────────────────────────────────────────────────────────────


def slugify(text: str) -> str:
    """
    Convert a string to a URL-friendly slug.
    
    Examples:
        "My Project" -> "my-project"
        "Test App 123" -> "test-app-123"
    """
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    text = text.strip('-')
    return text[:50]  # Max 50 chars for subdomain


def generate_unique_subdomain(project_name: str) -> str:
    """
    Generate a unique subdomain for a project.
    
    If the base subdomain is taken, adds a random suffix.
    
    Examples:
        "My Project" -> "my-project"
        "My Project" (if taken) -> "my-project-7x8k"
    """
    base = slugify(project_name)
    if not base:
        base = "project"
    
    subdomain = base
    
    # Check if subdomain is already taken
    attempt = 0
    while get_project_by_subdomain(subdomain) is not None:
        suffix = uuid.uuid4().hex[:4]
        subdomain = f"{base}-{suffix}"
        attempt += 1
        if attempt > 10:
            # Fallback to full UUID if too many collisions
            subdomain = f"{base}-{uuid.uuid4().hex[:8]}"
            break
    
    return subdomain


def get_project_by_subdomain(subdomain: str) -> Optional[dict]:
    """
    Look up a project by its subdomain.
    
    Used by the Lambda@Edge router to resolve subdomain -> Lambda URL.
    
    Args:
        subdomain: The subdomain to look up (e.g., "my-project")
        
    Returns:
        Project dict if found, None otherwise
    """
    table = get_or_create_table()
    
    # Scan for projects with matching subdomain
    # Note: In production with many projects, use a GSI on subdomain
    response = table.scan(
        FilterExpression="subdomain = :sd AND begins_with(SK, :sk_prefix)",
        ExpressionAttributeValues={
            ":sd": subdomain,
            ":sk_prefix": "PROJECT#",
        },
    )
    items = response.get("Items", [])
    return items[0] if items else None


def create_project(
    user_id: str,
    name: str,
    github_url: str,
    github_repo: str,
    env_vars: dict = None,
    root_directory: str = "./",
    start_command: str = "uvicorn main:app --host 0.0.0.0 --port 8080",
    subdomain: str = None,
    memory: int = 1024,
    timeout: int = 30,
    ephemeral_storage: int = 512,
) -> dict:
    """Create a new project with automatic subdomain generation."""
    table = get_or_create_table()
    project_id = generate_project_id()
    now = datetime.utcnow().isoformat()
    
    # Generate unique subdomain if not provided
    if not subdomain:
        subdomain = generate_unique_subdomain(name)
    
    # Build custom URL
    custom_url = f"https://{subdomain}.{SHORLABS_DOMAIN}"

    item = {
        "PK": f"USER#{user_id}",
        "SK": f"PROJECT#{project_id}",
        "project_id": project_id,
        "user_id": user_id,
        "name": name,
        "github_url": github_url,
        "github_repo": github_repo,
        "status": "PENDING",
        "function_url": None,
        "ecr_repo": None,
        "env_vars": env_vars or {},
        "root_directory": root_directory,
        "start_command": start_command,
        "subdomain": subdomain,
        "custom_url": custom_url,
        "memory": memory,
        "timeout": timeout,
        "ephemeral_storage": ephemeral_storage,
        "created_at": now,
        "updated_at": now,
    }
    table.put_item(Item=item)
    return item


def get_project(project_id: str) -> Optional[dict]:
    """Get a project by ID using GSI."""
    table = get_or_create_table()
    response = table.query(
        IndexName="project-id-index",
        KeyConditionExpression=Key("project_id").eq(project_id),
    )
    items = response.get("Items", [])
    # Filter for project items (though GSI should only have them if designed right, 
    # but here project_id is shared? No, project_id is unique per project. 
    # Deployments have project_id too? Let's check GSI definition.)
    
    # The GSI is on project_id.
    # Deployment items: PK=PROJECT#id, SK=DEPLOY#...
    # Project items: PK=USER#id, SK=PROJECT#id
    
    # The GSI KeySchema is just project_id. 
    # Both Project and Deployment items have 'project_id' attribute.
    # So querying GSI by project_id will return both Project and Deployments.
    # We need to filter for the one that looks like a project (has status, name, etc, or SK starts with PROJECT#)
    # But wait, GSI doesn't project PK/SK by default? PROJECTION TYPE ALL. So it does.
    
    # Let's filter in python for safety.
    project_items = [i for i in items if i.get("SK", "").startswith("PROJECT#")]
    return project_items[0] if project_items else None


def get_project_by_key(user_id: str, project_id: str) -> Optional[dict]:
    """
    Get a project by User ID and Project ID using direct GetItem.
    
    This provides strong consistency, suitable for read-after-write scenarios
    like redeploying immediately after updates.
    """
    table = get_or_create_table()
    response = table.get_item(
        Key={
            "PK": f"USER#{user_id}",
            "SK": f"PROJECT#{project_id}",
        },
        ConsistentRead=True,
    )
    return response.get("Item")


def list_projects(user_id: str) -> list:
    """List all projects for a user."""
    table = get_or_create_table()
    response = table.query(
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}")
        & Key("SK").begins_with("PROJECT#"),
    )
    return response.get("Items", [])


def update_project(project_id: str, updates: dict) -> Optional[dict]:
    """Update a project."""
    project = get_project(project_id)
    if not project:
        return None

    table = get_or_create_table()
    updates["updated_at"] = datetime.utcnow().isoformat()

    update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates.keys())
    expr_names = {f"#{k}": k for k in updates.keys()}
    expr_values = {f":{k}": v for k, v in updates.items()}

    response = table.update_item(
        Key={"PK": project["PK"], "SK": project["SK"]},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    return response.get("Attributes")


def delete_project(project_id: str) -> bool:
    """Delete a project and its deployments."""
    project = get_project(project_id)
    if not project:
        return False

    table = get_or_create_table()

    # Delete all deployments
    deployments = list_deployments(project_id)
    for d in deployments:
        table.delete_item(Key={"PK": d["PK"], "SK": d["SK"]})

    # Delete project
    table.delete_item(Key={"PK": project["PK"], "SK": project["SK"]})
    return True


# ─────────────────────────────────────────────────────────────
# DEPLOYMENT OPERATIONS
# ─────────────────────────────────────────────────────────────


def create_deployment(
    project_id: str,
    build_id: str,
) -> dict:
    """Create a new deployment record."""
    table = get_or_create_table()
    deploy_id = generate_deploy_id()
    now = datetime.utcnow().isoformat()
    timestamp = int(time.time())

    item = {
        "PK": f"PROJECT#{project_id}",
        "SK": f"DEPLOY#{timestamp}#{deploy_id}",
        "deploy_id": deploy_id,
        "project_id": project_id,
        "build_id": build_id,
        "status": "IN_PROGRESS",
        "logs_url": None,
        "started_at": now,
        "finished_at": None,
    }
    table.put_item(Item=item)
    return item


def list_deployments(project_id: str) -> list:
    """List all deployments for a project (newest first)."""
    table = get_or_create_table()
    response = table.query(
        KeyConditionExpression=Key("PK").eq(f"PROJECT#{project_id}")
        & Key("SK").begins_with("DEPLOY#"),
        ScanIndexForward=False,  # Newest first
    )
    return response.get("Items", [])


def get_deployment(project_id: str, deploy_id: str) -> Optional[dict]:
    """
    Get a specific deployment by ID.
    
    Args:
        project_id: The project ID
        deploy_id: The deployment ID (e.g., "deploy_abc123")
        
    Returns:
        Deployment dict if found, None otherwise
    """
    deployments = list_deployments(project_id)
    return next((d for d in deployments if d["deploy_id"] == deploy_id), None)


def update_deployment(project_id: str, deploy_id: str, updates: dict) -> Optional[dict]:
    """Update a deployment."""
    table = get_or_create_table()

    # Find the deployment
    deployments = list_deployments(project_id)
    deployment = next((d for d in deployments if d["deploy_id"] == deploy_id), None)
    if not deployment:
        return None

    update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates.keys())
    expr_names = {f"#{k}": k for k in updates.keys()}
    expr_values = {f":{k}": v for k, v in updates.items()}

    response = table.update_item(
        Key={"PK": deployment["PK"], "SK": deployment["SK"]},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    return response.get("Attributes")


# ─────────────────────────────────────────────────────────────
# USAGE METRICS OPERATIONS
# ─────────────────────────────────────────────────────────────

# Usage metrics table name
USAGE_TABLE_NAME = "user-usage-metrics"


def get_usage_table():
    """Get the usage metrics table."""
    return dynamodb.Table(USAGE_TABLE_NAME)


def get_current_period() -> str:
    """Get current billing period in YYYY-MM format."""
    return datetime.utcnow().strftime("%Y-%m")


def get_user_usage(user_id: str, period: str = None) -> Optional[dict]:
    """
    Get usage metrics for a user in a specific period.
    
    Args:
        user_id: User ID
        period: Billing period (YYYY-MM). Defaults to current period.
        
    Returns:
        Usage dict with requests and gb_seconds, or None if not found
    """
    if period is None:
        period = get_current_period()
    
    table = get_usage_table()
    
    try:
        response = table.get_item(
            Key={
                "user_id": user_id,
                "period": period,
            }
        )
        return response.get("Item")
    except Exception as e:
        print(f"Error getting usage for user {user_id}: {e}")
        return None


def update_user_usage(user_id: str, period: str, metrics: dict) -> dict:
    """
    Update usage metrics for a user in a specific period.
    
    Args:
        user_id: User ID
        period: Billing period (YYYY-MM)
        metrics: Dict with 'requests' and 'gb_seconds' keys
        
    Returns:
        Updated usage dict
    """
    table = get_usage_table()
    now = datetime.utcnow().isoformat()
    
    item = {
        "user_id": user_id,
        "period": period,
        "requests": metrics.get("requests", 0),
        "gb_seconds": Decimal(str(metrics.get("gb_seconds", 0.0))),  # DynamoDB requires Decimal
        "last_updated": now,
        "functions": metrics.get("functions", {}),
    }
    
    table.put_item(Item=item)
    return item


def increment_user_usage(
    user_id: str,
    period: str,
    requests: int,
    gb_seconds: float,
    function_name: str = None
) -> dict:
    """
    Increment usage metrics for a user atomically.
    
    Args:
        user_id: User ID
        period: Billing period (YYYY-MM)
        requests: Number of requests to add
        gb_seconds: GB-Seconds to add
        function_name: Optional function name for per-function tracking
        
    Returns:
        Updated usage dict
    """
    table = get_usage_table()
    now = datetime.utcnow().isoformat()
    
    update_expr = "ADD requests :r, gb_seconds :gb SET last_updated = :ts"
    expr_values = {
        ":r": requests,
        ":gb": Decimal(str(gb_seconds)),  # DynamoDB requires Decimal, not float
        ":ts": now,
    }
    
    # Add per-function tracking if function_name provided
    if function_name:
        update_expr += ", #funcs.#fname.#reqs :r, #funcs.#fname.#gb :gb"
        expr_values.update({
            ":r": requests,
            ":gb": float(gb_seconds),
        })
        expr_names = {
            "#funcs": "functions",
            "#fname": function_name,
            "#reqs": "requests",
            "#gb": "gb_seconds",
        }
    else:
        expr_names = {}
    
    try:
        update_params = {
            "Key": {
                "user_id": user_id,
                "period": period,
            },
            "UpdateExpression": update_expr,
            "ExpressionAttributeValues": expr_values,
            "ReturnValues": "ALL_NEW",
        }
        # Only add ExpressionAttributeNames if we have any
        if expr_names:
            update_params["ExpressionAttributeNames"] = expr_names
        
        response = table.update_item(**update_params)
        return response.get("Attributes")
    except dynamodb.meta.client.exceptions.ResourceNotFoundException:
        # Item doesn't exist yet, create it
        return update_user_usage(user_id, period, {
            "requests": requests,
            "gb_seconds": gb_seconds,
            "functions": {function_name: {"requests": requests, "gb_seconds": gb_seconds}} if function_name else {},
        })


# ─────────────────────────────────────────────────────────────
# DATABASE TOKEN STORAGE
# ─────────────────────────────────────────────────────────────

def save_github_token(user_id: str, token: str, metadata: dict = None) -> bool:
    """
    Save or update GitHub OAuth token for a user.
    """
    table = get_or_create_table()
    now = datetime.utcnow().isoformat()
    
    item = {
        "PK": f"USER#{user_id}",
        "SK": "GITHUB#TOKEN",
        "token": token,
        "metadata": metadata or {},
        "updated_at": now,
    }
    
    table.put_item(Item=item)
    return True


def get_github_token(user_id: str) -> Optional[str]:
    """
    Get GitHub OAuth token for a user from DynamoDB.
    """
    table = get_or_create_table()
    
    response = table.get_item(
        Key={
            "PK": f"USER#{user_id}",
            "SK": "GITHUB#TOKEN",
        }
    )
    
    item = response.get("Item")
    if item:
        return item.get("token")
    return None


