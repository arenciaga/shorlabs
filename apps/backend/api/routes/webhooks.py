"""
Webhook handlers for GitHub (auto-deploy on push) and Clerk (user signup).
"""
import hashlib
import hmac
import os
import json
from decimal import Decimal
from fastapi import APIRouter, Request, HTTPException
from svix.webhooks import Webhook, WebhookVerificationError
import resend


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

from api.db.dynamodb import get_org_id_by_installation_id, list_all_org_services
from api.routes.github import get_or_refresh_token_for_org
from api.routes.projects import send_deployment_to_sqs, send_fargate_deployment_to_sqs

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

GITHUB_WEBHOOK_SECRET = os.environ.get("GITHUB_WEBHOOK_SECRET", "")
CLERK_WEBHOOK_SECRET = os.environ.get("CLERK_WEBHOOK_SECRET", "")

resend.api_key = os.environ.get("RESEND_API_KEY", "")


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

    # Extract commit metadata from push payload
    head_commit = body.get("head_commit") or {}
    commit_sha = head_commit.get("id")
    commit_message = head_commit.get("message")
    commit_author = head_commit.get("author") or {}
    commit_author_name = commit_author.get("name")
    commit_author_username = commit_author.get("username")

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

    # Get both web-app and web-service services
    web_apps = list_all_org_services(org_id, service_type="web-app")
    web_services = list_all_org_services(org_id, service_type="web-service")
    all_services = web_apps + web_services
    
    # Match by github_repo (same format as full_name: "owner/repo")
    matching = [s for s in all_services if (s.get("github_repo") or "").lower() == full_name.lower()]
    if not matching:
        repo_list = [s.get("github_repo") for s in all_services[:5]]
        print(f"[webhook] push {full_name}: no matching service in org. org services (sample): {repo_list}")
        return {"status": "ok", "deployments_triggered": 0, "reason": "no_matching_services"}

    github_token = await get_or_refresh_token_for_org(org_id)
    if not github_token:
        print(f"[webhook] push {full_name}: no GitHub token for org_id={org_id}")
        return {"status": "error", "reason": "no_github_token", "deployments_triggered": 0}

    # Extract the branch name from ref (e.g. "refs/heads/main" → "main")
    pushed_branch = ref.replace("refs/heads/", "") if ref.startswith("refs/heads/") else ref

    triggered = 0
    skipped = 0
    for svc in matching:
        service_id = svc.get("service_id")
        service_type = svc.get("service_type")
        if not service_id:
            continue

        # Only deploy when push is to the service's production branch
        # Default to "main" if not configured (also accept "master" as legacy fallback)
        production_branch = svc.get("branch") or svc.get("default_branch") or "main"
        if pushed_branch != production_branch:
            print(f"[webhook] push {full_name}: skipping service_id={service_id} (pushed to '{pushed_branch}', production branch is '{production_branch}')")
            skipped += 1
            continue

        root_directory = svc.get("root_directory") or "./"
        start_command = svc.get("start_command") or "uvicorn main:app --host 0.0.0.0 --port 8080"
        env_vars = _json_safe_env_vars(svc.get("env_vars") or {})
        github_url = svc.get("github_url") or f"https://github.com/{full_name}"

        # Route to appropriate deployment function based on service type
        if service_type == "web-service":
            # Fargate deployment
            cpu = int(svc.get("cpu", 256))
            memory = int(svc.get("memory", 512))
            send_fargate_deployment_to_sqs(
                service_id=service_id,
                github_url=github_url,
                github_token=github_token,
                root_directory=root_directory,
                start_command=start_command,
                env_vars=env_vars,
                cpu=cpu,
                memory=memory,
                commit_sha=commit_sha,
                commit_message=commit_message,
                commit_author_name=commit_author_name,
                commit_author_username=commit_author_username,
                branch=pushed_branch,
                org_id=org_id,
            )
            print(f"[webhook] push {full_name}@{pushed_branch}: triggered Fargate deploy for service_id={service_id}")
        else:
            # Lambda deployment (web-app)
            memory = int(svc.get("memory", 1024))
            timeout = int(svc.get("timeout", 30))
            ephemeral_storage = int(svc.get("ephemeral_storage", 512))
            send_deployment_to_sqs(
                service_id=service_id,
                github_url=github_url,
                github_token=github_token,
                root_directory=root_directory,
                start_command=start_command,
                env_vars=env_vars,
                memory=memory,
                timeout=timeout,
                ephemeral_storage=ephemeral_storage,
                commit_sha=commit_sha,
                commit_message=commit_message,
                commit_author_name=commit_author_name,
                commit_author_username=commit_author_username,
                branch=pushed_branch,
                org_id=org_id,
            )
            print(f"[webhook] push {full_name}@{pushed_branch}: triggered Lambda deploy for service_id={service_id}")
        
        triggered += 1

    return {
        "status": "ok",
        "event": "push",
        "repository": full_name,
        "ref": ref,
        "branch": pushed_branch,
        "deployments_triggered": triggered,
        "deployments_skipped": skipped,
    }


@router.post("/clerk")
async def clerk_webhook(request: Request):
    """
    Handle Clerk webhooks. Clerk uses Svix for delivery.
    On user.created, sends a welcome email via Resend.
    """
    payload = await request.body()

    print(f"[webhook] Clerk webhook received, payload size={len(payload)}")
    print(f"[webhook] CLERK_WEBHOOK_SECRET configured: {bool(CLERK_WEBHOOK_SECRET)}")

    if not CLERK_WEBHOOK_SECRET:
        print("[webhook] ERROR: CLERK_WEBHOOK_SECRET env var is not set")
        raise HTTPException(status_code=500, detail="CLERK_WEBHOOK_SECRET not configured")

    try:
        wh = Webhook(CLERK_WEBHOOK_SECRET)
        evt = wh.verify(payload, dict(request.headers))
    except WebhookVerificationError as e:
        print(f"[webhook] ERROR: Svix signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except Exception as e:
        print(f"[webhook] ERROR: Unexpected error during verification: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Webhook verification error")

    event_type = evt.get("type", "")
    data = evt.get("data", {})

    print(f"[webhook] Clerk event: {event_type}, user_id={data.get('id')}")

    if event_type == "user.created":
        user_id = data.get("id")
        first_name = data.get("first_name") or ""
        last_name = data.get("last_name") or ""

        # Extract primary email
        primary_email = None
        primary_email_id = data.get("primary_email_address_id")
        for email_obj in data.get("email_addresses", []):
            if email_obj.get("id") == primary_email_id:
                primary_email = email_obj.get("email_address")
                break

        if primary_email:
            display_name = first_name or "there"
            try:
                resend.Emails.send({
                    "from": "Aryan Kashyap <aryan@shorlabs.com>",
                    "to": [primary_email],
                    "subject": f"Welcome to Shorlabs, {display_name}!",
                    "html": (
                        f"<p>Hi {display_name},</p>"
                        "<p>Welcome to Shorlabs! We're excited to have you on board.</p>"
                        "<p>You can get started by creating your first project in the dashboard.</p>"
                        "<p>If you have any questions, just reply to this email.</p>"
                        "<p>— Aryan, Founder & CEO of Shorlabs</p>"
                    ),
                })
                print(f"[webhook] Welcome email sent to {primary_email} for user {user_id}")
            except Exception as e:
                print(f"[webhook] Failed to send welcome email to {primary_email}: {e}")

        return {"status": "ok", "event": "user.created", "user_id": user_id}

    return {"status": "ok", "event": event_type, "action": "ignored"}
