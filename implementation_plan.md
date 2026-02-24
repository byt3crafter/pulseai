# Runstate Pulse - Implementation Plan

## Goal
To scaffold and implement **Pulse**, a multi-tenant AI gateway platform for SME clients. The project will heavily use concepts proven by OpenClaw (session sliding windows, modular skills, token usage tracking) but will adapt them to a cloud-native, multi-tenant B2B Architecture.

> [!NOTE]
> On reviewing the OpenClaw repository's source code, I found that OpenClaw uses **local `.jsonl` files** for session transcripts and **SQLite (`sqlite-vec`)** for its memory indexing. While this is perfect for a local CLI agent, it is not scalable for a multi-tenant cloud SaaS. Therefore, Pulse will faithfully replicate the *behavior* and *logic* of OpenClaw's memory but will store the vectors and transcripts in **PostgreSQL** to properly isolate data between your clients.

## User Review Required

> [!IMPORTANT]
> **Database Choice Clarification**
> Since you mentioned "OpenClaw uses Postgres" — it actually uses `SQLite` and the filesystem because it's meant to run on a single developer's machine. For Pulse (where you are hosting multiple businesses on one server), we **must** use PostgreSQL. Is this architectural adaptation acceptable to you?

## Proposed Changes

We will start Phase 1.

### 1. Project Initialization & Tooling
- Initialize a Node 22 + TypeScript project.
- Set up `Fastify` for the API gateway.
- Set up `grammY` for Telegram integrations.
- Configure `Drizzle ORM` + `Postgres`.

### 2. Database Schema (The "Cloud" OpenClaw)
Implement the core multi-tenant schema in PostgreSQL:
- `tenants` (Client isolation)
- `conversations` (Thread grouping)
- `messages` (Postgres equivalent of OpenClaw's `jsonl` files)
- `usage_records` (Cost tracking per tenant)
- *(Future)* `memory_chunks` (Using `pgvector` as the direct equivalent to OpenClaw's `sqlite-vec`).

### 3. Agent Runtime & Sliding Window
- Implement the sliding window strategy: Fetch the last N messages from Postgres instead of reading the tail of a `jsonl` file.
- Format the messages into Claude's expected payload format.
- Execute tools natively in Node (sandboxed), avoiding OpenClaw's unrestricted bash capabilities which would be a security risk for a SaaS.

### 4. Telegram Webhook Adapter
- Build the `grammY` webhook receiver.
- Normalize Telegram messages into the generic `InboundMessage` format.
- Apply tenant allowlisting.

### 5. Phase 2: Admin Dashboard & Credit System (NEW)
To support a scalable SaaS model, we will introduce a credit system and a management UI:

#### Credit System Architecture
- **Tokens to Credits Conversion**: Instead of exposing raw API token costs directly to the user (which fluctuate and are confusing), we will implement an abstraction: *Credits*. 
  - For example, `1 Credit = $0.01` or `1 Credit = 1000 Tokens`.
  - The `usage_records` table will be updated to deduct from a `tenant_balances` table.
  - When the Agent Runtime receives a message, it will perform a **Pre-flight Check**: `SELECT balance FROM tenant_balances WHERE id = ?`. If `balance < required`, refuse the API call and inform the user to top up.
- **Top-up Logic**: Integrate Stripe (or a local payment gateway) to allow tenants to buy "Credit Packs" (e.g., 5,000 Credits for $50).

#### Dashboard & UI Architecture
To properly scale Pulse as a multi-tenant SaaS, the Next.js frontend will be split into two distinct visual areas:

**1. The Super Admin Area (`/admin/...`)**
This is where YOU monitor the health and revenue of the Pulse platform.
- **Tenant Management**: List all registered customers, view their details, block/suspend abusive tenants, or manually adjust their credit balances.
- **Global Usage Metrics**: View total LLM token burn rate across the entire platform, track API error rates.
- **Infrastructure Settings**: Configure the root Anthropic API key, database backup settings, etc.

**2. The Customer Dashboard (`/app/...`)**
This is where your clients log in to manage their specific instance.
- **Overview**: View current Credit Balance and a line chart of daily API consumption.
- **API Keys / CLI Setup**: Generate an API key to paste into `pulse-agent` or toggle the "OAuth CLI Access" integration for standard tools.
- **Channel Configuration**: Connect their Telegram Bot Token, WebChat webhook, or WhatsApp number.
- **Conversation Logs**: Let them audit exactly what the AI agent is saying to their users.
- **Billing**: The Stripe checkout flow to purchase more Credit Packs.

### Phase 4: Authentication & Security (Next-Auth)
To secure the new Dashboard architecture, we need a robust Login Management system.
- **Tech Stack**: NextAuth.js (Auth.js v5) integrated with Drizzle ORM.
- **Features**:
  - Secure `/login` portal for customers and admins.
  - Role-based Access Control (RBAC): `role: 'ADMIN'` can access `/admin/*` routes; `role: 'TENANT'` can only access their specific `/dashboard` workspace.
  - Session management mapped directly to the PostgreSQL database.

#### Local Agent & Third-Party CLI Support (Local -> Cloud)
- **Use Case**: Customers who want to run the actual AI / tools locally on their machine (like v0, Cursor, or a local IDE plugin) but route the intelligence through your managed Pulse Gateway.
- **Custom Pulse CLI**: We will build a small CLI tool (e.g. `npx pulse-agent link`).
  - The CLI connects to the Pulse Gateway via WebSockets or long-polling.
  - When the cloud gateway decides a local tool needs to be run (like reading a local file), it routes the `tool_call` down the WebSocket to the local CLI.
- **OAuth 2.0 Provider for Standard Tools (Claude Code, Codex, Cursor)**:
  - **The Problem:** Tools like `claude code` expect standard Anthropic or OpenAI API keys, or they use OAuth to authenticate against a primary provider.
  - **The Solution:** Pulse will act as an **OAuth 2.0 Provider** (or offer an Anthropic/OpenAI API compatible endpoint).
  - Users can configure their CLI tools to use the Pulse Gateway URL as the base API URL. 
  - To authenticate, we will implement an OAuth flow (`/oauth/authorize`, `/oauth/token`). 
  - **Admin Control:** This feature will be gated. An Admin must explicitly enable "Allow Third-Party CLI Integrations" for a specific tenant in the Dashboard before their users can authenticate.

### Phase 5: Production Readiness (Redis, BullMQ & Rate Limiting) (NEW)
To transition Pulse from a working prototype to a robust production system, we must address scaling bottlenecks as highlighted in the codebase review:
- **Rate Limiting (`@fastify/rate-limit`)**: Protect the gateway from DDOS or accidental infinite loops. We will implement global and per-tenant rate limits backed by Redis.
- **Asynchronous LLM Queues (`bullmq`)**: Telegram and WhatsApp webhooks require a 200 OK response within a few seconds, but Claude 3.7 can easily take 10-30 seconds to generate a response.
  - We will install `BullMQ` and offload all `agent.process_message` events to background workers.
  - The HTTP webhook will instantly return 200 OK after pushing the job to Redis.
  - Background workers will spin up, pull the context window, call Anthropic, and dispatch outbound messages via the Channel Interface.

### Phase 6: Core Capabilities (Tools & Webhooks) (NEW)
- **Tools Framework**: OpenClaw's strength lies in native system tools. We will implement a `ToolRegistry` that feeds standard JSON Schema tools to the Anthropic API. Instead of arbitrary bash execution, tools will be strictly typed TypeScript functions (e.g., getting the time, checking the weather, fetching data from ERPNext).
- **Production Webhooks**: Shift the Telegram Channel adapter from local `polling` to a secure Fastify `POST /webhooks/telegram` endpoint.

### Phase 7: Dashboard Management APIs (Tenant CRUD)
To complete the React UI:
- Build `Next.js Server Actions` to interface directly with Drizzle ORM.
- **Create Tenant**: Add a form modal that validates input via Zod and creates `pulse.tenants` entries, auto-generating a secure encryption key or Webhook path for them.
- **Global Settings Persistence**: The "Global Settings" page currently displays hardcoded structure. Connect it to Postgres `JSONB` parameter rows so the Super Admin can dynamically update the root Anthropic API key and LLM configurations without redeploying code.

### Phase 8: High Availability (OpenAI Fallback)
- To guarantee 99.9% uptime for B2B Chatbots, we must survive Anthropic API outages.
- Flesh out `src/agent/providers/openai.ts` using the official `@openai/api` SDK, mapping the OpenClaw-style tools and `InboundMessage` format to OpenAI's tool-calling definitions.
- Enhance the `ProviderManager` with a `try/catch` router. If Claude 3.7 throws a `5xx` error, automatically catch the error, re-route the prompt to `gpt-4o`, and log the failover event.

### Phase 9: Quality Assurance & Container Deployment
- **Vitest Testing**: Add deterministic Unit Tests inside a `/test/unit` directory. Explicitly mock the database (`drizzle-mock`) to verify that the Agent Runtime properly truncates the 20-message Sliding Context Window to prevent token explosion.
- **Dockerization**: Construct a clean Node.js Alpine multi-stage `Dockerfile`. 
- **Docker Compose**: Provide a `docker-compose.yml` that seamlessly boots PostgeSQL (`pgvector`), Redis, and the compiled Pulse Gateways in isolated container networks.

## Verification Plan

### Automated Tests
- Unit tests for the context window builder to ensure it cleanly limits tokens/messages.
- Unit tests for the Telegram adapter parsing logic.
- Run `npm run test` using `vitest`.

### Manual Verification
1. Deploy the Pulse setup on a local Docker Compose stack (`db` + `redis` + `pulse`).
2. Run database migrations and the seed script to create a "Demo Tenant".
3. Hook up a test Telegram Bot (using ngrok or local polling).
4. Send messages to the bot from an allowed Telegram account and verify it retains context from previous messages (the OpenClaw memory style).
5. Verify in the database that `tenant_id` is successfully tracking usage and isolating messages.
