"""
Data migration script: Convert legacy flat projects into project-container + service model.

For each existing DynamoDB item with SK=PROJECT#{project_id}:
1. Create a new service item with entity_type="service" and SK=PROJECT#{project_id}#SERVICE#{project_id}
2. Copy all resource-specific fields to the service item
3. Clean up the original item to only contain container fields

IMPORTANT: Uses project_id as service_id so existing deployments and custom
domains (keyed by project_id) continue to resolve without any data changes
to those tables.

Run modes:
- DRY_RUN=true (default): Print what would happen, no writes
- DRY_RUN=false: Actually migrate data

Usage:
    python migrate_to_services.py                # dry run
    DRY_RUN=false python migrate_to_services.py  # real migration
"""
import os
import sys
from datetime import datetime

import boto3
from boto3.dynamodb.conditions import Key

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DRY_RUN = os.environ.get("DRY_RUN", "true").lower() in ("true", "1", "yes")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "shorlabs-projects")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


# Fields that belong to web-app services (not project containers)
WEB_APP_FIELDS = {
    "github_url", "github_repo", "github_raw_url", "function_url", "ecr_repo",
    "env_vars", "root_directory", "start_command", "subdomain",
    "custom_url", "memory", "timeout", "ephemeral_storage",
    "function_name",
}

# Fields that belong to database services (not project containers)
DATABASE_FIELDS = {
    "db_name", "db_cluster_identifier", "db_endpoint", "db_port",
    "db_master_username", "db_secret_arn", "min_acu", "max_acu",
}

# Fields that stay on the project container
CONTAINER_FIELDS = {
    "PK", "SK", "project_id", "organization_id", "created_by",
    "name", "created_at", "updated_at", "entity_type", "description",
}

# Stale fields to remove from the container (leftover from old model)
STALE_FIELDS = {
    "project_type", "status", "migrated_at", "is_throttled", "billing_period",
}


def get_all_legacy_projects():
    """Get all items that look like old-style flat projects (no entity_type)."""
    items = []
    last_key = None

    while True:
        scan_kwargs = {
            "FilterExpression": (
                "begins_with(SK, :sk_prefix) AND attribute_not_exists(entity_type)"
            ),
            "ExpressionAttributeValues": {
                ":sk_prefix": "PROJECT#",
            },
        }
        if last_key:
            scan_kwargs["ExclusiveStartKey"] = last_key

        response = table.scan(**scan_kwargs)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break

    # Filter out service items (they have #SERVICE# in SK)
    return [i for i in items if "#SERVICE#" not in i.get("SK", "")]


def migrate_project(item: dict):
    """Migrate a single legacy project to container + service."""
    pk = item["PK"]
    sk = item["SK"]
    project_id = item["project_id"]
    project_type = item.get("project_type", "web-app")

    # Use project_id as service_id so deployments/domains keep working
    service_id = project_id
    now = datetime.utcnow().isoformat()

    print(f"\n{'='*60}")
    print(f"  Project: {item.get('name', 'unknown')} ({project_id})")
    print(f"  Type:    {project_type}")
    print(f"  Org:     {item.get('organization_id', 'unknown')}")
    print(f"  Status:  {item.get('status', 'unknown')}")
    print(f"  Service ID: {service_id} (= project_id)")

    # 1. Build the service item
    service_item = {
        "PK": pk,
        "SK": f"{sk}#SERVICE#{service_id}",
        "project_id": project_id,
        "service_id": service_id,
        "organization_id": item.get("organization_id"),
        "created_by": item.get("created_by"),
        "entity_type": "service",
        "name": item.get("name", ""),
        "service_type": project_type if project_type in ("web-app", "database") else "web-app",
        "status": item.get("status", "PENDING"),
        "created_at": item.get("created_at", now),
        "updated_at": now,
    }

    # Copy type-specific fields to the service
    fields_to_copy = DATABASE_FIELDS if project_type == "database" else WEB_APP_FIELDS
    for field in fields_to_copy:
        if field in item:
            service_item[field] = item[field]

    print(f"  -> Service SK: {service_item['SK']}")
    print(f"  -> Copied fields: {[f for f in fields_to_copy if f in item]}")

    # 2. Determine fields to remove from the project container
    all_resource_fields = WEB_APP_FIELDS | DATABASE_FIELDS | STALE_FIELDS
    fields_to_remove = [f for f in all_resource_fields if f in item]

    print(f"  -> Removing from container: {fields_to_remove}")

    if DRY_RUN:
        print(f"  [DRY RUN] no changes made")
        return True

    # Write the new service item
    table.put_item(Item=service_item)
    print(f"  + Created service item")

    # Update the container: add entity_type + description, remove resource fields
    update_parts = []
    remove_parts = []
    expr_names = {}
    expr_values = {}

    container_updates = {
        "entity_type": "project",
        "description": item.get("description", ""),
        "updated_at": now,
    }

    for k, v in container_updates.items():
        safe_key = k.replace("-", "_")
        update_parts.append(f"#{safe_key} = :{safe_key}")
        expr_names[f"#{safe_key}"] = k
        expr_values[f":{safe_key}"] = v

    for f in fields_to_remove:
        safe_key = f.replace("-", "_")
        remove_parts.append(f"#{safe_key}")
        expr_names[f"#{safe_key}"] = f

    update_expr = "SET " + ", ".join(update_parts)
    if remove_parts:
        update_expr += " REMOVE " + ", ".join(remove_parts)

    table.update_item(
        Key={"PK": pk, "SK": sk},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )
    print(f"  + Updated container item")

    return True


def main():
    print(f"{'='*62}")
    print(f"  Shorlabs Migration: Flat Projects -> Containers + Services")
    print(f"  Mode: {'DRY RUN' if DRY_RUN else 'LIVE MIGRATION'}")
    print(f"  Table: {TABLE_NAME}")
    print(f"  Key:   service_id = project_id (preserves deployment/domain keys)")
    print(f"{'='*62}")

    legacy_projects = get_all_legacy_projects()
    print(f"\nFound {len(legacy_projects)} legacy projects to migrate.\n")

    if not legacy_projects:
        print("Nothing to migrate!")
        return

    success = 0
    failed = 0

    for item in legacy_projects:
        try:
            if migrate_project(item):
                success += 1
        except Exception as e:
            failed += 1
            print(f"  ERROR: {e}")

    print(f"\n{'='*60}")
    print(f"Migration complete: {success} succeeded, {failed} failed")
    if DRY_RUN:
        print(f"\nThis was a DRY RUN. To apply changes, run:")
        print(f"  DRY_RUN=false python {__file__}")


if __name__ == "__main__":
    main()
