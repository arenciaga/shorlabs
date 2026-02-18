# Shorlabs — 5-Week Content Marketing Plan

> **Cadence:** 2–3 posts per week (publish Mon / Wed / Fri)
> **Start date:** Week of Feb 24, 2026
> **Goal:** Rank for high-intent deployment & serverless keywords, drive organic sign-ups

---

## Content Pillars

| Pillar | Why it matters |
|---|---|
| **Deploy Tutorials** (framework-specific) | Captures "how to deploy X" searches — highest intent |
| **Cost / Comparison** | Captures "Vercel alternative", "serverless pricing" — bottom-funnel |
| **Architecture / Best Practices** | Builds authority, attracts senior devs & CTOs |
| **Product-led / Changelog** | Shows momentum, builds trust, retains existing users |

---

## Week 1 (Feb 24 – Feb 28) — Foundation & Quick Wins

### Post 1 — Monday
**Title:** "How to Deploy a FastAPI App in Under 5 Minutes (No Docker Required)"
- **Type:** Tutorial
- **Target keywords:** `deploy fastapi`, `fastapi deployment`, `host fastapi app`, `fastapi serverless`
- **Outline:**
  1. Why deploying Python backends is still painful
  2. What you need: a GitHub repo with a FastAPI app
  3. Step-by-step: Connect → Configure → Deploy (use Shorlabs screenshots)
  4. Setting environment variables
  5. Connecting a custom domain
  6. Viewing real-time logs
- **CTA:** "Deploy your FastAPI app free →"
- **Word count target:** 1,200–1,500

### Post 2 — Wednesday
**Title:** "Vercel vs Railway vs Shorlabs: Where Should You Deploy Your Full-Stack App in 2026?"
- **Type:** Comparison / Bottom-funnel
- **Target keywords:** `vercel alternative`, `railway alternative`, `full stack deployment platform`, `vercel vs railway`
- **Outline:**
  1. The deployment landscape in 2026
  2. Feature comparison table (framework support, pricing model, backend support, custom domains, logs)
  3. Vercel: great for frontend, limited for backends
  4. Railway: flexible but always-on = idle costs
  5. Shorlabs: full-stack + pay-per-request + open source
  6. When to pick each one
  7. Our honest recommendation
- **CTA:** "Try Shorlabs free — no credit card required →"
- **Word count target:** 2,000–2,500

### Post 3 — Friday
**Title:** "How to Deploy a Next.js App to a Custom Domain (Step-by-Step)"
- **Type:** Tutorial
- **Target keywords:** `deploy nextjs`, `nextjs custom domain`, `host nextjs app`, `nextjs deployment`
- **Outline:**
  1. What you'll get: your Next.js app on your own domain
  2. Prerequisites (GitHub repo, domain)
  3. Connect repo to Shorlabs
  4. Auto-detected framework settings
  5. Deploy and verify
  6. Connect your custom domain (DNS step-by-step)
  7. Verify SSL and go live
- **CTA:** "Deploy your Next.js app →"
- **Word count target:** 1,200–1,500

---

## Week 2 (Mar 3 – Mar 7) — Cost Angle & More Frameworks

### Post 4 — Monday
**Title:** "Why You're Overpaying for Your Backend (and How Pay-Per-Request Fixes It)"
- **Type:** Thought leadership / Cost
- **Target keywords:** `serverless pricing`, `reduce cloud costs`, `pay per request backend`, `serverless vs always on`
- **Outline:**
  1. The dirty secret: most backends sit idle 90%+ of the time
  2. How always-on pricing works (Railway, Render, EC2)
  3. The math: a side project at $7/month vs $0.02/month
  4. How pay-per-request works (serverless under the hood)
  5. When always-on makes sense vs doesn't
  6. Real example: a weekend project's bill on Shorlabs
- **CTA:** "See Shorlabs pricing →"
- **Word count target:** 1,500–1,800

### Post 5 — Wednesday
**Title:** "How to Deploy a Flask App Without Writing a Single Line of DevOps"
- **Type:** Tutorial
- **Target keywords:** `deploy flask app`, `flask deployment`, `host flask`, `flask serverless`
- **Outline:**
  1. Flask is great for building — deploying is the hard part
  2. The Shorlabs approach: Git push → live
  3. Step-by-step walkthrough (connect, configure, deploy)
  4. Adding environment variables for secrets
  5. Monitoring with real-time logs
  6. Scaling: adjusting memory and timeout
- **CTA:** "Deploy your Flask app free →"
- **Word count target:** 1,200–1,500

### Post 6 — Friday
**Title:** "How to Deploy a Django App to Production in Minutes"
- **Type:** Tutorial
- **Target keywords:** `deploy django`, `django deployment`, `host django app`, `django serverless deployment`
- **Outline:**
  1. Django's deployment gap (great framework, complex deployment)
  2. What Shorlabs handles: ASGI, static files, environment variables
  3. Step-by-step deployment walkthrough
  4. Setting up `DJANGO_SETTINGS_MODULE` and `SECRET_KEY` as env vars
  5. Custom domain setup
  6. Monitoring and debugging with logs
- **CTA:** "Deploy your Django project →"
- **Word count target:** 1,200–1,500

---

## Week 3 (Mar 10 – Mar 14) — Architecture & Developer Audience

### Post 7 — Monday
**Title:** "The Architecture Behind Shorlabs: How We Deploy Your Code to Production in 60 Seconds"
- **Type:** Architecture / Behind-the-scenes
- **Target keywords:** `serverless deployment architecture`, `how deployment platforms work`, `lambda deployment pipeline`
- **Outline:**
  1. What happens when you click "Deploy"
  2. GitHub → Clone → Build → Package → Deploy (with diagram)
  3. How we detect your framework automatically
  4. The SQS queue for async deployments
  5. Multi-tenant routing and edge delivery
  6. Why this architecture gives you pay-per-request pricing
  7. What we're building next
- **CTA:** "See it in action — deploy your first project →"
- **Word count target:** 2,000–2,500

### Post 8 — Wednesday
**Title:** "How to Deploy an Express.js API to Production (No Cloud Console Needed)"
- **Type:** Tutorial
- **Target keywords:** `deploy express`, `expressjs deployment`, `host express api`, `express serverless`
- **Outline:**
  1. Express is the most popular Node.js framework — deployment shouldn't be the bottleneck
  2. Step-by-step Shorlabs deployment
  3. Configuring start command and memory
  4. Environment variables for API keys and DB connections
  5. Testing your live endpoint
  6. Redeployment on push
- **CTA:** "Deploy your Express API →"
- **Word count target:** 1,200–1,500

### Post 9 — Friday
**Title:** "Open Source Deployment Platforms in 2026: Why We Open-Sourced Shorlabs"
- **Type:** Thought leadership / Community
- **Target keywords:** `open source deployment platform`, `self host deployment`, `open source vercel alternative`, `open source paas`
- **Outline:**
  1. The problem with vendor lock-in in deployment
  2. Why we decided to open-source Shorlabs on day one
  3. What's in the repo (frontend, backend, deployer, router)
  4. How to contribute
  5. Self-hosting vs managed Shorlabs
  6. Our philosophy: transparent infra, transparent pricing
- **CTA:** "Star us on GitHub →" + "Or just deploy for free →"
- **Word count target:** 1,500–1,800

---

## Week 4 (Mar 17 – Mar 21) — Use Cases & Persona Targeting

### Post 10 — Monday
**Title:** "Deploying Your Side Project for $0: A Practical Guide for Indie Hackers"
- **Type:** Use case / Persona
- **Target keywords:** `free deployment for side projects`, `deploy side project`, `free backend hosting`, `indie hacker deployment`
- **Outline:**
  1. The real cost of a side project backend (EC2, Heroku, Railway)
  2. Why serverless is the cheat code for side projects
  3. The Shorlabs Hobby tier: 3K requests/month, 1.2K compute GB-s — free
  4. Tutorial: deploy a side project from zero
  5. When you'll need to upgrade (spoiler: probably not for months)
  6. Three example projects that run entirely free
- **CTA:** "Start building for free →"
- **Word count target:** 1,500–1,800

### Post 11 — Wednesday
**Title:** "Auto-Deploy on Git Push: How to Set Up CI/CD Without the CI/CD"
- **Type:** Tutorial / Feature spotlight
- **Target keywords:** `auto deploy on push`, `github webhook deployment`, `continuous deployment without ci/cd`, `deploy on git push`
- **Outline:**
  1. Why CI/CD pipelines are overkill for most projects
  2. How Shorlabs listens for GitHub webhooks
  3. Setting up auto-deploy: connect repo → enable → done
  4. How branch-based filtering works
  5. Viewing deployment logs in real-time
  6. Rolling back if something breaks
- **CTA:** "Set up auto-deploy in 2 minutes →"
- **Word count target:** 1,200–1,500

### Post 12 — Friday
**Title:** "How to Deploy a Hono/Fastify/NestJS App (and Why They're the Future of Node.js)"
- **Type:** Tutorial (multi-framework)
- **Target keywords:** `deploy hono`, `deploy fastify`, `deploy nestjs`, `hono serverless`, `fastify deployment`
- **Outline:**
  1. Beyond Express: the modern Node.js framework landscape
  2. Quick intro to Hono, Fastify, and NestJS
  3. Deploying each one on Shorlabs (side-by-side walkthroughs)
  4. Framework detection: how Shorlabs auto-detects your start command
  5. Performance comparison on serverless (cold starts, throughput)
- **CTA:** "Deploy your Node.js framework of choice →"
- **Word count target:** 1,800–2,200

---

## Week 5 (Mar 24 – Mar 28) — Advanced Topics & SEO Moat

### Post 13 — Monday
**Title:** "Frontend + Backend in One Platform: Why Full-Stack Deployment Matters"
- **Type:** Thought leadership
- **Target keywords:** `full stack deployment`, `deploy frontend and backend together`, `unified deployment platform`
- **Outline:**
  1. The fragmentation problem: Vercel for frontend, Railway for backend, Stripe for billing
  2. Why splitting your stack across platforms creates operational overhead
  3. The Shorlabs approach: one dashboard, one deploy flow, one bill
  4. Case study: deploying a Next.js frontend + FastAPI backend together
  5. Shared environment variables, unified logs, single custom domain
  6. What's coming next: monorepo support, staging environments
- **CTA:** "Unify your stack →"
- **Word count target:** 1,500–1,800

### Post 14 — Wednesday
**Title:** "How to Deploy a Python Backend with Litestar or Starlette (Async Python Beyond FastAPI)"
- **Type:** Tutorial (niche framework)
- **Target keywords:** `deploy litestar`, `deploy starlette`, `litestar hosting`, `starlette deployment`, `async python deployment`
- **Outline:**
  1. FastAPI isn't the only game in town for async Python
  2. Quick intro to Litestar and Starlette
  3. Step-by-step deployment on Shorlabs
  4. Auto-detection and start command configuration
  5. Performance on serverless: cold starts and throughput
  6. When to choose Litestar/Starlette over FastAPI
- **CTA:** "Deploy any Python framework →"
- **Word count target:** 1,200–1,500

### Post 15 — Friday
**Title:** "Serverless Cold Starts: What They Are, Why They Happen, and How to Minimize Them"
- **Type:** Educational / SEO
- **Target keywords:** `serverless cold starts`, `lambda cold start`, `reduce cold start`, `cold start optimization`
- **Outline:**
  1. What is a cold start?
  2. Why cold starts happen (container lifecycle, language runtime)
  3. Cold start benchmarks by language (Python vs Node.js)
  4. How Shorlabs minimizes cold starts (pre-warming, memory config)
  5. Memory vs cold start tradeoff: the sweet spot
  6. When cold starts don't matter (and when they do)
  7. Practical tips: lazy imports, smaller packages, right-size your function
- **CTA:** "Deploy with optimized cold starts →"
- **Word count target:** 2,000–2,500

---

## Summary Calendar

| Week | Mon | Wed | Fri |
|------|-----|-----|-----|
| **1** (Feb 24) | FastAPI deploy tutorial | Vercel vs Railway vs Shorlabs comparison | Next.js + custom domain tutorial |
| **2** (Mar 3) | Pay-per-request cost post | Flask deploy tutorial | Django deploy tutorial |
| **3** (Mar 10) | Architecture deep-dive | Express deploy tutorial | Why we're open source |
| **4** (Mar 17) | Indie hacker free deploy | Auto-deploy feature spotlight | Hono/Fastify/NestJS tutorial |
| **5** (Mar 24) | Full-stack deployment thesis | Litestar/Starlette tutorial | Cold starts educational |

---

## Content Production Notes

- **All tutorials** should include real Shorlabs screenshots/GIFs of the deploy flow
- **Every post** ends with a CTA button linking to `/sign-in` or the relevant framework's deploy flow
- **SEO:** Each post gets a unique `<title>`, `<meta description>`, and proper `<h1>` → `<h2>` → `<h3>` hierarchy
- **Distribution:** Cross-post summaries to X/Twitter, LinkedIn, and relevant subreddits (r/webdev, r/Python, r/node, r/SideProject)
- **Internal linking:** Every tutorial should link to the comparison post (Post 2) and the pricing section. Every thought piece should link to at least two tutorials.
- **Blog format:** MDX files go in `content/blog/` — use the existing frontmatter format (`title`, `date`, `summary`, `author`, `category`, optionally `image`)
