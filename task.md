# Pulse AI Gateway Project

## Analysis
- [x] Review OpenClaw reference repository (first commit and current).
- [x] Identify PostgreSQL database schemas for session and memory management in OpenClaw.

## Setup
- [x] Initialize the new Pulse project.
- [x] Set up the database schema taking inspiration from OpenClaw's approach to sessions and memories.

## Verification
- [x] Run Docker database container.
- [x] Generate and apply Drizzle database migrations.
- [x] Verify build compiles successfully.
- [x] Run seed script to verify database connectivity.
- [x] Initialize Git repository and commit the scaffolded Pulse Gateway code.

## Phase 2: Admin Dashboard & Credits
- [x] Design and implement the `tenant_balances` credit ledger in the database.
- [x] Update the core Agent Runtime to block messages if credits are completely exhausted.
- [x] Scaffold the Next.js/Vite Admin Dashboard project.
- [x] Implement OAuth 2.0 Provider flow for standard CLI tools (Claude Code/Codex).
- [/] Add "Enable Third-Party CLI" toggle to Admin Dashboard and database config.
- [x] Add "Enable Third-Party CLI" toggle to Admin Dashboard and database config.
- [x] Plan the Local Agent CLI structure.

## Phase 3: Dashboard UI Construction
- [x] Implement Next.js Layout templates for Super Admin (`/admin`) and Customer (`/app`).
- [x] Build the Super Admin "Tenant Manager" data table component.
- [x] Build the Customer "Overview & Credits" panel.
- [x] Integrate database fetch logic cleanly using Next.js Server Actions.

## Phase 4: Next-Auth Login Management
- [x] Fix broken UI module compilations (`config.js`, `schema.js`).
- [x] Add `users` and `sessions` tables to the Drizzle PostgreSQL schema.
- [x] Install NextAuth (`next-auth`) and Drizzle PostgreSQL adapter.
- [x] Build the `/login` portal with credentials flow.
- [x] Protect `/admin` and `/dashboard` routes with role-based Next.js Middleware.

## Phase 5: Production Readiness (Rate Limiting & Background Queues)
- [x] Initialize Redis connection and structured environment variables.
- [x] Implement Fastify `@fastify/rate-limit` middleware at the Gateway entry point.
- [x] Setup `BullMQ` for asynchronous processing of LLM completions to prevent external timeout drops.
- [x] Update the core Agent Runtime to push incoming messages to a background worker queue.

## Phase 6: Core Capabilities (Tools & Webhooks)
- [x] Create generic Tool Interface and Tool Registry.
- [x] Implement a system `time` tool as a proof of concept.
- [x] Wire the OpenClaw-inspired tools engine into the Anthropic Claude provider.
- [x] Transition Telegram from long-polling to production Webhook routing over Fastify.

## Phase 7: Dashboard APIs (Tenant CRUD)
- [ ] Implement Server Actions / Route Handlers for creating new Tenants.
- [ ] Implement updating and deleting functionalities for Tenants.
- [ ] Save Global Settings configuration (e.g., API keys, Toggles) securely to the Database.

## Phase 8: High Availability (OpenAI Fallback)
- [ ] Fully implement `pulse/src/agent/providers/openai.ts` using the OpenAI SDK.
- [ ] Update `ProviderManager.ts` to implement a fallback wrapper (if Claude fails, retry with GPT-4o).
- [ ] Ensure token usage billing logic respects the distinct pricing of OpenAI models.

## Phase 9: Quality & Deployment
- [ ] Configure `vitest` and write automated assertions for the `AgentRuntime` sliding window logic and token billing.
- [ ] Write the unified `Dockerfile` for the Next.js Dashboard and Fastify Gateway.
- [ ] Create a `docker-compose.yml` defining the stack (Database, Redis, and Web servers).
