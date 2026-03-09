# Pulse AI - Multi-Tenant AI Assistant Platform

Runstate Pulse is a multi-tenant AI assistant platform for SMBs. It routes customer conversations from messaging channels and API clients to LLM providers, enforces billing, and provides admin and tenant dashboards for full control of agents, tools, and integrations.

**Status:** Active development (Phase 1)  
**Target:** Phase 1 production readiness by March 24, 2026  
**Owner:** Runstate Ltd (Mauritius)

---

**What This Repository Contains**

- A Fastify gateway with Telegram webhooks, OpenAI-compatible HTTP APIs, OAuth, and WebSockets
- An agent runtime with routing, tools, memory, scheduling, and provider fallback
- A Next.js dashboard with admin + tenant portals
- Postgres schema and migrations for multi-tenant data, billing, tools, and agents
- Docker deployment for gateway, dashboard, Postgres, Redis, and python sandbox

---

**Core Features (Verified In Code)**

**Platform & Tenancy**

- Multi-tenant data isolation across all tables and queries
- Tenant balances, usage records, and ledger transactions
- Admin user + tenant user roles with onboarding

**Agent Runtime**

- Agent profiles (system prompt, model, workspace path, tool policy)
- Routing rules (contact, group, keyword, channel default)
- Delegation and orchestration between agents
- Sliding context window (last 20 messages)
- Memory system with embeddings + retrieval
- Skill loader and workspace templates
- Heartbeat and scheduled jobs (cron)

**Tools & Skills**

- Tool registry with built-in tools: time, calculator, exec, python, scripts, memory, scheduling, email, credential vault
- Tool policy allow/deny lists per agent
- MCP tools support (Model Context Protocol)
- Plugin system that can inject tools, hooks, and routes

**Channels & Messaging**

- Telegram adapter with polling (dev) and webhook (prod)
- Group handling with mention/reply gating
- Contact allowlists and pairing flow
- Message chunking and formatting pipeline
- Email channel config for tool-based email send/read

**LLM Providers**

- Anthropic primary provider
- OpenAI fallback provider
- Per-tenant API key resolution and storage
- Usage tracking with model-level cost accounting

**API Surface**

- OpenAI-compatible `/v1/chat/completions`
- OpenAI Responses-compatible `/v1/responses`
- OAuth 2.0 authorization code flow for CLI tools
- API token auth for HTTP endpoints

**Dashboards (Admin + Tenant)**

- Admin: tenants CRUD, users, usage, conversations, plugins
- Tenant: agents, routing, skills, scripts, memory, schedules, safety, credentials
- Tenant: usage, channels, conversations, billing settings
- Onboarding flow for initial setup

---

**Architecture Overview**

```
Channels / API Clients
(Telegram, API, MCP)
          │
          ▼
     Fastify Gateway
 (Webhooks, OAuth,
  OpenAI-compatible API)
          │
          ▼
      Message Queue
     (BullMQ/Redis)
          │
          ▼
      Agent Runtime
 (routing, tools,
 memory, delegation)
          │
          ▼
   LLM Providers
(Anthropic, OpenAI)
          │
          ▼
      PostgreSQL
(tenants, agents,
 billing, usage)
```

---

**Tech Stack**

**Backend (`/pulse`)**

- Node.js 22+ / TypeScript
- Fastify
- PostgreSQL 16 + Drizzle ORM
- Redis + BullMQ
- grammY (Telegram)
- Pino logging
- Vitest

**Dashboard (`/dashboard`)**

- Next.js 16 (App Router)
- React 19
- NextAuth 5 (beta)
- Tailwind CSS 4

---

**Repository Structure**

```
Pulse_AI/
├── pulse/                    # Backend gateway + agent runtime
├── dashboard/                # Admin + tenant UI
├── docker-compose.yml        # Full stack deployment
├── docs/                     # Additional documentation
├── STATUS_SUMMARY.md         # Snapshot status
├── ROADMAP.md                # Timeline + priorities
└── CODEBASE_OVERVIEW.md      # Technical deep dive
```

---

**Local Development**

**Backend**

```bash
cd pulse
pnpm install
cp .env.example .env
# edit .env with credentials
pnpm db:migrate
pnpm tsx scripts/seed.ts
pnpm dev
```

**Dashboard**

```bash
cd dashboard
npm install
npm run dev
```

**Access**

- Backend: `http://localhost:3000`
- Dashboard: `http://localhost:3001`
- Health: `http://localhost:3000/health`

---

**Production Readiness - What’s Left**

This section is based on code review and is scoped to production hardening and launch readiness.

**Remaining for Production**

- Verify full end-to-end coverage and add CI pipeline for tests and linting
- Load testing and performance validation for queue + webhook throughput
- Monitoring and alerting beyond logs (metrics, dashboards, alert rules)
- Backup/restore runbooks for Postgres and Redis
- Confirm operational security posture for exec/sandbox tools and plugin loading
- Complete WhatsApp and WebChat adapters if they are part of the launch scope
- Finalize operational documentation for on-call, scaling, and incident response

**Already Implemented (Needs Configuration in Production)**

- Telegram webhooks (requires `WEBHOOK_BASE_URL` and `TELEGRAM_WEBHOOK_SECRET`)
- Redis queue and rate limiting (requires `REDIS_URL`)
- OpenAI fallback provider (requires `OPENAI_API_KEY` or tenant keys)
- Docker deployment for gateway + dashboard + Redis + Postgres
- OAuth + API token flows for external clients

---

**License**

UNLICENSED - Proprietary software by Runstate Ltd. All rights reserved.

---

Last updated: March 3, 2026
