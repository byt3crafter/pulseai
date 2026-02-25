# Pulse AI - Architecture & Implementation Overview

**Status:** Core Backend Engineering (Phases 1-10) is **100% Complete**. The system is technically production-ready from an API perspective.
**Next Objective:** Build the interactive Front-End UI (Phase 11) to replace manual database configuration.

---

## 🟢 WHAT IS FULLY WORKING (Backend & Core Services)

### 1. Multi-Tenant Database & Billing (Drizzle + Postgres)
- The fundamental database structure guarantees strict data isolation between your different clients.
- The `tenantBalances` system actively prevents API processing if a client has run out of credits.
- An immutable `ledgerTransactions` table tracks every top-up and LLM token deduction automatically.

### 2. The Core Agent Pipeline (Fastify + Claude 3.7)
- Webhooks from platforms like Telegram are successfully parsed, threaded into conversations, and rate-limited.
- A sliding context window automatically fetches the last 20 messages, ensuring you don't overpay for massive useless token histories.
- The system defaults to Claude 3.7 Sonnet but will seamlessly failover to OpenAI's GPT-4o if Anthropic experiences an outage.

### 3. Native Tools & Code Execution
- The `ToolRegistry` seamlessly hooks capabilities directly into the LLM's thought process.
- **Docker-in-Docker Sandboxing:** We built a highly-secure `bash_sandbox` tool. If a specific bot is authorized (`dockerSandboxEnabled = true`), the AI can write and execute arbitrary bash/python scripts inside a temporary, isolated Alpine Linux container, and then read the results.

### 4. Multi-Agent & Remote MCP Integrations
- A single workspace can host multiple distinct Bots (e.g., `@ImpexITBot` vs `@ImpexSalesBot`). These are called **Agent Profiles**.
- You can inject a unique system prompt for every Profile.
- The Agent Runtime actively connects to external **Model Context Protocol (MCP)** servers over SSE, reads their remote tool definitions, and merges them with local capabilities. This allows your bots to natively query platforms like ERPNext on the fly without hardcoding their APIs in the Pulse codebase.

### 5. Production Infrastructure (Redis & Queueing)
- All LLM responses are processed off-thread using `BullMQ` (Redis). This fixes the problem where slow AI generation would cause Telegram to timeout and drop the connection.
- A multi-stage `Dockerfile` and `docker-compose.yml` are configured for stable cloud deployments.

---

## 🟡 WHAT PARTIALLY WORKS (Dashboards & Integrations)

### 1. The Next.js Admin & Customer Portals
- The visual foundation (Tailwind, NextAuth login, layout) is beautifully constructed.
- The portal has role-based router protection so your customers cannot view the Super Admin controls.
- **What's Missing:** The actual interactive forms (Modals, Submits, Settings Toggles). Right now, the UI looks great but connecting a Telegram bot or updating an MCP server requires manual interaction via `psql` or Prisma directly. 

### 2. Third-Party "Local Agent" CLI Access
- Pulse automatically generates OAuth 2.0 Credentials (`clientId` / `clientSecret`) upon tenant creation.
- The `/oauth/token` route fully works and creates secure Access Tokens.
- **What's Missing:** The custom `pulse-agent` CLI application hasn't been built yet, so a customer cannot currently link Claude Code or Cursor through the gateway.

### 3. Communication Channels
- Telegram Webhook polling and routing is structurally operational.
- **What's Missing:** WhatsApp Business API and WebChat interface layers have not been touched yet.

---

## 🔴 WHAT IS NOT BUILT YET (The Focus for Phase 11)

Because the backend is technically feature-complete, our immediate focus is transitioning to building out the Next.js forms so a non-technical user could onboard themselves completely within 5 minutes.

1. **Telegram Configuration UI:** A page where a tenant can simply paste their Bot Token from BotFather to link their profile.
2. **Profile Builder:** A page where tenants can create sub-agents (e.g., "Support Bot", "Lead Gen Bot") and write their persona prompts.
3. **MCP Connections UI:** A page allowing a workspace to input an arbitrary MCP Server URL and authenticate it for one of their agent profiles.
4. **Billing Dashboard:** A Stripe-integrated UI that lets users purchase more AI processing credits with their credit card.
