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

# Table names
TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "shorlabs-projects")
DEPLOYMENTS_TABLE_NAME = os.environ.get("DEPLOYMENTS_TABLE", "shorlabs-deployments")

# Shorlabs domain for custom URLs
SHORLABS_DOMAIN = os.environ.get("SHORLABS_DOMAIN", "shorlabs.com")

# DynamoDB client
dynamodb = boto3.resource("dynamodb")


def get_or_create_table():
    """
    Backwards-compatible helper for the *projects* table.
    
    NOTE: Deployments now live in a separate table. For deployments, use
    get_or_create_deployments_table instead.
    """
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


def get_or_create_deployments_table():
    """
    Get or create the dedicated deployments table.
    
    Schema:
      - PK: project_id (HASH)
      - SK: sort key, e.g. "DEPLOY#<ts>#<deploy_id>"
    """
    try:
        table = dynamodb.Table(DEPLOYMENTS_TABLE_NAME)
        table.load()
        return table
    except dynamodb.meta.client.exceptions.ResourceNotFoundException:
        pass

    print(f"📦 Creating DynamoDB deployments table: {DEPLOYMENTS_TABLE_NAME}")
    table = dynamodb.create_table(
        TableName=DEPLOYMENTS_TABLE_NAME,
        KeySchema=[
            {"AttributeName": "project_id", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "project_id", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    table.wait_until_exists()
    print(f"✅ Created DynamoDB deployments table: {DEPLOYMENTS_TABLE_NAME}")
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
    organization_id: str,
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
    """
    Create a new project owned by an organization.
    
    Projects use PK=ORG#{org_id} following Vercel's model where
    organizations own projects, not individual users.
    """
    table = get_or_create_table()
    project_id = generate_project_id()
    now = datetime.utcnow().isoformat()
    
    # Generate unique subdomain if not provided
    if not subdomain:
        subdomain = generate_unique_subdomain(name)
    
    # Build custom URL
    custom_url = f"https://{subdomain}.{SHORLABS_DOMAIN}"

    # Use ORG# for PK - organizations own projects (Vercel-like model)
    item = {
        "PK": f"ORG#{organization_id}",
        "SK": f"PROJECT#{project_id}",
        "project_id": project_id,
        "organization_id": organization_id,
        "created_by": user_id,  # Track who created it (for audit)
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
    """Get a project by ID using GSI (for update/delete operations)."""
    table = get_or_create_table()
    response = table.query(
        IndexName="project-id-index",
        KeyConditionExpression=Key("project_id").eq(project_id),
    )
    items = response.get("Items", [])
    # Filter for project items (SK starts with PROJECT#)
    project_items = [i for i in items if i.get("SK", "").startswith("PROJECT#")]
    return project_items[0] if project_items else None


def get_project_by_key(org_id: str, project_id: str) -> Optional[dict]:
    """
    Get a project by Organization ID and Project ID using direct GetItem.
    
    Projects are stored with PK=ORG#{org_id} (org-owned model).
    """
    table = get_or_create_table()
    
    response = table.get_item(
        Key={
            "PK": f"ORG#{org_id}",
            "SK": f"PROJECT#{project_id}",
        },
        ConsistentRead=True,
    )
    return response.get("Item")


def list_projects(org_id: str) -> list:
    """
    List all projects for an organization.
    
    Projects are stored with PK=ORG#{org_id} (org-owned model).
    No filtering needed - just query by org partition key.
    """
    table = get_or_create_table()
    
    response = table.query(
        KeyConditionExpression=Key("PK").eq(f"ORG#{org_id}")
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
    """Delete a project, its deployments, and any custom domain items."""
    project = get_project(project_id)
    if not project:
        return False

    projects_table = get_or_create_table()
    deployments_table = get_or_create_deployments_table()

    # Delete all custom domain items for this project
    domains = list_project_domains(project_id)
    with projects_table.batch_writer() as batch:
        for d in domains:
            batch.delete_item(Key={"PK": d["PK"], "SK": d["SK"]})

    # Delete all deployments for this project from the deployments table
    deployments = list_deployments(project_id)
    with deployments_table.batch_writer() as batch:
        for d in deployments:
            batch.delete_item(Key={"project_id": d["project_id"], "SK": d["SK"]})

    # Delete project from projects table
    projects_table.delete_item(Key={"PK": project["PK"], "SK": project["SK"]})
    return True


# ─────────────────────────────────────────────────────────────
# CUSTOM DOMAIN OPERATIONS
# ─────────────────────────────────────────────────────────────

# Custom domains are stored in the projects table with:
#   PK = DOMAIN#{domain}
#   SK = DOMAIN
# This gives O(1) lookup for Lambda@Edge routing via GetItem.

CNAME_TARGET = os.environ.get("CNAME_TARGET", "cname.shorlabs.com")


def add_custom_domain(
    org_id: str,
    project_id: str,
    domain: str,
    function_url: Optional[str] = None,
) -> dict:
    """
    Add a custom domain mapping for a project.

    Creates a DOMAIN# item in the projects table for fast edge lookups.
    """
    table = get_or_create_table()
    now = datetime.utcnow().isoformat()

    item = {
        "PK": f"DOMAIN#{domain.lower()}",
        "SK": "DOMAIN",
        "domain": domain.lower(),
        "project_id": project_id,
        "organization_id": org_id,
        "function_url": function_url,
        "status": "PENDING_VERIFICATION",
        "tenant_id": None,
        "created_at": now,
        "updated_at": now,
    }
    table.put_item(Item=item)
    return item


def get_domain_item(domain: str) -> Optional[dict]:
    """Get a custom domain item by domain name. O(1) via GetItem."""
    table = get_or_create_table()
    response = table.get_item(
        Key={"PK": f"DOMAIN#{domain.lower()}", "SK": "DOMAIN"},
    )
    return response.get("Item")


def update_domain(domain: str, updates: dict) -> Optional[dict]:
    """Update a custom domain item."""
    table = get_or_create_table()
    updates["updated_at"] = datetime.utcnow().isoformat()

    update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates.keys())
    expr_names = {f"#{k}": k for k in updates.keys()}
    expr_values = {f":{k}": v for k, v in updates.items()}

    response = table.update_item(
        Key={"PK": f"DOMAIN#{domain.lower()}", "SK": "DOMAIN"},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    return response.get("Attributes")


def delete_domain_item(domain: str) -> bool:
    """Delete a custom domain item."""
    table = get_or_create_table()
    table.delete_item(Key={"PK": f"DOMAIN#{domain.lower()}", "SK": "DOMAIN"})
    return True


def list_project_domains(project_id: str) -> list:
    """
    List all custom domain items for a project.

    Scans for DOMAIN# items with matching project_id.
    """
    table = get_or_create_table()
    response = table.scan(
        FilterExpression="project_id = :pid AND begins_with(PK, :pk_prefix)",
        ExpressionAttributeValues={
            ":pid": project_id,
            ":pk_prefix": "DOMAIN#",
        },
    )
    return response.get("Items", [])


def get_project_by_custom_domain(domain: str) -> Optional[dict]:
    """
    Look up a project by custom domain for Lambda@Edge routing.

    Returns minimal data needed for routing (function_url, status).
    """
    table = get_or_create_table()
    response = table.get_item(
        Key={"PK": f"DOMAIN#{domain.lower()}", "SK": "DOMAIN"},
        ProjectionExpression="function_url, #st, project_id",
        ExpressionAttributeNames={"#st": "status"},
    )
    item = response.get("Item")
    if item and item.get("status") == "ACTIVE":
        return item
    return None


# ─────────────────────────────────────────────────────────────
# DEPLOYMENT OPERATIONS
# ─────────────────────────────────────────────────────────────


def create_deployment(
    project_id: str,
    build_id: str,
) -> dict:
    """Create a new deployment record in the deployments table."""
    table = get_or_create_deployments_table()
    deploy_id = generate_deploy_id()
    now = datetime.utcnow().isoformat()
    timestamp = int(time.time())

    item = {
        "project_id": project_id,
        "SK": f"DEPLOY#{timestamp}#{deploy_id}",
        "deploy_id": deploy_id,
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
    table = get_or_create_deployments_table()
    response = table.query(
        KeyConditionExpression=Key("project_id").eq(project_id)
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
    table = get_or_create_deployments_table()

    # Find the deployment (by deploy_id within the project's deployments)
    deployments = list_deployments(project_id)
    deployment = next((d for d in deployments if d.get("deploy_id") == deploy_id), None)
    if not deployment:
        return None

    update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates.keys())
    expr_names = {f"#{k}": k for k in updates.keys()}
    expr_values = {f":{k}": v for k, v in updates.items()}

    response = table.update_item(
        Key={"project_id": deployment["project_id"], "SK": deployment["SK"]},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    return response.get("Attributes")


# ─────────────────────────────────────────────────────────────
# USAGE METRICS OPERATIONS (Organization-level billing)
# ─────────────────────────────────────────────────────────────

# Usage metrics table - keyed by organization_id (orgs are the billing entity)
ORG_USAGE_TABLE_NAME = "org-usage-metrics"


def get_or_create_org_usage_table():
    """
    Get or create the organization usage metrics table.
    
    Key Schema:
        - organization_id (HASH/Partition Key): The billing entity
        - period (RANGE/Sort Key): Billing period in YYYY-MM format
    """
    try:
        table = dynamodb.Table(ORG_USAGE_TABLE_NAME)
        table.load()
        return table
    except dynamodb.meta.client.exceptions.ResourceNotFoundException:
        pass

    print(f"📦 Creating DynamoDB table: {ORG_USAGE_TABLE_NAME}")
    table = dynamodb.create_table(
        TableName=ORG_USAGE_TABLE_NAME,
        KeySchema=[
            {"AttributeName": "organization_id", "KeyType": "HASH"},
            {"AttributeName": "period", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "organization_id", "AttributeType": "S"},
            {"AttributeName": "period", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    table.wait_until_exists()
    print(f"✅ Created DynamoDB table: {ORG_USAGE_TABLE_NAME}")
    return table


def get_usage_table():
    """Get the organization usage metrics table (creates if needed)."""
    return get_or_create_org_usage_table()


def get_current_period() -> str:
    """Get current billing period in YYYY-MM format."""
    return datetime.utcnow().strftime("%Y-%m")


def get_org_usage(org_id: str, period: str = None) -> Optional[dict]:
    """
    Get usage metrics for an organization in a specific billing period.
    
    Args:
        org_id: Organization ID (the billing entity)
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
                "organization_id": org_id,
                "period": period,
            }
        )
        return response.get("Item")
    except Exception as e:
        print(f"Error getting usage for org {org_id}: {e}")
        return None


def update_org_usage(org_id: str, period: str, metrics: dict) -> dict:
    """
    Update usage metrics for an organization in a specific period.
    
    Args:
        org_id: Organization ID (the billing entity)
        period: Billing period (YYYY-MM)
        metrics: Dict with 'requests' and 'gb_seconds' keys
        
    Returns:
        Updated usage dict
    """
    table = get_usage_table()
    now = datetime.utcnow().isoformat()
    
    item = {
        "organization_id": org_id,
        "period": period,
        "requests": metrics.get("requests", 0),
        "gb_seconds": Decimal(str(metrics.get("gb_seconds", 0.0))),  # DynamoDB requires Decimal
        "last_updated": now,
        "functions": metrics.get("functions", {}),
    }
    
    table.put_item(Item=item)
    return item


def increment_org_usage(
    org_id: str,
    period: str,
    requests: int,
    gb_seconds: float,
    function_name: str = None
) -> dict:
    """
    Increment usage metrics for an organization atomically.
    
    Args:
        org_id: Organization ID (the billing entity)
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
                "organization_id": org_id,
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
        return update_org_usage(org_id, period, {
            "requests": requests,
            "gb_seconds": gb_seconds,
            "functions": {function_name: {"requests": requests, "gb_seconds": gb_seconds}} if function_name else {},
        })


# ─────────────────────────────────────────────────────────────
# QUOTA THROTTLE STATE (stored in projects table)
# ─────────────────────────────────────────────────────────────


def get_throttle_state(org_id: str) -> Optional[dict]:
    """
    Get throttle state for an org. Returns None if not throttled.

    Stored in the projects table with PK=ORG#{org_id}, SK=THROTTLE_STATE.
    """
    table = get_or_create_table()
    response = table.get_item(
        Key={"PK": f"ORG#{org_id}", "SK": "THROTTLE_STATE"},
        ConsistentRead=True,
    )
    return response.get("Item")


def set_throttle_state(org_id: str, reason: str, throttled_functions: list) -> dict:
    """Mark an org as throttled and record which functions were disabled."""
    table = get_or_create_table()
    now = datetime.utcnow().isoformat()
    period = datetime.utcnow().strftime("%Y-%m")
    item = {
        "PK": f"ORG#{org_id}",
        "SK": "THROTTLE_STATE",
        "is_throttled": True,
        "throttled_at": now,
        "reason": reason,
        "throttled_functions": throttled_functions,
        "billing_period": period,
    }
    table.put_item(Item=item)
    return item


def clear_throttle_state(org_id: str) -> bool:
    """Remove throttle state for an org (unthrottle)."""
    table = get_or_create_table()
    table.delete_item(Key={"PK": f"ORG#{org_id}", "SK": "THROTTLE_STATE"})
    return True


# ─────────────────────────────────────────────────────────────
# GITHUB CONNECTIONS TABLE (Organization-based)
# ─────────────────────────────────────────────────────────────

GITHUB_CONNECTIONS_TABLE = "org-github-connections"


def get_github_connections_table():
    """Get or create the github-connections DynamoDB table."""
    try:
        table = dynamodb.Table(GITHUB_CONNECTIONS_TABLE)
        table.load()
        return table
    except dynamodb.meta.client.exceptions.ResourceNotFoundException:
        pass

    print(f"📦 Creating DynamoDB table: {GITHUB_CONNECTIONS_TABLE}")
    table = dynamodb.create_table(
        TableName=GITHUB_CONNECTIONS_TABLE,
        KeySchema=[
            {"AttributeName": "organization_id", "KeyType": "HASH"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "organization_id", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    table.wait_until_exists()
    print(f"✅ Created DynamoDB table: {GITHUB_CONNECTIONS_TABLE}")
    return table


def save_github_token(
    org_id: str,
    user_id: str,
    token: str,
    metadata: dict = None,
    installation_id: str = None,
    expires_at: str = None
) -> bool:
    """
    Save or update GitHub App installation token for an organization.

    Args:
        org_id: Clerk organization ID (owner of the connection)
        user_id: Clerk user ID (who connected it, stored as connected_by)
        token: GitHub App installation access token
        metadata: Additional metadata (username, avatar_url, etc.)
        installation_id: GitHub App installation ID (needed for token refresh)
        expires_at: ISO format timestamp when token expires
    """
    table = get_github_connections_table()
    now = datetime.utcnow().isoformat()

    item = {
        "organization_id": org_id,
        "connected_by": user_id,
        "token": token,
        "metadata": metadata or {},
        "updated_at": now,
    }

    # Add GitHub App specific fields
    if installation_id:
        item["installation_id"] = installation_id
    if expires_at:
        item["expires_at"] = expires_at

    table.put_item(Item=item)
    return True


def get_github_token(org_id: str) -> Optional[str]:
    """
    Get GitHub App installation token for an organization from DynamoDB.
    Returns None if not found.
    """
    table = get_github_connections_table()

    response = table.get_item(
        Key={"organization_id": org_id}
    )

    item = response.get("Item")
    if item:
        return item.get("token")
    return None


def get_github_installation(org_id: str) -> Optional[dict]:
    """
    Get complete GitHub App installation data including installation_id and token expiry.

    Args:
        org_id: Clerk organization ID

    Returns:
        dict with keys: token, installation_id, expires_at, metadata, connected_by
        None if not found
    """
    table = get_github_connections_table()

    response = table.get_item(
        Key={"organization_id": org_id}
    )

    item = response.get("Item")
    if item:
        return {
            "token": item.get("token"),
            "installation_id": item.get("installation_id"),
            "expires_at": item.get("expires_at"),
            "metadata": item.get("metadata", {}),
            "connected_by": item.get("connected_by"),
        }
    return None


def get_org_id_by_installation_id(installation_id: str) -> Optional[str]:
    """
    Look up Shorlabs organization_id by GitHub App installation ID.
    Used by GitHub webhooks (push events) to find which org's projects to deploy.

    Args:
        installation_id: GitHub App installation ID from webhook payload

    Returns:
        organization_id if found, None otherwise
    """
    if not installation_id:
        return None
    table = get_github_connections_table()
    response = table.scan(
        FilterExpression="installation_id = :iid",
        ExpressionAttributeValues={":iid": str(installation_id)},
        ProjectionExpression="organization_id",
    )
    items = response.get("Items", [])
    return items[0]["organization_id"] if items else None


def delete_github_connection(org_id: str) -> bool:
    """
    Delete the GitHub App installation connection for an organization.

    Args:
        org_id: Clerk organization ID

    Returns:
        True if deleted, False if not found
    """
    table = get_github_connections_table()

    response = table.delete_item(
        Key={"organization_id": org_id},
        ReturnValues="ALL_OLD",
    )

    return "Attributes" in response
