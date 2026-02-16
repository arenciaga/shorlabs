"""
GitHub webhook handler for auto-deployment on push.

Industry-standard flow (like Railway/Render):
1. User configures GitHub App webhook URL in GitHub (or app default).
2. On push, GitHub sends POST with X-GitHub-Event: push and signed body.
3. We verify X-Hub-Signature-256 (HMAC-SHA256), then find projects for that repo
   and trigger deploy via the same SQS pipeline as manual redeploy.
"""
import hashlib
import hmac
import os
import json
from decimal import Decimal
from fastapi import APIRouter, Request, HTTPException


def _json_safe_env_vars(env_vars: dict) -> dict:
    """Convert DynamoDB types (e.g. Decimal) to JSON-serializable types."""
    if not env_vars:
        return {}
    out = {}
    for k, v in env_vars.items():
        if isinstance(v, Decimal):
            out[k] = int(v) if v % 1 == 0 else float(v)
        else:
            out[k] = v
    return out

from api.db.dynamodb import get_org_id_by_installation_id, list_projects
from api.routes.github import get_or_refresh_token_for_org
from api.routes.projects import send_deployment_to_sqs

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

GITHUB_WEBHOOK_SECRET = os.environ.get("GITHUB_WEBHOOK_SECRET", "")


def _verify_github_signature(payload_body: bytes, signature_header: str | None, secret: str) -> None:
    """
    Verify GitHub webhook signature (X-Hub-Signature-256).
    Uses constant-time comparison to mitigate timing attacks.
    """
    if not secret:
        raise HTTPException(status_code=500, detail="GITHUB_WEBHOOK_SECRET not configured")
    if not signature_header:
        raise HTTPException(status_code=403, detail="X-Hub-Signature-256 header is missing")
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        msg=payload_body,
        digestmod=hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature_header):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")


@router.post("/github")
async def github_webhook(request: Request):
    """
    Receive GitHub webhook (push, etc.). Verifies signature, then for push events
    finds projects linked to that repo and triggers auto-deploy via SQS.
    """
    payload_body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    event = request.headers.get("X-GitHub-Event", "")

    _verify_github_signature(payload_body, signature, GITHUB_WEBHOOK_SECRET)

    try:
        body = json.loads(payload_body.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Acknowledge ping (GitHub sends this when webhook is first configured)
    if event == "ping":
        return {"status": "ok", "event": "ping"}

    # Only auto-deploy on push
    if event != "push":
        return {"status": "ignored", "event": event}

    print(f"[webhook] push event received")
    repository = body.get("repository") or {}
    full_name = repository.get("full_name")  # e.g. "owner/repo"
    ref = body.get("ref", "")  # e.g. "refs/heads/main"

    # GitHub App payloads include installation
    installation = body.get("installation") or {}
    installation_id = installation.get("id")
    if not installation_id:
        print("[webhook] push event has no installation.id (repo webhook? use GitHub App webhook)")
        return {"status": "ignored", "reason": "no_installation_id"}

    if not full_name:
        return {"status": "ignored", "reason": "no_repository_full_name"}

    org_id = get_org_id_by_installation_id(str(installation_id))
    if not org_id:
        print(f"[webhook] push {full_name}: no org for installation_id={installation_id}")
        return {"status": "ignored", "reason": "unknown_installation"}

    projects = list_projects(org_id)
    # Match by github_repo (same format as full_name: "owner/repo")
    matching = [p for p in projects if (p.get("github_repo") or "").lower() == full_name.lower()]
    if not matching:
        repo_list = [p.get("github_repo") for p in projects[:5]]
        print(f"[webhook] push {full_name}: no matching project in org. org projects (sample): {repo_list}")
        return {"status": "ok", "deployments_triggered": 0, "reason": "no_matching_projects"}

    # Optional: only deploy when push is to project's default branch (if we stored it)
    # For now we deploy on every push to any branch (like many platforms default).
    github_token = await get_or_refresh_token_for_org(org_id)
    if not github_token:
        print(f"[webhook] push {full_name}: no GitHub token for org_id={org_id}")
        return {"status": "error", "reason": "no_github_token", "deployments_triggered": 0}

    triggered = 0
    for project in matching:
        project_id = project.get("project_id")
        if not project_id:
            continue
        root_directory = project.get("root_directory") or "./"
        start_command = project.get("start_command") or "uvicorn main:app --host 0.0.0.0 --port 8080"
        env_vars = _json_safe_env_vars(project.get("env_vars") or {})
        memory = int(project.get("memory", 1024))
        timeout = int(project.get("timeout", 30))
        ephemeral_storage = int(project.get("ephemeral_storage", 512))
        github_url = project.get("github_url") or f"https://github.com/{full_name}"

        send_deployment_to_sqs(
            project_id=project_id,
            github_url=github_url,
            github_token=github_token,
            root_directory=root_directory,
            start_command=start_command,
            env_vars=env_vars,
            memory=memory,
            timeout=timeout,
            ephemeral_storage=ephemeral_storage,
        )
        print(f"[webhook] push {full_name}: triggered deploy for project_id={project_id}")
        triggered += 1

    return {
        "status": "ok",
        "event": "push",
        "repository": full_name,
        "ref": ref,
        "deployments_triggered": triggered,
    }
