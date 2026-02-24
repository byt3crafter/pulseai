# Runstate AI Assistant Platform — Project Kickoff Document

**Author:** Claude (for Ludovic @ Runstate Ltd)
**Date:** February 23, 2026
**Purpose:** Complete project setup guide + Claude Code initialization prompt

---

## 1. Project Naming

### Recommended Name: **Pulse**

**Full product name:** Runstate Pulse
**Internal codename:** `pulse`
**npm package:** `@runstate/pulse`
**Repo:** `runstate/pulse`

**Why Pulse:**
- Short, memorable, professional — works for SME clients in Mauritius and beyond
- Evokes "always-on", "heartbeat of your business", "staying connected"
- Domain-friendly: pulse.runstate.mu
- No conflicts with major open-source projects
- Works in both English and French contexts (relevant for Mauritius)

**Alternative names considered:**
- **Relay** — good but overused in tech (Facebook Relay, etc.)
- **Signal** — taken (messaging app)
- **Conduit** — decent but harder to say/spell for non-technical clients
- **Nexus** — good but slightly overused
- **Arc** — short and clean but vague
- **Beacon** — nice but slightly generic

---

## 2. Architecture Overview

```
                    ┌─────────────────────────────┐
                    │      Pulse Gateway           │
                    │   (Node.js / TypeScript)      │
                    │                               │
                    │  ┌─────────┐  ┌───────────┐  │
  Telegram ────────►│  │ Channel │  │   Agent    │  │◄──── Anthropic API
  WhatsApp ────────►│  │ Router  │──│  Runtime   │  │◄──── OpenAI API
  Web Chat ────────►│  │         │  │            │  │
  (future)  ────────►│  └─────────┘  └───────────┘  │
                    │                               │
                    │  ┌─────────┐  ┌───────────┐  │
                    │  │ Tenant  │  │  Session   │  │
                    │  │ Manager │  │  Store     │  │
                    │  └─────────┘  └───────────┘  │
                    │                               │
                    │  ┌─────────┐  ┌───────────┐  │
                    │  │  Skill  │  │  Usage /   │  │
                    │  │ Registry│  │  Billing   │  │
                    │  └─────────┘  └───────────┘  │
                    └──────────────┬────────────────┘
                                   │
                         ┌─────────┴─────────┐
                         │    PostgreSQL      │
                         │  (tenants, sessions│
                         │   messages, usage) │
                         └───────────────────┘
```

### Key Design Principles

1. **Channel-agnostic core** — The agent runtime knows nothing about Telegram/WhatsApp/etc. Channels are adapters that normalize messages into a common format.
2. **Multi-tenant from day one** — Every message belongs to a tenant. Isolation is at the database level.
3. **Plugin/skill system** — Business logic (ERPNext queries, appointment booking, etc.) is registered as skills, not hardcoded.
4. **Secure by default** — API keys per tenant, message encryption at rest, allowlists, rate limiting.
5. **Observable** — Structured logging, usage tracking, webhook notifications.

---

## 3. Technology Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Runtime | Node.js 22+ / TypeScript 5.x | Same as OpenClaw, proven for async I/O, your DockCtrl experience |
| Framework | Fastify | Lighter than Express, schema validation built-in, great for APIs |
| Telegram | grammY | Same as OpenClaw uses, excellent TypeScript support, well-maintained |
| WhatsApp (future) | Baileys / WhatsApp Business API | Baileys for personal, Business API for official |
| Database | PostgreSQL 16 | Multi-tenant, JSONB for flexible config, your Linode setup |
| Cache/Queue | Redis | Session state, message queuing, rate limiting |
| AI Provider | Anthropic Claude API (primary) | Best for long-context, prompt injection resistance |
| AI Provider | OpenAI (fallback) | Model failover support |
| ORM | Drizzle ORM | TypeScript-first, lightweight, great migrations |
| Validation | Zod | Runtime type validation, pairs with TypeScript |
| Testing | Vitest | Fast, TypeScript-native |
| Deployment | Docker + Docker Compose | Fits your existing Linode/Docker workflow |
| Admin UI (Phase 2) | React + Vite | Reuse DockCtrl patterns |

---

## 4. Project Structure

```
pulse/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
├── README.md
│
├── src/
│   ├── index.ts                    # Entry point — boots gateway
│   ├── config.ts                   # Environment config with Zod validation
│   │
│   ├── gateway/
│   │   ├── server.ts               # Fastify server setup
│   │   ├── routes/
│   │   │   ├── health.ts           # Health check endpoints
│   │   │   ├── webhooks.ts         # Incoming webhook handlers
│   │   │   └── admin.ts            # Admin API (Phase 2)
│   │   └── middleware/
│   │       ├── auth.ts             # API key / JWT auth
│   │       └── rate-limit.ts       # Per-tenant rate limiting
│   │
│   ├── channels/
│   │   ├── types.ts                # Common message types (InboundMessage, OutboundMessage)
│   │   ├── channel.interface.ts    # Channel adapter interface
│   │   ├── channel-router.ts       # Routes messages to correct channel
│   │   ├── telegram/
│   │   │   ├── adapter.ts          # grammY bot setup + message normalization
│   │   │   ├── handlers.ts         # Message/command handlers
│   │   │   └── formatter.ts        # Format agent responses for Telegram (markdown, chunking)
│   │   ├── whatsapp/               # Phase 2
│   │   │   ├── adapter.ts
│   │   │   ├── handlers.ts
│   │   │   └── formatter.ts
│   │   └── webchat/                # Phase 3
│   │       ├── adapter.ts
│   │       └── formatter.ts
│   │
│   ├── agent/
│   │   ├── runtime.ts              # Core agent loop — receives normalized messages, calls LLM
│   │   ├── providers/
│   │   │   ├── provider.interface.ts  # LLM provider interface
│   │   │   ├── anthropic.ts        # Claude API integration
│   │   │   └── openai.ts           # OpenAI integration (fallback)
│   │   ├── context.ts              # Conversation context builder (pulls history, tenant config)
│   │   ├── system-prompt.ts        # System prompt builder per tenant
│   │   └── tools/
│   │       ├── tool.interface.ts   # Tool/skill interface
│   │       ├── registry.ts         # Skill registry
│   │       └── built-in/
│   │           ├── time.ts         # Current time/date
│   │           ├── weather.ts      # Weather lookup
│   │           └── erpnext.ts      # ERPNext queries (Phase 3)
│   │
│   ├── tenants/
│   │   ├── tenant.service.ts       # CRUD for tenants
│   │   ├── tenant.types.ts         # Tenant config types
│   │   └── allowlist.ts            # Per-tenant contact allowlisting
│   │
│   ├── sessions/
│   │   ├── session.service.ts      # Session CRUD + history
│   │   ├── session.types.ts        # Session types
│   │   └── pruning.ts              # Context window management
│   │
│   ├── storage/
│   │   ├── db.ts                   # Drizzle DB connection
│   │   ├── schema.ts               # Database schema (all tables)
│   │   ├── migrations/             # Drizzle migrations
│   │   └── redis.ts                # Redis connection + helpers
│   │
│   ├── billing/
│   │   ├── usage.service.ts        # Token/message usage tracking
│   │   └── limits.ts               # Per-tenant limits enforcement
│   │
│   └── utils/
│       ├── logger.ts               # Structured logging (pino)
│       ├── errors.ts               # Custom error classes
│       └── crypto.ts               # Encryption helpers for API keys at rest
│
├── test/
│   ├── unit/
│   │   ├── agent/
│   │   ├── channels/
│   │   └── tenants/
│   └── integration/
│       ├── telegram.test.ts
│       └── agent.test.ts
│
├── scripts/
│   ├── seed.ts                     # Seed a test tenant
│   ├── migrate.ts                  # Run DB migrations
│   └── doctor.ts                   # Health check script (inspired by OpenClaw)
│
└── docs/
    ├── setup.md
    ├── channels.md
    ├── security.md
    └── api.md
```

---

## 5. Database Schema (Core Tables)

```sql
-- Tenants (your clients)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    -- config contains: ai_provider, model, system_prompt_template,
    -- allowed_channels, max_messages_per_day, features_enabled
    api_key_hash VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Channel connections per tenant
CREATE TABLE channel_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    channel_type VARCHAR(50) NOT NULL, -- 'telegram', 'whatsapp', 'webchat'
    channel_config JSONB NOT NULL DEFAULT '{}',
    -- telegram: { bot_token, webhook_secret, allowed_chat_ids }
    -- whatsapp: { phone_number_id, access_token, verify_token }
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations (a thread between a contact and the assistant)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    channel_type VARCHAR(50) NOT NULL,
    channel_contact_id VARCHAR(255) NOT NULL, -- Telegram user ID, phone number, etc.
    contact_name VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, channel_type, channel_contact_id)
);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    tenant_id UUID REFERENCES tenants(id),
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system', 'tool'
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    -- metadata: { tokens_used, model, latency_ms, tool_calls, channel_message_id }
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    conversation_id UUID REFERENCES conversations(id),
    model VARCHAR(100) NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd DECIMAL(10, 6) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contact allowlists
CREATE TABLE allowlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    channel_type VARCHAR(50) NOT NULL,
    contact_id VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'approved', -- 'approved', 'pending', 'blocked'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, channel_type, contact_id)
);

-- Skills/tools enabled per tenant
CREATE TABLE tenant_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    skill_name VARCHAR(100) NOT NULL,
    config JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, skill_name)
);

-- Indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_tenant ON messages(tenant_id, created_at);
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id, updated_at);
CREATE INDEX idx_usage_tenant ON usage_records(tenant_id, created_at);
```

---

## 6. Key Interfaces

```typescript
// === Channel Types ===

interface InboundMessage {
  id: string;
  tenantId: string;
  channelType: 'telegram' | 'whatsapp' | 'webchat';
  channelContactId: string;  // Telegram user ID, phone number, etc.
  contactName?: string;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  replyToMessageId?: string;
  raw: unknown;  // Original channel-specific payload
  receivedAt: Date;
}

interface OutboundMessage {
  conversationId: string;
  channelType: string;
  channelContactId: string;
  content: string;
  format?: 'text' | 'markdown' | 'html';
  replyToMessageId?: string;
}

// === Channel Adapter Interface ===

interface ChannelAdapter {
  readonly channelType: string;

  initialize(connections: ChannelConnection[]): Promise<void>;
  shutdown(): Promise<void>;

  // Normalize incoming message to common format
  onMessage(handler: (msg: InboundMessage) => Promise<void>): void;

  // Send response back through channel
  sendMessage(msg: OutboundMessage): Promise<{ channelMessageId: string }>;

  // Channel-specific formatting (e.g., Telegram Markdown vs WhatsApp formatting)
  formatResponse(content: string): string;
}

// === LLM Provider Interface ===

interface LLMProvider {
  readonly name: string;

  chat(params: {
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    maxTokens?: number;
  }): Promise<{
    content: string;
    toolCalls?: ToolCall[];
    usage: { inputTokens: number; outputTokens: number };
    model: string;
  }>;
}

// === Tool/Skill Interface ===

interface Skill {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema

  execute(params: {
    tenantId: string;
    conversationId: string;
    args: Record<string, unknown>;
  }): Promise<{
    result: string;
    metadata?: Record<string, unknown>;
  }>;
}
```

---

## 7. Security Model

### For SME Clients

1. **Tenant Isolation** — Every query is scoped to `tenant_id`. No cross-tenant data access.
2. **API Key Encryption** — Provider API keys (Anthropic, OpenAI) stored encrypted at rest (AES-256-GCM).
3. **Contact Allowlisting** — By default, only approved contacts can interact with the bot. Unknown senders get a "Contact your administrator" message.
4. **Rate Limiting** — Per-tenant message limits (e.g., 100 messages/day on basic plan).
5. **No Tool Execution on Host** — Unlike OpenClaw, Pulse does NOT run arbitrary bash commands. Skills are predefined, sandboxed functions.
6. **Input Sanitization** — All user messages are treated as untrusted. System prompts are not exposed to users.
7. **Audit Trail** — All messages and tool calls are logged with timestamps and token usage.
8. **Webhook Validation** — Telegram webhook secrets, HMAC validation on all incoming webhooks.

### What We Remove from OpenClaw

But we must have it in mind and make it and options what is the customer want that. build optional
- No host bash/shell access
- No browser automation
- No file system access
- No device node control
- No elevated permissions mode

---

## 8. Claude Code Initialization Prompt

Below is the complete prompt to paste into Claude Code to scaffold the project. Copy everything between the `---START PROMPT---` and `---END PROMPT---` markers.

```
---START PROMPT---

I need you to initialize a new TypeScript project called "Pulse" — a multi-tenant AI assistant gateway platform for SME clients. This is a commercial product built by Runstate Ltd (runstate.mu) in Mauritius.

## Project Overview

Pulse is a multi-tenant AI assistant that connects to messaging channels (starting with Telegram) and routes conversations to LLM providers (starting with Anthropic Claude). It's designed for SME clients who want an AI assistant for their business on channels their customers already use.

Think of it as a stripped-down, multi-tenant, security-hardened version of OpenClaw (github.com/openclaw/openclaw) — but purpose-built for B2B SaaS deployment.

## Initialize the Project

1. Create a new directory called `pulse`
2. Initialize with `pnpm init`
3. Set up TypeScript 5.x with strict mode
4. Use ESM modules (type: "module" in package.json)
5. Node.js >= 22

## Dependencies to Install

**Core:**
- fastify (web framework + API)
- grammy (Telegram bot framework)
- @anthropic-ai/sdk (Claude API)
- openai (OpenAI API — fallback provider)
- drizzle-orm + drizzle-kit (database ORM + migrations)
- @electric-sql/pglite (for local dev) OR postgres (for pg driver)
- postgres (pg driver for production)
- ioredis (Redis client)
- zod (validation)
- pino + pino-pretty (structured logging)
- dotenv (env loading)
- nanoid (ID generation)

**Dev:**
- typescript
- tsx (TypeScript execution)
- vitest (testing)
- @types/node
- eslint + @typescript-eslint/parser + @typescript-eslint/eslint-plugin

## Project Structure

Create the following directory structure with placeholder files. Each file should have a meaningful implementation or at minimum a well-documented skeleton with TODO comments for parts that need fleshing out.

```
pulse/
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── gateway/
│   │   ├── server.ts
│   │   ├── routes/
│   │   │   ├── health.ts
│   │   │   └── webhooks.ts
│   │   └── middleware/
│   │       ├── auth.ts
│   │       └── rate-limit.ts
│   ├── channels/
│   │   ├── types.ts
│   │   ├── channel.interface.ts
│   │   ├── channel-router.ts
│   │   └── telegram/
│   │       ├── adapter.ts
│   │       ├── handlers.ts
│   │       └── formatter.ts
│   ├── agent/
│   │   ├── runtime.ts
│   │   ├── providers/
│   │   │   ├── provider.interface.ts
│   │   │   ├── anthropic.ts
│   │   │   └── openai.ts
│   │   ├── context.ts
│   │   ├── system-prompt.ts
│   │   └── tools/
│   │       ├── tool.interface.ts
│   │       ├── registry.ts
│   │       └── built-in/
│   │           └── time.ts
│   ├── tenants/
│   │   ├── tenant.service.ts
│   │   └── tenant.types.ts
│   ├── sessions/
│   │   ├── session.service.ts
│   │   └── session.types.ts
│   ├── storage/
│   │   ├── db.ts
│   │   ├── schema.ts
│   │   └── redis.ts
│   ├── billing/
│   │   └── usage.service.ts
│   └── utils/
│       ├── logger.ts
│       ├── errors.ts
│       └── crypto.ts
├── test/
│   └── unit/
│       └── agent/
│           └── runtime.test.ts
├── scripts/
│   └── seed.ts
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
├── tsconfig.json
├── drizzle.config.ts
└── README.md
```

## Implementation Details

### config.ts
Use Zod to validate all environment variables. Required vars:
- NODE_ENV, PORT (default 3000)
- DATABASE_URL (PostgreSQL connection string)
- REDIS_URL
- ANTHROPIC_API_KEY (platform-level default, tenants can override)
- ENCRYPTION_KEY (for encrypting tenant API keys at rest, 32-byte hex)
- LOG_LEVEL (default 'info')

### storage/schema.ts
Use Drizzle ORM to define these tables (PostgreSQL):
- tenants (id uuid, name, slug unique, config jsonb, api_key_hash, status, timestamps)
- channel_connections (id uuid, tenant_id FK, channel_type, channel_config jsonb encrypted, status, timestamps)
- conversations (id uuid, tenant_id FK, channel_type, channel_contact_id, contact_name, metadata jsonb, status, timestamps) with unique on (tenant_id, channel_type, channel_contact_id)
- messages (id uuid, conversation_id FK, tenant_id FK, role enum, content text, metadata jsonb, timestamps)
- usage_records (id uuid, tenant_id FK, conversation_id FK, model, input_tokens, output_tokens, cost_usd decimal, timestamps)
- allowlists (id uuid, tenant_id FK, channel_type, contact_id, contact_name, status, timestamps)

Add proper indexes for common queries.

### channels/types.ts
Define InboundMessage and OutboundMessage interfaces as described in the architecture doc. These are the common message format that all channels normalize to/from.

### channels/channel.interface.ts
Define the ChannelAdapter interface with: initialize(), shutdown(), onMessage(), sendMessage(), formatResponse().

### channels/telegram/adapter.ts
Implement the Telegram channel adapter using grammY:
- Accept bot token from channel_connections config
- Set up webhook mode (not polling) for production, but support polling mode for development
- Normalize incoming Telegram messages to InboundMessage format
- Handle text messages, photos (with caption), and documents
- Send responses back, supporting Telegram MarkdownV2 formatting
- Handle message chunking for responses > 4096 chars (Telegram limit)
- Implement typing indicator while agent is processing

### agent/runtime.ts
The core agent loop:
1. Receive normalized InboundMessage
2. Look up tenant config
3. Look up or create conversation
4. Load conversation history (last N messages, configurable per tenant)
5. Build system prompt from tenant config
6. Call LLM provider with messages + available tools
7. If tool call, execute tool and loop back to step 6
8. Save assistant response to database
9. Track usage (tokens, cost)
10. Return response to channel adapter

Implement with proper error handling, timeouts, and retry logic.

### agent/providers/anthropic.ts
Implement the Anthropic provider using @anthropic-ai/sdk:
- Support claude-sonnet-4-5-20250929 as default model
- Map tools to Anthropic's tool_use format
- Handle streaming (for typing indicators)
- Parse usage from response
- Handle rate limits with exponential backoff

### agent/providers/openai.ts
Implement the OpenAI provider as fallback:
- Support gpt-4o as default model
- Map tools to OpenAI's function calling format
- Same interface as Anthropic provider

### agent/system-prompt.ts
Build system prompts per tenant. Default template:

```
You are a helpful AI assistant for {tenant.name}.
{tenant.config.custom_instructions || ''}

Guidelines:
- Be professional, friendly, and concise
- If you don't know something, say so — don't make things up
- Respect the user's time — keep responses focused
- You can use the tools available to you to help answer questions

Current date and time: {now}
```

### tenants/tenant.service.ts
CRUD operations for tenants:
- createTenant(name, slug, config)
- getTenantBySlug(slug)
- getTenantById(id)
- updateTenantConfig(id, config)
- All queries scoped, no cross-tenant leakage

### sessions/session.service.ts
Conversation and message management:
- getOrCreateConversation(tenantId, channelType, contactId, contactName)
- addMessage(conversationId, tenantId, role, content, metadata)
- getConversationHistory(conversationId, limit)
- pruneOldMessages(conversationId, keepLast)

### billing/usage.service.ts
- trackUsage(tenantId, conversationId, model, inputTokens, outputTokens)
- getUsageSummary(tenantId, startDate, endDate)
- checkLimits(tenantId) — returns whether tenant has exceeded their plan limits

### utils/logger.ts
Pino logger with:
- Structured JSON logging in production
- Pretty printing in development
- Request ID tracking
- Tenant ID in all log lines

### utils/crypto.ts
- encrypt(plaintext, key) — AES-256-GCM encryption for API keys at rest
- decrypt(ciphertext, key) — corresponding decryption
- hashApiKey(key) — SHA-256 hash for tenant API key verification

### gateway/server.ts
Fastify server setup:
- Register routes (health, webhooks, admin)
- CORS configuration
- Request logging
- Graceful shutdown handling
- Swagger/OpenAPI docs (optional, nice to have)

### gateway/routes/health.ts
- GET /health — basic health check (returns { status: 'ok', version, uptime })
- GET /health/ready — readiness check (DB connected, Redis connected, Telegram bot connected)

### gateway/routes/webhooks.ts
- POST /webhooks/telegram/:tenantSlug — Telegram webhook endpoint
- Validate webhook secret
- Route to Telegram adapter

### docker-compose.yml
Development environment:
- pulse app (Node.js)
- PostgreSQL 16
- Redis 7
- Volumes for data persistence

### Dockerfile
Multi-stage build:
- Build stage: install deps, compile TypeScript
- Production stage: Node.js 22 alpine, copy dist, run

### .env.example
All required environment variables with example values and comments.

### scripts/seed.ts
Seed script that:
1. Creates a test tenant called "Demo Business"
2. Creates a Telegram channel connection (bot token from env)
3. Adds a test contact to the allowlist
4. Logs the setup details

### README.md
Include:
- Project description
- Quick start (docker-compose up)
- Development setup
- Environment variables reference
- Architecture overview (brief)
- Deployment guide (brief)

## Important Implementation Notes

1. **Security first**: No shell access, no file system access, no arbitrary code execution. All "tools" are predefined TypeScript functions.

2. **Multi-tenant from the start**: Every database query must include tenant_id. Use a helper function that wraps all queries with tenant scoping.

3. **Channel-agnostic agent**: The agent runtime should NEVER import from channels/telegram or any specific channel. It only works with the common InboundMessage/OutboundMessage types.

4. **Graceful degradation**: If the primary LLM provider fails, fall back to the secondary. If that fails, send a friendly "I'm experiencing issues, please try again" message.

5. **Conversation context**: Load the last 20 messages by default for context. Allow per-tenant configuration.

6. **Message chunking**: Telegram has a 4096 character limit. Split long responses intelligently at paragraph boundaries, not mid-sentence.

7. **Typing indicator**: Show "typing..." in Telegram while the agent is processing. Use grammY's chatAction plugin.

8. **Error boundaries**: No error should crash the process. Wrap the entire message handling pipeline in try/catch and log errors.

9. **Environment**: Development uses polling mode for Telegram. Production uses webhooks. The adapter should support both.

10. **All config in one place**: Use the config.ts Zod schema as the single source of truth for all configuration.

After scaffolding, make sure:
- `pnpm install` works
- `pnpm build` compiles without errors
- `docker-compose up` starts all services
- The project structure is clean and well-organized

Do NOT implement features we don't need yet: no WhatsApp, no web chat, no admin UI, no MCP servers. Keep it lean. Those come in Phase 2+.

---END PROMPT---
```

---

## 9. Domain & Branding Quick Wins

**Domains to check/register:**
- pulse.runstate.mu (subdomain — you control runstate.mu)
- getpulse.ai (if available, for marketing)
- pulseby.runstate.mu (alternative)

**First things to set up after scaffolding:**
1. Private GitHub repo under your account
2. Basic CI with GitHub Actions (lint + build + test)
3. A Linode instance for staging (can be small — 2GB Nanode)
4. A Telegram bot via @BotFather for development

---

## 10. Phase 1 Milestones

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 1 | Project scaffold + DB + Telegram connected | Bot responds "Hello" to messages |
| 2 | Agent runtime + Claude integration | Bot has intelligent conversations |
| 3 | Multi-tenant + allowlisting | Multiple businesses on one instance |
| 4 | Usage tracking + basic admin script | Know who's using what + seed/manage tenants via CLI |

**Phase 1 complete when:** You can demo a Telegram bot to a client where their approved contacts chat with a Claude-powered assistant that has custom instructions for their business, with full conversation history and usage tracking.

---

## 11. Future Phases (Quick Notes)

**Phase 2 (Month 2-3):**
- WhatsApp via Baileys or WhatsApp Business API
- React admin dashboard (reuse DockCtrl patterns)
- Tenant self-service onboarding
- Billing integration (Stripe or local payment gateway)

**Phase 3 (Month 3-4):**
- ERPNext MCP integration (leverage your existing MCP server work)
- Custom skills per tenant (inventory lookup, invoice queries, appointment booking)
- Web chat widget clients can embed on their site

**Phase 4 (Month 4-6):**
- Audit logs and compliance features
- Data residency controls (important for African markets)
- White-label option (client's own branding on the bot)
- Analytics dashboard (conversation insights, common questions, resolution rates)

---

## 12. Architectural Refinements & Feedback

Based on the initial review, the following refinements should be incorporated into the architecture:

1. **Message Queuing vs. Processing**: Instead of processing LLM calls synchronously in the Fastify webhook (which can timeout if Claude takes 10+ seconds), Pulse will instantly acknowledge the webhook (HTTP 200) and push the incoming message to a background queue (e.g., BullMQ backed by Redis) for async processing.
2. **Pre-Flight Cost Checks**: The Agent Runtime must check if a tenant has exceeded their billing or message limits *before* dispatching the API call to Anthropic, rather than just tallying the cost afterward to prevent runaway usage.
3. **Concurrency Control**: To handle rapid-fire messages from a user (e.g., 4 messages in 2 seconds on Telegram), Pulse will implement a locking mechanism or debounce strategy per conversation so the LLM doesn't process the same partial conversation state in parallel.
4. **Session & Memory Management (OpenClaw Style)**: Pulse will adopt OpenClaw's proven approach to memory. This means storing actual conversation threads in the database (PostgreSQL/Drizzle) and feeding a sliding window of the most recent messages (e.g., last 20 messages or a strict token limit) directly into the LLM context. This provides "seamless memory" within a thread without complex vector database overhead.

---

*Document prepared for Ludovic @ Runstate Ltd — February 2026*
*Use the Claude Code prompt in Section 8 to initialize the project*
