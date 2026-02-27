# OpenClaw vs Pulse AI — Full Gap Analysis & Implementation Roadmap

> Generated: 2026-02-25
> Purpose: Identify all missing features in Pulse AI compared to OpenClaw reference implementation and plan the roadmap to feature parity.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [What Pulse Already Has](#what-pulse-already-has)
3. [Gap Analysis — What Pulse is Missing](#gap-analysis--what-pulse-is-missing)
   - [1. Plugin/Extension System](#1-pluginextension-system-critical)
   - [2. Multi-Agent Routing & Orchestration](#2-multi-agent-routing--orchestration-critical)
   - [3. Messaging Channels](#3-messaging-channels-high)
   - [4. Memory & Vector Search](#4-memory--vector-search-high)
   - [5. Browser Automation](#5-browser-automation-high)
   - [6. Business API Integrations](#6-business-api-integrations-high)
   - [7. Cron / Scheduled Jobs & Webhooks](#7-cron--scheduled-jobs--webhooks-medium-high)
   - [8. Exec Safety & Approval System](#8-exec-safety--approval-system-medium)
   - [9. Canvas / Visual Workspace](#9-canvas--visual-workspace-medium)
   - [10. Voice & Media](#10-voice--media-lower)
   - [11. Gateway Control Plane & Companion Apps](#11-gateway-control-plane--companion-apps-medium)
4. [OpenClaw Architecture Reference](#openclaw-architecture-reference)
5. [Pulse Current Architecture Reference](#pulse-current-architecture-reference)
6. [Implementation Roadmap](#implementation-roadmap)
7. [File-by-File Mapping](#file-by-file-mapping)

---

## Executive Summary

Pulse AI is a **production-ready multi-tenant AI gateway** with solid foundations: multi-provider LLM support, Telegram channel, tool system, Docker sandbox, MCP, credit billing, and an OpenAI-compatible API.

OpenClaw is a **mature, enterprise-grade personal AI assistant** with 50+ extensions, 30+ messaging channels, browser automation, vector memory, a full plugin SDK, multi-agent orchestration, voice/media, companion apps, and cron scheduling.

**The single biggest gap is the Plugin/Extension System.** OpenClaw doesn't have pre-built ERPNext or QuickBooks connectors — it has a **plugin architecture** that makes building them trivial. Once Pulse has a plugin system + Python runtime + generic REST tool, connecting to any business system becomes a matter of writing a plugin, not modifying core code.

### Priority Matrix

| Priority | Gap | Impact |
|----------|-----|--------|
| CRITICAL | Plugin/Extension System | Enables all integrations without core changes |
| CRITICAL | Multi-Agent Orchestration | Agents can delegate, coordinate, specialize |
| HIGH | Business API Integrations | ERPNext, QuickBooks, Pastel, Xero, Generic REST |
| HIGH | Memory & Vector Search | Agents learn and remember across sessions |
| HIGH | More Messaging Channels | WhatsApp, Slack, Discord, WebChat |
| HIGH | Browser Automation | Scrape, fill forms, interact with web apps |
| MEDIUM-HIGH | Cron / Scheduled Jobs | "Sync QuickBooks every night at 2am" |
| MEDIUM | Exec Safety & Approvals | Prevent dangerous command execution |
| MEDIUM | Canvas / Visual Workspace | Rich visual agent output |
| MEDIUM | Gateway Control Plane | WebSocket, device pairing, companion apps |
| LOWER | Voice & Media | TTS, STT, talk mode, camera |

---

## What Pulse Already Has

These features exist in both systems (Pulse's current strengths):

| Feature | Pulse Implementation | Notes |
|---------|---------------------|-------|
| Multi-provider LLM | Anthropic, OpenAI, Google, OpenRouter | 3-tier key hierarchy (BYOK → admin → env) |
| Telegram channel | Full DM + group, webhooks, polling | Pairing codes, allowlists, chunking |
| Tool registry | `pulse/src/agent/tools/registry.ts` | calculator, time, exec, process, sandbox |
| Code execution | exec + Docker sandbox | Background sessions, 10s auto-background |
| MCP support | Client (SSE) + Server (JSON-RPC) | Per-agent MCP bindings |
| Multi-tenant isolation | Database-scoped by tenantId | Encrypted BYOK keys |
| Background job queue | BullMQ + Redis | 5 concurrent, rate-limited, retry |
| Workspace/personality | File-based (SOUL.md, IDENTITY.md) | Revision tracking |
| Credit/billing system | Token metering, ledger transactions | Per-model pricing |
| OpenAI-compatible API | `/v1/chat/completions` | Streaming, agent routing |
| Hot-reloadable config | Runtime config patching | No restart required |
| Agent profiles | Per-tenant, per-agent model + prompt | Heartbeat support |
| Structured logging | Pino (JSON in prod, pretty in dev) | Context injection |

---

## Gap Analysis — What Pulse is Missing

### 1. Plugin/Extension System (CRITICAL)

**Why it matters:** This is the foundation that makes OpenClaw extensible. Without it, every integration is hardcoded in core. With it, anyone can write an ERPNext, QuickBooks, or Pastel connector as a drop-in plugin.

**OpenClaw implementation:**

| Component | File | Size | Purpose |
|-----------|------|------|---------|
| Plugin SDK | `src/plugin-sdk/index.ts` | 17KB | Typed API for plugin authors |
| Plugin Discovery | `src/plugins/discovery.ts` | 16KB | Find plugins (npm + local) |
| Plugin Loader | `src/plugins/loader.ts` | 21KB | Load, initialize, manage lifecycle |
| Plugin Installation | `src/plugins/install.ts` | 14KB | Install/enable/disable plugins |
| Plugin Hooks | `src/plugins/hooks.ts` | 22KB | Lifecycle events, model overrides, agent start |
| HTTP Route Registry | `src/plugins/http-registry.ts` | — | Plugins register HTTP endpoints |
| Webhook Targets | `plugin-sdk/webhook-targets.ts` | — | Plugins receive inbound webhooks |
| Config Schema | `plugins/config-schema.ts` | — | Per-plugin config validation (Zod) |
| Plugin Commands | `plugins/commands.ts` | — | Plugin CLI commands |

**OpenClaw has 50+ extensions:**

*Channels:* bluebubbles, discord, feishu, googlechat, imessage, irc, line, mattermost, matrix, msteams, signal, slack, telegram, whatsapp, zalo, twitch, nostr, nextcloud-talk, synology-chat, tlon

*Tools:* llm-task, voice-call, video-frames, tmux, openai-whisper, openai-image-gen, nano-pdf, 1password

*Auth:* google-gemini-cli-auth, minimax-portal-auth, qwen-portal-auth, copilot-proxy

*Memory:* memory-core, memory-lancedb

*Other:* lobster (CLI UI), canvas, skill-creator, diagnostics-otel, open-prose, mcporter (MCP bridge)

**What Pulse needs to build:**

```
pulse/src/plugins/
├── sdk/
│   ├── index.ts              # Plugin SDK exports
│   ├── types.ts              # PluginManifest, PluginContext, PluginHooks
│   ├── tool-builder.ts       # Helper to define tools
│   ├── route-builder.ts      # Helper to register HTTP routes
│   └── webhook-builder.ts    # Helper for inbound webhooks
├── discovery.ts              # Find plugins (npm @pulse-ai/ prefix + local)
├── loader.ts                 # Load & initialize plugins
├── install.ts                # Install/enable/disable via CLI or API
├── hooks.ts                  # Lifecycle hooks (onLoad, onAgentStart, onMessage, etc.)
├── http-registry.ts          # Plugin HTTP route mounting
├── config-schema.ts          # Per-plugin config validation
└── manager.ts                # Plugin lifecycle manager
```

**Plugin manifest example:**
```typescript
// pulse-plugin-erpnext/index.ts
import { definePlugin } from '@pulse-ai/plugin-sdk';

export default definePlugin({
  name: 'erpnext',
  version: '1.0.0',
  description: 'ERPNext ERP integration',
  config: z.object({
    baseUrl: z.string().url(),
    apiKey: z.string(),
    apiSecret: z.string(),
  }),
  tools: [
    {
      name: 'erpnext_list_doctypes',
      description: 'List records from any ERPNext doctype',
      parameters: { doctype: 'string', filters: 'object?' },
      execute: async (params, ctx) => { /* ... */ },
    },
    // ... more tools
  ],
  hooks: {
    onLoad: async (ctx) => { /* validate connection */ },
  },
});
```

---

### 2. Multi-Agent Routing & Orchestration (CRITICAL)

**Why it matters:** Enables specialized agents that coordinate — a "Python coder" agent can talk to an "ERPNext" agent and an "accounting" agent to complete complex business workflows.

**OpenClaw implementation:**

| Component | File | Purpose |
|-----------|------|---------|
| Agent Scope | `src/agents/agent-scope.ts` | Isolates agent context and tools |
| Agent Config | `commands/agent/agents.config.ts` | Per-agent settings management |
| Agent Paths | `src/agents/agent-paths.ts` | Directory structure per agent |
| Agent Creation | `agents.commands.add.ts` (11KB) | Create isolated agent workspace |
| Agent Identity | `agents.identity.test.ts` | Names, profiles, avatars |
| Agent Delivery | `src/cron/isolated-agent.ts` | Multi-agent message routing |
| Agent Providers | `agents.providers.ts` | Per-agent model configuration |
| Auth Profiles | `src/agents/auth-profiles.ts` | Per-agent credential rotation |
| Process Registry | `bash-process-registry.ts` | Track processes per agent |
| Agent Runtime | `commands/agent/agent.ts` (22KB) | Main agent execution loop |

**What Pulse needs to build:**

```
pulse/src/agent/orchestration/
├── agent-router.ts           # Route messages to correct agent
├── agent-delegation.ts       # Agent A can invoke Agent B as a tool
├── agent-scope.ts            # Isolate context, tools, memory per agent
├── agent-rpc.ts              # Inter-agent RPC communication
├── agent-registry.ts         # Runtime registry of active agents
├── agent-creation.ts         # API to create/configure agents
└── agent-lifecycle.ts        # Start, stop, restart agents
```

**Key capabilities needed:**

1. **Agent delegation** — Agent A's tool list includes `delegate_to_agent(agentId, task)` which sends a message to Agent B and returns its response
2. **Agent specialization** — Each agent has its own tools, system prompt, model, and memory
3. **Agent routing** — Inbound messages route to the correct agent based on channel, contact, or intent
4. **Agent coordination** — A supervisor agent can orchestrate multiple worker agents
5. **Agent isolation** — Each agent has its own process registry, sandbox config, and credentials

---

### 3. Messaging Channels (HIGH)

**Why it matters:** Business users are on WhatsApp, Slack, Teams — not just Telegram.

**OpenClaw channels (built-in + extensions):**

| Channel | OpenClaw | Pulse | Priority |
|---------|----------|-------|----------|
| Telegram | Built-in | **Have** | — |
| WhatsApp (Baileys) | Built-in | **Missing** | P1 |
| Slack (Bolt) | Built-in | **Missing** | P1 |
| Discord (discord.js) | Built-in | **Missing** | P2 |
| WebChat (browser widget) | Built-in | **Missing** | P1 |
| Google Chat | Built-in | **Missing** | P2 |
| Microsoft Teams | Extension | **Missing** | P2 |
| Signal | Extension | **Missing** | P3 |
| Matrix | Extension | **Missing** | P3 |
| IRC | Extension | **Missing** | P3 |
| LINE | Extension | **Missing** | P3 |
| Feishu / Lark | Extension | **Missing** | P3 |
| Mattermost | Extension | **Missing** | P3 |
| iMessage (BlueBubbles) | Extension | **Missing** | P3 |
| Twitch | Extension | **Missing** | P3 |
| Zalo | Extension | **Missing** | P3 |
| Nostr | Extension | **Missing** | P3 |
| Nextcloud Talk | Extension | **Missing** | P3 |
| Synology Chat | Extension | **Missing** | P3 |

**What Pulse needs to build (P1 channels):**

```
pulse/src/channels/
├── channel.interface.ts       # Already exists
├── types.ts                   # Already exists
├── telegram/                  # Already exists
├── whatsapp/
│   ├── adapter.ts             # Baileys WhatsApp Web client
│   ├── session-store.ts       # QR code auth session persistence
│   └── chunking.ts            # WhatsApp message limits
├── slack/
│   ├── adapter.ts             # Bolt SDK integration
│   ├── events.ts              # Event subscriptions
│   └── blocks.ts              # Slack Block Kit formatting
├── webchat/
│   ├── adapter.ts             # WebSocket-based chat
│   ├── widget.ts              # Embeddable JS widget
│   └── static/                # Chat UI assets
└── discord/
    ├── adapter.ts             # discord.js bot
    ├── commands.ts            # Slash commands
    └── formatting.ts          # Discord markdown
```

---

### 4. Memory & Vector Search (HIGH)

**Why it matters:** Without memory, agents forget everything between conversations. They can't learn user preferences, recall past decisions, or build up knowledge about a business.

**OpenClaw implementation:**

| Component | File | Purpose |
|-----------|------|---------|
| Memory Core | `extensions/memory-core/` | Base memory plugin |
| Memory LanceDB | `extensions/memory-lancedb/` | Vector DB with embeddings |
| Hybrid Search | `src/memory/hybrid.ts` | Keyword + semantic combined |
| Query Expansion | `src/memory/query-expansion.ts` | Better retrieval via expanded queries |
| Temporal Decay | `src/memory/temporal-decay.ts` | Recent memories weighted higher |
| MMR | `src/memory/mmr.ts` | Diversity in search results |
| Embedding Models | OpenAI, Mistral, Voyage, Gemini | Multiple embedding providers |

**What Pulse needs to build:**

```
pulse/src/memory/
├── memory-service.ts          # Main memory service (store, search, delete)
├── embedding.ts               # Embedding pipeline (OpenAI ada-002 / local)
├── vector-store.ts            # pgvector integration (reuse existing Postgres)
├── hybrid-search.ts           # Keyword (tsvector) + semantic (pgvector) combined
├── temporal-decay.ts          # Recency weighting
├── mmr.ts                     # Maximal Marginal Relevance for diversity
├── memory-tools.ts            # Agent tools: remember, recall, forget
└── types.ts                   # MemoryEntry, SearchResult, EmbeddingConfig
```

**Recommended approach:** Use **pgvector** extension for Postgres (Pulse already uses Postgres) rather than adding LanceDB. This avoids a new dependency.

**New DB tables:**
```sql
CREATE TABLE memory_entries (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  agent_id UUID REFERENCES agent_profiles(id),
  content TEXT NOT NULL,
  embedding vector(1536),          -- pgvector
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,
  importance FLOAT DEFAULT 0.5
);

CREATE INDEX ON memory_entries USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON memory_entries USING gin (to_tsvector('english', content));
```

**Agent tools to add:**
- `memory_store(content, metadata?)` — Save a memory
- `memory_search(query, limit?)` — Semantic + keyword search
- `memory_forget(memoryId)` — Delete a memory
- `memory_list(filter?)` — Browse stored memories

---

### 5. Browser Automation (HIGH)

**Why it matters:** Many business systems (ERPNext, Pastel, legacy ERPs) have web UIs. Browser automation lets agents interact with them directly — fill forms, extract data, navigate dashboards.

**OpenClaw implementation (692KB+ of browser code):**

| Component | Files | Purpose |
|-----------|-------|---------|
| Playwright Integration | `src/browser/pw-*.ts` | Full browser control |
| CDP Integration | `src/browser/cdp-*.ts` | Chrome DevTools Protocol |
| Browser Actions | navigate, click, type, screenshot | User interaction |
| Profile Management | `src/browser/profile-*.ts` | Cookie/session persistence |
| Extension Relay | `src/browser/extension-relay.ts` | Browser ↔ agent bridge |
| Downloads | `src/browser/downloads.ts` | File download handling |
| Storage | `src/browser/storage.ts` | Cookie/localStorage access |

**What Pulse needs to build:**

```
pulse/src/browser/
├── browser-service.ts         # Playwright browser pool management
├── browser-tool.ts            # Agent tool interface
├── actions/
│   ├── navigate.ts            # Go to URL
│   ├── click.ts               # Click element (CSS/XPath selector)
│   ├── type.ts                # Type into input field
│   ├── screenshot.ts          # Take page screenshot
│   ├── evaluate.ts            # Run JS in page context
│   ├── extract.ts             # Extract text/table data from page
│   └── wait.ts                # Wait for element/condition
├── profile.ts                 # Persistent browser sessions (cookies)
└── pool.ts                    # Browser instance pool (reuse, cleanup)
```

**Agent tools to add:**
- `browser_navigate(url)` — Open URL
- `browser_click(selector)` — Click element
- `browser_type(selector, text)` — Type into field
- `browser_screenshot()` — Take screenshot
- `browser_extract(selector)` — Extract text from elements
- `browser_evaluate(script)` — Run JavaScript

---

### 6. Business API Integrations (HIGH)

**Why it matters:** This is your main ask — connecting to ERPNext, Pastel, QuickBooks, etc.

> **Note:** OpenClaw doesn't have pre-built business integrations either. It relies on its plugin system + code execution to build them. The real solution is the plugin system (Gap #1) + these specific integration plugins.

**What Pulse needs to build (as plugins):**

#### 6a. Generic REST API Tool (Foundation)

```
pulse/src/plugins/builtin/rest-api/
├── index.ts                   # Plugin definition
├── rest-tool.ts               # Generic HTTP request tool
├── auth/
│   ├── api-key.ts             # API key auth (header/query)
│   ├── oauth2.ts              # OAuth 2.0 flow (authorization code, client credentials)
│   ├── basic.ts               # HTTP Basic auth
│   └── bearer.ts              # Bearer token
└── types.ts                   # RequestConfig, AuthConfig
```

**Agent tool:**
- `http_request(method, url, headers?, body?, auth?)` — Make any HTTP request with configurable auth

#### 6b. ERPNext Integration Plugin

```
pulse/src/plugins/builtin/erpnext/
├── index.ts                   # Plugin manifest
├── client.ts                  # ERPNext API client (frappe REST)
├── tools/
│   ├── list-records.ts        # GET /api/resource/{doctype}
│   ├── get-record.ts          # GET /api/resource/{doctype}/{name}
│   ├── create-record.ts       # POST /api/resource/{doctype}
│   ├── update-record.ts       # PUT /api/resource/{doctype}/{name}
│   ├── delete-record.ts       # DELETE /api/resource/{doctype}/{name}
│   ├── run-report.ts          # GET /api/method/frappe.client.get_report_data
│   ├── search.ts              # GET /api/method/frappe.client.get_list (with filters)
│   └── call-method.ts         # POST /api/method/{dotted.path}
└── config.ts                  # ERPNext connection config (url, api_key, api_secret)
```

**Agent tools:**
- `erpnext_list(doctype, filters?, fields?, limit?)` — List records
- `erpnext_get(doctype, name)` — Get single record
- `erpnext_create(doctype, data)` — Create record
- `erpnext_update(doctype, name, data)` — Update record
- `erpnext_delete(doctype, name)` — Delete record
- `erpnext_report(report_name, filters?)` — Run a report
- `erpnext_search(doctype, query)` — Full-text search
- `erpnext_call(method, args?)` — Call any server method

#### 6c. QuickBooks Integration Plugin

```
pulse/src/plugins/builtin/quickbooks/
├── index.ts                   # Plugin manifest
├── client.ts                  # QuickBooks Online API client
├── oauth.ts                   # Intuit OAuth 2.0 flow
├── tools/
│   ├── list-invoices.ts       # Query invoices
│   ├── create-invoice.ts      # Create invoice
│   ├── list-customers.ts      # Query customers
│   ├── create-customer.ts     # Create customer
│   ├── list-payments.ts       # Query payments
│   ├── record-payment.ts      # Record payment
│   ├── get-profit-loss.ts     # P&L report
│   ├── get-balance-sheet.ts   # Balance sheet
│   └── query.ts               # Custom QBO query (SQL-like)
└── config.ts                  # QBO connection (clientId, clientSecret, realmId)
```

#### 6d. Pastel Integration Plugin

```
pulse/src/plugins/builtin/pastel/
├── index.ts                   # Plugin manifest
├── client.ts                  # Pastel Partner API client
├── tools/
│   ├── list-customers.ts      # Customer master
│   ├── list-suppliers.ts      # Supplier master
│   ├── list-invoices.ts       # Sales invoices
│   ├── create-invoice.ts      # Create invoice
│   ├── list-inventory.ts      # Stock items
│   ├── get-trial-balance.ts   # Trial balance report
│   ├── get-aged-debtors.ts    # Aged debtors report
│   └── journal-entry.ts       # Post journal entry
└── config.ts                  # Pastel connection (endpoint, credentials)
```

#### 6e. Python Runtime Tool

```
pulse/src/plugins/builtin/python-runtime/
├── index.ts                   # Plugin manifest
├── executor.ts                # Python script execution (Docker-based)
├── package-manager.ts         # pip install within sandbox
├── tools/
│   ├── run-python.ts          # Execute Python code
│   ├── install-package.ts     # pip install in sandbox
│   └── run-script.ts          # Execute .py file from workspace
└── Dockerfile.python          # Python sandbox image (3.12 + common libs)
```

**Agent tools:**
- `python_run(code, packages?)` — Execute Python code with optional pip packages
- `python_install(packages)` — Install pip packages in sandbox
- `python_script(path, args?)` — Execute a .py file from agent workspace

#### 6f. SQL Database Tool

```
pulse/src/plugins/builtin/sql-query/
├── index.ts                   # Plugin manifest
├── client.ts                  # Database connection manager
├── tools/
│   ├── query.ts               # Execute SELECT query
│   ├── execute.ts             # Execute INSERT/UPDATE/DELETE
│   ├── schema.ts              # Describe tables and columns
│   └── export.ts              # Export query results as CSV
└── config.ts                  # Connection strings (postgres, mysql, sqlite)
```

---

### 7. Cron / Scheduled Jobs & Webhooks (MEDIUM-HIGH)

**Why it matters:** Business automation requires scheduling — "sync invoices from QuickBooks every hour", "send daily sales report from ERPNext", "check inventory levels at 6am".

**OpenClaw implementation:**

| Component | File | Purpose |
|-----------|------|---------|
| Scheduler | `src/cron/schedule.ts` | Croner-based cron expressions |
| Delivery | `src/cron/service.delivery-plan.test.ts` | Multi-agent job routing |
| Isolated Exec | `src/cron/isolated-agent.ts` | Run agent in isolation |
| Webhooks | `src/cron/webhook-url.ts` | Inbound webhook triggers |
| Gmail Pub/Sub | `src/cron/gmail-pubsub.ts` | Email-triggered automation |

**What Pulse needs to build:**

```
pulse/src/cron/
├── scheduler.ts               # Cron expression scheduler (node-cron or croner)
├── job-runner.ts              # Execute scheduled agent tasks
├── job-store.ts               # DB persistence for scheduled jobs
├── webhook-trigger.ts         # Generic inbound webhook → agent message
├── email-trigger.ts           # Email (IMAP/Gmail) → agent message
└── types.ts                   # JobDefinition, Schedule, TriggerConfig
```

**New DB table:**
```sql
CREATE TABLE scheduled_jobs (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  agent_id UUID REFERENCES agent_profiles(id),
  name VARCHAR(255) NOT NULL,
  cron_expression VARCHAR(100),          -- e.g. "0 2 * * *" (2am daily)
  one_shot_at TIMESTAMPTZ,               -- or one-time execution
  message TEXT NOT NULL,                  -- message to send to agent
  channel VARCHAR(50) DEFAULT 'internal',
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Agent tools to add:**
- `schedule_job(name, cron, message)` — Create a recurring job
- `schedule_once(name, at, message)` — Create a one-shot job
- `list_jobs()` — List scheduled jobs
- `cancel_job(jobId)` — Cancel a scheduled job

---

### 8. Exec Safety & Approval System (MEDIUM)

**Why it matters:** When agents can run shell commands and Python scripts, safety is critical — especially in business environments where `rm -rf /` or `DROP TABLE` can be catastrophic.

**OpenClaw implementation:**

| Component | File | Purpose |
|-----------|------|---------|
| Exec Approvals | `src/infra/exec-approvals*.ts` | Comprehensive approval system |
| Safe Binary Allowlist | `exec-safe-bin-policy.ts` | Whitelist of safe commands |
| Runtime Policy | `exec-safe-bin-runtime-policy.ts` | Dynamic runtime checks |
| Obfuscation Detection | `exec-obfuscation-detect.ts` | Detect encoded/hidden commands |
| Trust System | `exec-safe-bin-trust.ts` | Graduated trust levels |
| Command Resolution | `exec-command-resolution.ts` | Resolve aliases/paths |
| Wrapper Resolution | `exec-wrapper-resolution.ts` | Handle wrapper scripts |

**What Pulse needs to build:**

```
pulse/src/agent/tools/safety/
├── exec-policy.ts             # Allow/deny rules for commands
├── safe-commands.ts           # Whitelist of safe binaries (ls, cat, grep, python, etc.)
├── dangerous-patterns.ts      # Blacklist patterns (rm -rf, DROP TABLE, etc.)
├── approval-service.ts        # Request human approval for risky commands
├── obfuscation-detect.ts      # Detect base64, hex, eval tricks
└── audit-log.ts               # Log all exec actions for review
```

**Safety levels:**
1. **Auto-approve** — Safe commands from whitelist (ls, cat, python script.py)
2. **Auto-deny** — Dangerous patterns (rm -rf /, DROP TABLE, curl | bash)
3. **Human approval** — Everything else (requires user confirmation via channel)

---

### 9. Canvas / Visual Workspace (MEDIUM)

**Why it matters:** Rich visual output — dashboards, charts, forms, interactive UIs pushed by the agent to the user.

**OpenClaw implementation:**

| Component | File | Purpose |
|-----------|------|---------|
| Canvas Host | `src/canvas-host/` | Agent-driven visual workspace |
| A2UI Actions | push, reset, eval | Agent controls the UI |

**What Pulse needs to build:**

```
pulse/src/canvas/
├── canvas-service.ts          # Canvas state management
├── canvas-tool.ts             # Agent tool to push UI updates
├── renderers/
│   ├── html.ts                # Raw HTML rendering
│   ├── chart.ts               # Chart.js / D3 rendering
│   ├── table.ts               # Data table rendering
│   └── form.ts                # Interactive form rendering
└── transport.ts               # WebSocket push to client
```

---

### 10. Voice & Media (LOWER)

**Why it matters:** Voice interaction, audio messages, TTS responses for accessibility and mobile use.

**OpenClaw extensions:**

| Component | Extension | Purpose |
|-----------|-----------|---------|
| ElevenLabs TTS | `extensions/elevenlabs/` | High-quality text-to-speech |
| Deepgram STT | `extensions/deepgram/` | Speech-to-text |
| OpenAI Whisper | `extensions/openai-whisper/` | Alternative STT |
| Sherpa ONNX | `extensions/sherpa-onnx/` | Local TTS option |
| Voice Call | `extensions/voice-call/` | Phone calls |
| Video Frames | `extensions/video-frames/` | Video processing |

**What Pulse needs to build (as plugins):**

```
pulse/src/plugins/builtin/voice/
├── tts/
│   ├── elevenlabs.ts          # ElevenLabs TTS
│   ├── openai-tts.ts          # OpenAI TTS
│   └── local-tts.ts           # Sherpa ONNX local
├── stt/
│   ├── whisper.ts             # OpenAI Whisper
│   ├── deepgram.ts            # Deepgram
│   └── local-stt.ts           # Local STT
└── tools/
    ├── speak.ts               # Convert text to audio
    └── transcribe.ts          # Convert audio to text
```

---

### 11. Gateway Control Plane & Companion Apps (MEDIUM)

**Why it matters:** Remote management, monitoring, device pairing, and native mobile/desktop experience.

**OpenClaw implementation:**

| Component | Location | Purpose |
|-----------|----------|---------|
| WebSocket Control Plane | `src/gateway/` | Binary + text protocol |
| Device Pairing | Bonjour + codes | Mobile/desktop connect |
| macOS App | `apps/macos/` | Menu bar, voice, canvas |
| iOS App | `apps/ios/` | Mobile agent access |
| Android App | `apps/android/` | Mobile agent access |
| WebChat UI | Built-in | Browser-based chat |
| Tailscale Auth | Gateway auth | Zero-config networking |

**What Pulse needs to build:**

```
pulse/src/gateway/
├── ws/                        # Already partially exists
│   ├── control-plane.ts       # Agent management commands
│   ├── streaming.ts           # Real-time message streaming
│   └── protocol.ts            # Binary/text protocol spec
├── webchat/
│   ├── server.ts              # Serve chat widget
│   └── static/                # Chat UI (React/vanilla)
└── discovery/
    ├── bonjour.ts             # mDNS service advertisement
    └── pairing.ts             # Device pairing flow
```

---

## OpenClaw Architecture Reference

```
openclaw_ref/
├── src/
│   ├── entry.ts                    # CLI entry point
│   ├── index.ts                    # Main exports (CLI + SDK)
│   ├── agents/                     # Multi-agent system
│   │   ├── agent-scope.ts          # Agent isolation
│   │   ├── agent-paths.ts          # Per-agent directories
│   │   ├── auth-profiles.ts        # Credential rotation
│   │   └── bash-process-registry.ts # Process tracking
│   ├── browser/                    # Browser automation (692KB)
│   │   ├── pw-*.ts                 # Playwright actions
│   │   ├── cdp-*.ts                # Chrome DevTools Protocol
│   │   └── profile-*.ts            # Session persistence
│   ├── canvas-host/                # Visual workspace
│   ├── channels/                   # Messaging channels
│   ├── commands/
│   │   ├── agent/                  # Agent management (22KB runtime)
│   │   ├── gateway/                # Gateway commands
│   │   └── send/                   # Message sending
│   ├── config/                     # Configuration system
│   ├── cron/                       # Scheduling & automation
│   │   ├── schedule.ts             # Cron expressions
│   │   ├── isolated-agent.ts       # Multi-agent delivery
│   │   └── webhook-url.ts          # Webhook triggers
│   ├── gateway/                    # WebSocket server
│   │   └── auth-rate-limit.ts      # Security
│   ├── infra/                      # Infrastructure
│   │   ├── exec-approvals*.ts      # Execution safety
│   │   ├── exec-safe-bin-*.ts      # Command whitelists
│   │   └── exec-obfuscation-*.ts   # Obfuscation detection
│   ├── memory/                     # Vector memory
│   │   ├── hybrid.ts              # Keyword + semantic
│   │   ├── query-expansion.ts     # Better retrieval
│   │   ├── temporal-decay.ts      # Recency weighting
│   │   └── mmr.ts                 # Result diversity
│   ├── plugins/                    # Plugin system
│   │   ├── discovery.ts           # Find plugins
│   │   ├── loader.ts             # Load plugins
│   │   ├── install.ts            # Install/manage
│   │   ├── hooks.ts              # Lifecycle events
│   │   └── http-registry.ts      # Route mounting
│   ├── plugin-sdk/                 # SDK for plugin authors
│   │   ├── index.ts              # 17KB API surface
│   │   └── webhook-targets.ts    # Inbound webhooks
│   └── sessions/                   # Conversation state
├── extensions/                     # 50+ plugins
│   ├── whatsapp/                  # WhatsApp (Baileys)
│   ├── discord/                   # Discord (discord.js)
│   ├── slack/                     # Slack (Bolt)
│   ├── msteams/                   # Microsoft Teams
│   ├── memory-lancedb/           # Vector memory
│   ├── elevenlabs/               # TTS
│   ├── deepgram/                 # STT
│   ├── mcporter/                 # MCP bridge
│   └── [40+ more...]
├── apps/                          # Companion apps
│   ├── macos/                    # Menu bar app
│   ├── ios/                      # iOS app
│   └── android/                  # Android app
├── skills/                        # Bundled skills
├── docs/                          # Documentation
├── Dockerfile                     # Container image
└── docker-compose.yml             # Multi-service setup
```

---

## Pulse Current Architecture Reference

```
pulse/
├── src/
│   ├── index.ts                    # Entry point (Fastify + Telegram + Queue)
│   ├── config.ts                   # Environment configuration
│   ├── agent/
│   │   ├── runtime.ts              # Main agent execution loop
│   │   ├── providers/
│   │   │   ├── anthropic.ts        # Claude API client
│   │   │   ├── openai.ts           # OpenAI API client
│   │   │   ├── provider-manager.ts # Provider routing + fallback
│   │   │   ├── model-registry.ts   # Model catalog + pricing
│   │   │   ├── provider-key-service.ts # BYOK key management
│   │   │   └── cli-backend*.ts     # CLI backend integration
│   │   ├── tools/
│   │   │   ├── registry.ts         # Tool loading + registration
│   │   │   ├── mcp-client.ts       # MCP SSE client
│   │   │   ├── tool-policy.ts      # Allow/deny lists
│   │   │   ├── built-in/
│   │   │   │   ├── exec.ts         # Shell execution
│   │   │   │   ├── process.ts      # Background sessions
│   │   │   │   ├── sandbox.ts      # Docker sandbox
│   │   │   │   └── sandbox-config.ts # Sandbox settings
│   │   │   └── background-session-manager.ts
│   │   └── workspace/
│   │       └── workspace-service.ts # File-based personality
│   ├── channels/
│   │   ├── channel.interface.ts    # Channel adapter interface
│   │   ├── types.ts                # InboundMessage, OutboundMessage
│   │   ├── telegram/
│   │   │   ├── adapter.ts          # Telegram bot (grammY)
│   │   │   ├── chunking.ts         # Message splitting
│   │   │   ├── group-helpers.ts    # Group mention/reply detection
│   │   │   └── pairing.ts         # DM pairing codes
│   │   └── formatting/             # Markdown conversion
│   ├── gateway/
│   │   ├── server.ts               # Fastify server setup
│   │   ├── routes/
│   │   │   ├── webhooks.ts         # Telegram webhooks
│   │   │   ├── mcp.ts             # MCP JSON-RPC endpoint
│   │   │   ├── config-api.ts      # Hot-reloadable config
│   │   │   ├── openai-compat.ts   # /v1/chat/completions
│   │   │   └── open-responses.ts  # Real-time streaming
│   │   ├── middleware/
│   │   │   ├── api-token-auth.ts  # Token validation
│   │   │   └── trusted-proxy.ts   # X-Forwarded headers
│   │   ├── ws/                    # WebSocket (gated)
│   │   └── oauth-callback-proxy.ts # OAuth flow
│   ├── queue/
│   │   └── worker.ts              # BullMQ message processor
│   ├── storage/
│   │   ├── schema.ts              # Drizzle ORM schema
│   │   └── migrations/            # SQL migrations
│   ├── infra/                     # Infrastructure utilities
│   └── cli/                       # CLI interface
├── test/
│   └── unit/                      # Unit tests
├── package.json                   # Dependencies
├── Dockerfile                     # Container image
└── tsconfig.json                  # TypeScript config
```

---

## Implementation Roadmap

### Phase 1 — Plugin System + Business Integrations (Weeks 1–3)

**Goal:** Enable extensible integrations without modifying core code.

| Step | Task | Effort |
|------|------|--------|
| 1.1 | Build Plugin SDK (types, tool builder, route builder) | 3 days |
| 1.2 | Build Plugin Loader (npm + local directory discovery) | 2 days |
| 1.3 | Build Plugin Lifecycle Manager (hooks, init, teardown) | 2 days |
| 1.4 | Build Generic REST API tool plugin | 2 days |
| 1.5 | Build ERPNext integration plugin | 3 days |
| 1.6 | Build QuickBooks integration plugin | 3 days |
| 1.7 | Build Pastel integration plugin | 2 days |
| 1.8 | Build Python Runtime tool plugin | 3 days |
| 1.9 | Build SQL Query tool plugin | 2 days |
| 1.10 | Dashboard UI for plugin management | 2 days |

### Phase 2 — Multi-Agent Orchestration (Weeks 3–5)

**Goal:** Specialized agents that coordinate and delegate tasks.

| Step | Task | Effort |
|------|------|--------|
| 2.1 | Agent router (message → correct agent) | 2 days |
| 2.2 | Agent delegation tool (agent calls another agent) | 3 days |
| 2.3 | Agent scope isolation (tools, memory, creds per agent) | 2 days |
| 2.4 | Agent registry (runtime tracking of active agents) | 1 day |
| 2.5 | Agent creation/management API | 2 days |
| 2.6 | Supervisor agent pattern (orchestrate workers) | 3 days |

### Phase 3 — Memory System (Weeks 5–6)

**Goal:** Agents learn and remember across sessions.

| Step | Task | Effort |
|------|------|--------|
| 3.1 | Enable pgvector extension in Postgres | 0.5 day |
| 3.2 | Memory service (store, search, delete) | 2 days |
| 3.3 | Embedding pipeline (OpenAI ada-002) | 1 day |
| 3.4 | Hybrid search (tsvector + pgvector) | 2 days |
| 3.5 | Agent memory tools (remember, recall, forget) | 1 day |
| 3.6 | Temporal decay + MMR | 1 day |

### Phase 4 — More Channels (Weeks 6–8)

**Goal:** Reach users on WhatsApp, Slack, Discord, and web.

| Step | Task | Effort |
|------|------|--------|
| 4.1 | WhatsApp adapter (Baileys) | 3 days |
| 4.2 | Slack adapter (Bolt SDK) | 3 days |
| 4.3 | Discord adapter (discord.js) | 2 days |
| 4.4 | WebChat widget (WebSocket + React) | 3 days |
| 4.5 | Dashboard UI for channel management | 2 days |

### Phase 5 — Browser + Scheduling (Weeks 8–10)

**Goal:** Automate web interactions and schedule recurring tasks.

| Step | Task | Effort |
|------|------|--------|
| 5.1 | Playwright browser tool | 3 days |
| 5.2 | Browser session persistence | 1 day |
| 5.3 | Cron scheduler (croner) | 2 days |
| 5.4 | Job store (DB persistence) | 1 day |
| 5.5 | Webhook triggers (generic inbound) | 2 days |
| 5.6 | Agent scheduling tools | 1 day |




---

## File-by-File Mapping

What needs to be created in Pulse to match OpenClaw:

| New Pulse File | Matches OpenClaw | Priority |
|----------------|-----------------|----------|
| `pulse/src/plugins/sdk/index.ts` | `src/plugin-sdk/index.ts` | CRITICAL |
| `pulse/src/plugins/sdk/types.ts` | `src/plugin-sdk/` types | CRITICAL |
| `pulse/src/plugins/discovery.ts` | `src/plugins/discovery.ts` | CRITICAL |
| `pulse/src/plugins/loader.ts` | `src/plugins/loader.ts` | CRITICAL |
| `pulse/src/plugins/hooks.ts` | `src/plugins/hooks.ts` | CRITICAL |
| `pulse/src/plugins/manager.ts` | — | CRITICAL |
| `pulse/src/plugins/builtin/rest-api/` | — (new) | HIGH |
| `pulse/src/plugins/builtin/erpnext/` | — (new) | HIGH |
| `pulse/src/plugins/builtin/quickbooks/` | — (new) | HIGH |
| `pulse/src/plugins/builtin/pastel/` | — (new) | HIGH |
| `pulse/src/plugins/builtin/python-runtime/` | — (new) | HIGH |
| `pulse/src/plugins/builtin/sql-query/` | — (new) | HIGH |
| `pulse/src/agent/orchestration/agent-router.ts` | `src/agents/agent-scope.ts` | CRITICAL |
| `pulse/src/agent/orchestration/agent-delegation.ts` | `src/cron/isolated-agent.ts` | CRITICAL |
| `pulse/src/agent/orchestration/agent-rpc.ts` | Pi runtime RPC | CRITICAL |
| `pulse/src/memory/memory-service.ts` | `extensions/memory-core/` | HIGH |
| `pulse/src/memory/vector-store.ts` | `extensions/memory-lancedb/` | HIGH |
| `pulse/src/memory/embedding.ts` | memory embeddings | HIGH |
| `pulse/src/memory/hybrid-search.ts` | `src/memory/hybrid.ts` | HIGH |
| `pulse/src/channels/whatsapp/adapter.ts` | `extensions/whatsapp/` | HIGH |
| `pulse/src/channels/slack/adapter.ts` | `extensions/slack/` | HIGH |
| `pulse/src/channels/discord/adapter.ts` | `extensions/discord/` | HIGH |
| `pulse/src/channels/webchat/` | built-in WebChat | HIGH |
| `pulse/src/browser/browser-service.ts` | `src/browser/` | HIGH |
| `pulse/src/browser/browser-tool.ts` | browser tools | HIGH |
| `pulse/src/cron/scheduler.ts` | `src/cron/schedule.ts` | MEDIUM-HIGH |
| `pulse/src/cron/job-runner.ts` | `src/cron/` | MEDIUM-HIGH |
| `pulse/src/agent/tools/safety/exec-policy.ts` | `exec-approvals*.ts` | MEDIUM |
| `pulse/src/agent/tools/safety/safe-commands.ts` | `exec-safe-bin-policy.ts` | MEDIUM |
| `pulse/src/canvas/canvas-service.ts` | `src/canvas-host/` | MEDIUM |
| `pulse/src/plugins/builtin/voice/` | `extensions/elevenlabs/` etc. | LOWER |

---

> **Next step:** Start with Phase 1 — Build the Plugin SDK and the first business integration plugins (ERPNext, QuickBooks, Pastel, Generic REST, Python Runtime).
