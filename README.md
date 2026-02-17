<p align="center">
  <img src="images/logo.png" alt="Shorlabs logo" width="120" />
</p>

# Shorlabs

Ship Software in Peace.

Shorlabs gives you the tools and infrastructure to deploy, scale, and manage your frontend and backend apps from one place.

## What Shorlabs does

- Connect a GitHub repository and deploy in one flow.
- Detect framework/runtime and suggest a start command automatically.
- Deploy with configurable memory, timeout, and ephemeral storage.
- Stream deployment and runtime logs.
- Support project subdomains and custom domains.
- Track usage and enforce plan limits.

## Homepage-aligned product focus

The current homepage is positioned around:

- One-click deploy
- Multi-framework support
- Bring your own domain
- Real-time logs
- Flexible compute
- Pay per request

Frameworks called out on the homepage Hero section:

- Next.js
- React
- FastAPI
- Express
- Flask
- Django

Frameworks detected by the backend include additional support for Fastify, Hono, NestJS, Litestar, Starlette, and generic Node.js/Python fallbacks.

## Repository layout

```text
shorlabs/
  apps/
    frontend/   # Next.js web app
    backend/    # FastAPI API + deployment orchestration
  packages/
  images/
```

## Local development

### Prerequisites

- Node.js `>=20.9.0`
- Bun
- Python `3.12+`
- AWS CLI (for cloud deployment scripts)
- Docker (for building backend Lambda image)

### 1. Install dependencies

```bash
# from repo root
bun install

# backend Python deps
cd apps/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure environment variables

Frontend (`apps/frontend/.env.local`):

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_AMPLITUDE_API_KEY=...
```

Backend (`apps/backend/.env`):

```env
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=us-east-1

CLERK_SECRET_KEY=...
CLERK_ISSUER=...
FRONTEND_URL=http://localhost:3000

AUTUMN_API_KEY=...
AUTUMN_WEBHOOK_SECRET=...
AUTUMN_BASE_URL=https://api.useautumn.com/v1

GITHUB_CLIENT_ID=...
GITHUB_APP_SLUG=...
GITHUB_APP_ID=...
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
GITHUB_WEBHOOK_SECRET=...
```

### 3. Run locally

Backend:

```bash
cd apps/backend
source venv/bin/activate
uvicorn api.main:app --reload --port 8000
```

Frontend:

```bash
# from repo root
bun run dev
```

App runs at `http://localhost:3000`.

## AWS deployment

Run from `apps/backend`.

### 1. Deploy core backend

```bash
./deploy-lambda.sh
```

This sets up the main Lambda API and queue-driven background deployment flow.

### 2. Deploy Lambda@Edge router

```bash
./deploy_router.sh
```

Use this to deploy/update the router for multi-tenant CloudFront routing.

### 3. Configure multi-tenant CloudFront DNS

```bash
./setup_multitenant_cloudfront.sh
```

This script updates DNS/env wiring for the multi-tenant CloudFront setup.

### 4. Schedule usage aggregation

```bash
./schedule_usage_aggregator.sh
```

Adds the scheduled usage aggregation job.

## Frontend production build

```bash
cd apps/frontend
bun run build
bun run start
```

## Notes

- Keep secrets out of git. Use local env files and cloud secret managers.
- The backend handles HTTP API requests and background deployment jobs in the same Lambda-based architecture.
- For project custom domains, ensure your CloudFront and DNS settings are correctly configured before enabling domains for users.
