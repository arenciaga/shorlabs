"""
Environment variable storage via AWS Secrets Manager.

Each service's env vars are stored as a single JSON secret with the naming
convention: shorlabs/{org_id}/{project_id}/{service_id}
"""

import json

from deployer.clients import get_secretsmanager_client

SECRET_PREFIX = "shorlabs"


def _secret_name(org_id: str, project_id: str, service_id: str) -> str:
    return f"{SECRET_PREFIX}/{org_id}/{project_id}/{service_id}"


def get_env_vars(org_id: str, project_id: str, service_id: str) -> dict:
    """Fetch env vars from Secrets Manager. Returns {} if no secret exists."""
    sm = get_secretsmanager_client()
    try:
        resp = sm.get_secret_value(SecretId=_secret_name(org_id, project_id, service_id))
        return json.loads(resp["SecretString"])
    except sm.exceptions.ResourceNotFoundException:
        return {}


def put_env_vars(org_id: str, project_id: str, service_id: str, env_vars: dict) -> str | None:
    """Create or update the secret. Returns the secret ARN, or None if env_vars is empty."""
    if not env_vars:
        delete_env_vars(org_id, project_id, service_id)
        return None

    sm = get_secretsmanager_client()
    name = _secret_name(org_id, project_id, service_id)
    secret_string = json.dumps(env_vars)

    try:
        resp = sm.put_secret_value(SecretId=name, SecretString=secret_string)
        return resp["ARN"]
    except sm.exceptions.ResourceNotFoundException:
        resp = sm.create_secret(
            Name=name,
            SecretString=secret_string,
            Description=f"Env vars for service {service_id}",
        )
        return resp["ARN"]


def delete_env_vars(org_id: str, project_id: str, service_id: str) -> bool:
    """Delete the secret. Returns True if deleted, False if not found."""
    sm = get_secretsmanager_client()
    try:
        sm.delete_secret(
            SecretId=_secret_name(org_id, project_id, service_id),
            ForceDeleteWithoutRecovery=True,
        )
        return True
    except sm.exceptions.ResourceNotFoundException:
        return False


def get_env_vars_for_service(svc: dict) -> dict:
    """Read from SM if secret_arn exists, else fall back to DynamoDB env_vars field."""
    if svc.get("secret_arn"):
        return get_env_vars(
            svc["organization_id"], svc["project_id"], svc["service_id"]
        )
    return svc.get("env_vars", {})
