"""
Shorlabs API - FastAPI application for backend deployment platform.

This single Lambda handles:
1. HTTP requests (via Mangum/Lambda Web Adapter)
2. SQS deployment events (background tasks)
"""
import os
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from api.routes import github, projects, deployments, domains, webhooks, usage


# CORS allowed origins
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://shorlabs.com",
    "https://www.shorlabs.com",
    os.environ.get("FRONTEND_URL", ""),
]
# Remove empty strings
ALLOWED_ORIGINS = [o for o in ALLOWED_ORIGINS if o]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup: ensure DynamoDB tables exist
    from api.db.dynamodb import get_or_create_table, get_or_create_domains_table
    get_or_create_table()  # Projects table
    get_or_create_domains_table()  # Custom domains table
    yield
    # Shutdown: nothing to do


app = FastAPI(
    title="Shorlabs API",
    description="Backend deployment platform API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
# IMPORTANT: Register usage router BEFORE projects router to avoid route conflicts
# Both have prefix "/api/projects", and projects has catch-all "/{project_id}" route
app.include_router(github.router)
app.include_router(usage.router)  # Must come before projects.router
app.include_router(projects.router)
app.include_router(deployments.router)
app.include_router(domains.router)
app.include_router(webhooks.router)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "shorlabs-api"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


# Lambda handler (for AWS Lambda deployment)
_mangum_handler = Mangum(app, lifespan="off")


def _handle_sqs_event(event: dict) -> dict:
    """
    Handle SQS events for deployments, database provisioning, and database deletion.
    Routes based on message_type field.
    """
    from api.routes.projects import _run_deployment_sync, _run_database_provision_sync, _run_database_delete_sync, _run_ecs_deployment_sync, _run_ecs_delete_sync

    records = event.get("Records", [])
    print(f"📥 Received {len(records)} SQS message(s)")

    failed_message_ids = []

    for record in records:
        message_id = record.get("messageId", "unknown")
        handled_with_error = False
        try:
            print(
                f"📦 SQS RECORD: message_id={message_id} "
                f"event_source={record.get('eventSource')} "
                f"event_source_arn={record.get('eventSourceARN')}"
            )
            body = json.loads(record.get("body", "{}"))
            message_type = body.get("message_type", "deployment")
            print(f"📦 Processing message {message_id} (type: {message_type}) body={body}")

            # Resolve service_id (new key) with fallback to project_id (legacy in-flight messages)
            sid = body.get("service_id") or body.get("project_id")
            if not sid:
                raise ValueError("Missing service_id in SQS message body")

            if message_type == "database_provision":
                result = _run_database_provision_sync(
                    service_id=sid,
                    db_name=body.get("db_name", "shorlabs"),
                    min_acu=body.get("min_acu", 0),
                    max_acu=body.get("max_acu", 2),
                )
                if isinstance(result, dict) and not result.get("ok", True):
                    handled_with_error = True
                    print(
                        f"[DB-TRACE] SQS DB PROVISION RESULT message_id={message_id} "
                        f"service_id={sid} status=FAILED "
                        f"trace_id={result.get('trace_id')} error_type={result.get('error_type')} "
                        f"error={result.get('error')}"
                    )
                else:
                    print(
                        f"[DB-TRACE] SQS DB PROVISION RESULT message_id={message_id} "
                        f"service_id={sid} status=SUCCESS "
                        f"trace_id={result.get('trace_id') if isinstance(result, dict) else None}"
                    )
            elif message_type == "database_delete":
                _run_database_delete_sync(
                    service_id=sid,
                )
            elif message_type == "ecs_deploy":
                _run_ecs_deployment_sync(
                    service_id=sid,
                    github_url=body["github_url"],
                    github_token=body.get("github_token"),
                    root_directory=body.get("root_directory", "./"),
                    start_command=body.get("start_command", "uvicorn main:app --host 0.0.0.0 --port 8080"),
                    env_vars=body.get("env_vars"),
                    cpu=body.get("cpu", 256),
                    memory=body.get("memory", 512),
                    commit_sha=body.get("commit_sha"),
                    commit_message=body.get("commit_message"),
                    commit_author_name=body.get("commit_author_name"),
                    commit_author_username=body.get("commit_author_username"),
                    branch=body.get("branch"),
                    org_id=body.get("org_id"),
                    instance_type=body.get("instance_type"),
                )
            elif message_type == "ecs_delete":
                _run_ecs_delete_sync(
                    service_id=sid,
                    org_id=body.get("org_id"),
                )
            else:
                _run_deployment_sync(
                    service_id=sid,
                    github_url=body["github_url"],
                    github_token=body.get("github_token"),
                    root_directory=body.get("root_directory", "./"),
                    start_command=body.get("start_command", "uvicorn main:app --host 0.0.0.0 --port 8080"),
                    env_vars=body.get("env_vars"),
                    memory=body.get("memory", 1024),
                    timeout=body.get("timeout", 30),
                    ephemeral_storage=body.get("ephemeral_storage", 512),
                    commit_sha=body.get("commit_sha"),
                    commit_message=body.get("commit_message"),
                    commit_author_name=body.get("commit_author_name"),
                    commit_author_username=body.get("commit_author_username"),
                    branch=body.get("branch"),
                    org_id=body.get("org_id"),
                )

            if handled_with_error:
                print(f"⚠️ Message {message_id} acknowledged but underlying DB task failed (see [DB-TRACE] logs)")
            else:
                print(f"✅ Message {message_id} processed successfully")

        except Exception as e:
            print(f"❌ Failed to process message {message_id}: {e}")
            import traceback
            traceback.print_exc()
            failed_message_ids.append(message_id)

    if failed_message_ids:
        return {
            "batchItemFailures": [
                {"itemIdentifier": msg_id} for msg_id in failed_message_ids
            ]
        }

    return {"statusCode": 200, "body": f"Processed {len(records)} messages"}


def _is_sqs_event(event: dict) -> bool:
    """Check if the event is from SQS."""
    if not isinstance(event, dict):
        return False
    records = event.get("Records", [])
    if not records:
        return False
    # SQS events have eventSource: "aws:sqs"
    return records[0].get("eventSource") == "aws:sqs"


def _is_eventbridge_event(event: dict) -> bool:
    """Check if the event is from EventBridge."""
    if not isinstance(event, dict):
        return False
    # EventBridge events have 'source' field starting with 'aws.events'
    return event.get("source") == "aws.events"


def _handle_eventbridge_event(event: dict) -> dict:
    """
    Handle EventBridge scheduled events.
    Currently supports: usage metrics aggregation.
    """
    detail = event.get("detail", {})
    action = detail.get("action")
    
    print(f"📅 EventBridge event received, action: {action}")
    
    if action == "aggregate_usage":
        from api.usage_aggregator import aggregate_usage_metrics
        try:
            aggregate_usage_metrics()
            return {"statusCode": 200, "body": "Usage aggregation complete"}
        except Exception as e:
            print(f"❌ Usage aggregation failed: {e}")
            import traceback
            traceback.print_exc()
            return {"statusCode": 500, "body": f"Aggregation failed: {str(e)}"}
    
    if action == "warm_lambdas":
        from api.lambda_warmer import warm_all_lambdas
        try:
            result = warm_all_lambdas()
            return {"statusCode": 200, "body": f"Warming complete: {result}"}
        except Exception as e:
            print(f"❌ Lambda warming failed: {e}")
            import traceback
            traceback.print_exc()
            return {"statusCode": 500, "body": f"Warming failed: {str(e)}"}

    print(f"⚠️ Unknown EventBridge action: {action}")
    return {"statusCode": 400, "body": f"Unknown action: {action}"}


@app.post("/webhooks/autumn")
async def handle_autumn_webhook(request: Request):
    """
    Handle Autumn billing webhooks for instant quota enforcement.

    Autumn uses Svix for delivery. Events (per Autumn docs):
    - customer.products.updated: product/plan change; use data.scenario (new, upgrade, renew, etc.)
    - customer.threshold_reached: usage limit/allowance reached (for notifications)

    Unthrottle when customer gains or regains access: new, upgrade, renew.
    """
    from fastapi import HTTPException

    body = await request.body()
    webhook_secret = os.environ.get("AUTUMN_WEBHOOK_SECRET", "")

    if webhook_secret:
        # Autumn uses Svix: verify with svix-id, svix-timestamp, svix-signature
        from svix.webhooks import Webhook, WebhookVerificationError

        try:
            wh = Webhook(webhook_secret)
            wh.verify(body, dict(request.headers))
        except WebhookVerificationError:
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event = json.loads(body)
    event_type = event.get("type", "")
    data = event.get("data") or {}
    # Payload shape: data.customer.id (not customer_id at top level)
    customer = data.get("customer") or {}
    customer_id = customer.get("id") if isinstance(customer, dict) else None

    print(f"📩 Autumn webhook: {event_type} for customer {customer_id}")

    if not customer_id:
        return {"status": "ignored", "reason": "no_customer_id"}

    from api.quota_enforcer import unthrottle_org
    from api.db.dynamodb import get_throttle_state

    # customer.products.updated: scenario = new | upgrade | downgrade | renew | cancel | expired | past_due | scheduled
    if event_type == "customer.products.updated":
        scenario = data.get("scenario", "")
        unthrottle_scenarios = ("new", "upgrade", "renew")  # customer gained or regained access
        if scenario in unthrottle_scenarios:
            state = get_throttle_state(customer_id)
            if state and state.get("is_throttled"):
                unthrottle_org(customer_id)
                print(f"Webhook: Unthrottled {customer_id} (scenario={scenario})")
            return {"status": "ok", "action": "unthrottled", "scenario": scenario}
        return {"status": "ok", "action": "none", "scenario": scenario}

    # customer.threshold_reached: limit_reached | allowance_used (informational; no unthrottle)
    if event_type == "customer.threshold_reached":
        threshold_type = data.get("threshold_type", "")
        print(f"Webhook: threshold_reached for {customer_id} ({threshold_type})")
        return {"status": "ok", "action": "none", "threshold_type": threshold_type}

    return {"status": "ok", "action": "none"}


@app.post("/events")
async def handle_events(request: Request):
    """
    Handle incoming events from Lambda Web Adapter.
    LWA converts SQS events into HTTP POST requests to this endpoint (default path /events).
    
    Also handles EventBridge scheduled events for usage aggregation.
    """
    try:
        event = await request.json()
        print(f"📥 Received event via HTTP POST: {event.keys() if isinstance(event, dict) else 'unknown'}")
        
        # Check if this is an EventBridge event
        if _is_eventbridge_event(event):
            print("📅 Routing to EventBridge handler (scheduled task)")
            return _handle_eventbridge_event(event)
        
        # Check if this is an SQS event
        if _is_sqs_event(event):
            print("🔄 Routing to SQS handler (deployment task)")
            # Run the synchronous handler
            # Since this is a dedicated Lambda for handling this batch, blocking is acceptable/expected
            return _handle_sqs_event(event)
        
        # Other event types?
        print("⚠️ Received non-SQS/non-EventBridge event, ignoring")
        return {"status": "ignored", "reason": "unknown_event_type"}
        
    except Exception as e:
        print(f"❌ Error handling event: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}
