# Pulse AI — Comprehensive How-To Guide

A complete reference for setting up, configuring, and using every feature of the Pulse AI multi-tenant gateway platform.

**Version:** 1.0.0
**Last Updated:** March 2026

---

## Table of Contents

- [Part 1 — Getting Started](#part-1--getting-started)
- [Part 2 — Admin Panel Guide](#part-2--admin-panel-guide)
- [Part 3 — Tenant Dashboard Guide](#part-3--tenant-dashboard-guide)
- [Part 4 — API Reference](#part-4--api-reference)
- [Part 5 — Agent Tools Reference](#part-5--agent-tools-reference)
- [Part 6 — Feature Deep-Dives](#part-6--feature-deep-dives)
- [Part 7 — Troubleshooting](#part-7--troubleshooting)

---

# Part 1 — Getting Started

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Node.js | 20+ | Runtime for API gateway and dashboard |
| Docker + Docker Compose | 24+ / v2 | PostgreSQL, Redis, Python sandbox |
| PostgreSQL | 15 with pgvector 0.8+ | Provided via Docker Compose |
| Redis | 7+ | Provided via Docker Compose |
| Anthropic API Key | — | Required for Claude models |
| OpenAI API Key | — | Optional; required for memory embeddings |

## Environment Variables Reference

Create a `.env` file in the `pulse/` directory. Here is the complete list:

| Variable | Type | Default | Required | Description |
|---|---|---|---|---|
| `NODE_ENV` | `development` \| `production` \| `test` | `development` | No | Runtime environment |
| `PORT` | Number | `3000` | No | API gateway listen port |
| `LOG_LEVEL` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` | `info` | No | Pino log level |
| `DATABASE_URL` | URL | — | **Yes** | PostgreSQL connection string |
| `REDIS_URL` | URL | — | No (required in production) | Redis for rate limiting + BullMQ queue |
| `ANTHROPIC_API_KEY` | String | — | No | Anthropic Claude API key (optional if tenants provide their own keys) |
| `OPENAI_API_KEY` | String | — | No | OpenAI key for memory embeddings (`text-embedding-3-small`) |
| `ENCRYPTION_KEY` | String (64 hex chars) | — | **Yes** | 32-byte AES-256-GCM key for encrypting credentials and provider keys |
| `WEBHOOK_BASE_URL` | URL | — | No | Public URL for webhooks (e.g., `https://pulse.runstate.mu`) |
| `DASHBOARD_URL` | URL | — | No | Dashboard URL (e.g., `http://localhost:3001`) |
| `TELEGRAM_WEBHOOK_SECRET` | String | — | No | Validates Telegram webhook `X-Telegram-Bot-Api-Secret-Token` header |
| `WORKSPACE_BASE_DIR` | Path | `../data/workspaces` | No | Root directory for agent workspace files |
| `GATEWAY_WS_ENABLED` | Boolean | `false` | No | Enable WebSocket control plane |
| `TRUSTED_PROXY_IPS` | String | — | No | Comma-separated CIDR list for trusted proxies |
| `TRUSTED_PROXY_USER_HEADER` | String | `X-Forwarded-User` | No | Header name for proxied user identity |
| `BONJOUR_ENABLED` | Boolean | `false` | No | Enable mDNS/Bonjour LAN discovery |
| `PYTHON_SANDBOX_IMAGE` | String | `pulse-python-sandbox:latest` | No | Docker image name for Python sandbox |

### Example `.env` file

```env
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgres://pulseadmin:secure_pulse_db_password@localhost:5432/pulse

# Redis
REDIS_URL=redis://localhost:6379

# Providers
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
OPENAI_API_KEY=sk-proj-your-key-here

# Security — generate with: openssl rand -hex 32
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Logging
LOG_LEVEL=debug

# Webhooks (production only)
# WEBHOOK_BASE_URL=https://pulse.runstate.mu
# TELEGRAM_WEBHOOK_SECRET=your-secret-token-here
```

## Docker Compose Setup

The `docker-compose.yml` at the project root defines five services:

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `pgvector/pgvector:0.8.0-pg15` | 5432 | PostgreSQL with pgvector extension |
| `redis` | `redis:7-alpine` | 6379 | Rate limiting + BullMQ message queue |
| `pulse-gateway` | `./pulse/Dockerfile` | 8080 | Fastify API gateway (production) |
| `pulse-dashboard` | `./dashboard/Dockerfile` | 3000 | Next.js admin dashboard (production) |
| `python-sandbox` | `./pulse/docker/python-sandbox/Dockerfile` | — | Build-only; produces `pulse-python-sandbox:latest` |

### Start infrastructure services

```bash
# Start PostgreSQL and Redis
docker compose up -d postgres redis

# Build the Python sandbox image (required for python_execute tool)
docker compose build python-sandbox
```

### Production deployment

```bash
# Build and start all services
docker compose up -d --build

# Gateway runs on port 8080, Dashboard on port 3000
```

## Development Setup — `start-dev.sh`

The `start-dev.sh` script automates the full development workflow:

```bash
chmod +x start-dev.sh
./start-dev.sh
```

What it does:
1. Loads environment from `pulse/.env`
2. Kills any processes on API port (default 3000) and dashboard port (default 3001)
3. Cleans Next.js build cache (`dashboard/.next`)
4. Kills zombie `next dev` and `tsx watch` processes
5. Starts PostgreSQL and Redis via Docker Compose
6. Type-checks the Pulse API (`npx tsc --noEmit`)
7. Production-builds the Dashboard (`next build`)
8. Launches both servers concurrently:
   - **API Gateway** on `http://localhost:3000` (blue label)
   - **Dashboard** on `http://localhost:3001` (green label)

To change ports, set `API_PORT` and `DASHBOARD_PORT` in your `.env`.

## Database Migrations

Pulse uses Drizzle ORM for migrations. There are 17 migration files covering all features.

```bash
cd pulse

# Generate migration from schema changes
npm run db:generate

# Apply pending migrations
npm run db:migrate
```

Migration files are in `pulse/src/storage/migrations/` and are applied in order:

| Migration | Tables Created |
|---|---|
| `0000_hard_nick_fury.sql` | `tenants`, `conversations`, `messages`, `channel_connections`, `allowlists`, `tenant_skills`, `usage_records` |
| `0001_serious_skin.sql` | `tenant_balances`, `ledger_transactions` |
| `0005_add_mcp_tables.sql` | `agent_profiles`, `mcp_servers`, `agent_profile_mcp_bindings` |
| `0006_user_management.sql` | Updates to `users` table |
| `0007_agent_workspaces_and_providers.sql` | `workspace_revisions`, `tenant_provider_keys` |
| `0008_telegram_groups_and_pairing.sql` | `pairing_codes` |
| `0009_feature_configs.sql` | `api_tokens` + agent profile config columns |
| `0010_exec_safety.sql` | `exec_audit_log`, `exec_policy_rules` |
| `0011_credential_vault.sql` | `credentials` |
| `0012_agent_scripts.sql` | `agent_scripts` |
| `0013_memory_system.sql` | `memory_entries` (with pgvector `vector(1536)`) |
| `0014_scheduled_jobs.sql` | `scheduled_jobs`, `job_runs` |
| `0015_agent_orchestration.sql` | `agent_delegations` + `delegation_config` column |
| `0016_plugins.sql` | `installed_plugins`, `tenant_plugin_configs` |

## Creating Your First Admin User

After running migrations, create an admin user through the dashboard's database or via the admin API. The first admin user has role `ADMIN` and can access the admin panel at `/admin`.

1. Navigate to `http://localhost:3001/admin/login`
2. Log in with the admin credentials created during setup
3. You're now in the **Platform Admin Panel**

## Creating Your First Tenant

1. In the admin panel, go to **Tenant Management** (`/admin/tenants`)
2. Click **Create Tenant**
3. Fill in:
   - **Name**: Your organization name (e.g., "Acme Corp")
   - **Slug**: URL-friendly identifier (e.g., "acme") — must be unique
4. The tenant is created with an initial credit balance
5. Next, go to **User Management** (`/admin/users`) and create a user with role `TENANT` assigned to this tenant
6. The tenant user can now log in at `http://localhost:3001/login`

---

# Part 2 — Admin Panel Guide

The admin panel is accessed at `/admin` and provides platform-wide management capabilities. The sidebar has six main sections.

## 2.1 Platform Overview (`/admin`)

The landing page shows four real-time metrics:

| Metric | Source |
|---|---|
| Total Workspaces | Count of `tenants` table |
| Platform Users | Count of `users` table |
| Credits in Platform | Sum of all `tenant_balances` |
| Active Channels | Count of `channel_connections` |

Below the metrics:
- **System Health** — Status indicators for API Gateway (Fastify), Database (PostgreSQL), AI Provider (Anthropic), and Message Queue (Redis)
- **Quick Actions** — Links to Manage Tenants and Global Settings

## 2.2 Tenant Management (`/admin/tenants`)

A searchable table of all tenants with:

| Column | Description |
|---|---|
| Tenant Name | Links to tenant detail page |
| Slug | URL identifier (monospace) |
| Credit Balance | Red if negative |
| Features | Badges for OAuth, Groups, Pairing; pending approval count |
| Status | Active / Inactive |
| Actions | Dropdown menu for edit, credit adjustment, etc. |

### Creating a tenant

1. Click **Create Tenant**
2. Enter a name and slug
3. Submit — the tenant is created with `active` status
4. Navigate to the tenant detail page to configure further

## 2.3 Tenant Detail (`/admin/tenants/{tenantId}`)

Shows tenant info with quick stats (channel count, pending approvals, OAuth client ID). The **Tenant Settings** section allows editing:

- Tenant name
- Tenant configuration (JSON)
- Credit balance adjustments

Links to sub-pages:
- **Approvals & Allowlists** — manage Telegram pairing approvals
- **Credentials** — view (not edit) tenant's credential vault

### Approvals & Allowlists (`/admin/tenants/{tenantId}/approvals`)

Three sections:
1. **Pending Pairings** — Users who submitted a Telegram pairing code. Approve or reject each.
2. **Approved Users** — Individual Telegram contacts on the allowlist. Can revoke access.
3. **Approved Groups** — Telegram groups on the allowlist. Can revoke.

### Tenant Credentials (`/admin/tenants/{tenantId}/credentials`)

Read-only view of the tenant's stored API credentials. Shows names, types, descriptions, and update dates. Admin can delete credentials as a security override. **Values are never shown** — they are encrypted at rest with AES-256-GCM.

## 2.4 User Management (`/admin/users`)

Manage all platform users. Table columns:

| Column | Description |
|---|---|
| Name | User display name |
| Email | Login email (unique) |
| Role | `ADMIN` or `TENANT` |
| Tenant | Associated tenant (for TENANT role) |
| Must Change Password | Flag for temporary passwords |
| Last Login | Timestamp |

### Creating a user

1. Click **Create User**
2. Fill in name, email, role, and tenant assignment
3. Set a temporary password (user will be prompted to change it on first login via the onboarding flow)

### Password reset

Select a user and use the reset password action. This sets `mustChangePassword = true` and the user is redirected to the onboarding flow on next login.

## 2.5 Conversations (`/admin/conversations`)

Cross-tenant view of the 200 most recent conversations. Each row shows:
- Contact name and channel type
- Tenant name
- Message count
- Last activity timestamp

Click a conversation to view the full message thread including user messages, assistant responses, and tool call results.

## 2.6 Usage Analytics (`/admin/usage`)

Platform-wide analytics with three views:

1. **Platform Totals** — Aggregate input tokens, output tokens, cost (USD), credits used, and total requests
2. **Top 10 Tenants by Cost** — Ranked by total API cost, with tenant names
3. **Model Distribution** — Usage broken down by LLM model (e.g., Claude 3.7 Sonnet, GPT-4o)

## 2.7 Global Settings (`/admin/settings`)

The settings hub with four inline sections and links to sub-pages.

### AI Model Providers

Configure platform-wide API keys:
- **Anthropic API Key** — Required for Claude models. Shows hash-based presence indicator.
- **OpenAI API Key** — Optional; used for memory embeddings and OpenAI model fallback.

### Default Sandbox Configuration

- **Sandbox Mode**: `off` (disabled), `non-main` (only non-default agents), `all` (all agents)
- **Docker Image**: Name of the sandbox Docker image (default: `pulse-python-sandbox:latest`)

### Pulse System Services

- **Hot-Reload**: Enable live config reloading from database
- **LAN Discovery / Bonjour**: Enable mDNS discovery for local network
- **Trusted Proxy CIDRs**: Comma-separated list for reverse proxy setups
- **CLI Backends**: Integration mode for external CLI tools

### Database & Security

- **PostgreSQL Connection**: Read-only display of `DATABASE_URL` with test and migration buttons
- **Encryption Key**: Shows validity status of the `ENCRYPTION_KEY`

### Sub-page links

The settings page links to four dedicated configuration pages:
- Exec Safety
- Sandbox Configuration
- Memory System
- Scheduling
- Plugins (via admin nav)

## 2.8 Exec Safety (`/admin/settings/exec-safety`)

Controls which shell commands agents are allowed to execute.

### Global Policy

| Setting | Options | Default |
|---|---|---|
| Enable Exec Safety | On / Off | On |
| Default Policy | `allow_all` / `allowlist_only` / `deny_all` | `allow_all` |
| Global Deny Patterns | One pattern per line (glob or regex) | — |
| Global Allow Patterns | One pattern per line | — |

### Policy Rules

Create custom allow/deny rules with:
- **Type**: `allow` or `deny`
- **Pattern**: Glob or regex pattern (e.g., `rm *`, `docker exec *`)
- **Description**: Human-readable explanation
- **Priority**: Higher number = evaluated first

### Audit Log

Platform-wide log of every command execution decision:
- Timestamp
- Decision: `allowed` / `denied` / `sandboxed` (color-coded badges)
- Command (truncated at 100 characters)
- Reason for the decision

## 2.9 Memory Configuration (`/admin/settings/memory`)

Global settings for the agent memory system.

| Setting | Default | Description |
|---|---|---|
| Enable Memory System | On | When off, agents cannot store or recall memories |
| Embedding Model | `text-embedding-3-small` | Options: `text-embedding-3-small` (1536d) or `text-embedding-3-large` (3072d) |
| Max Memories per Agent | 10,000 | Hard limit on stored entries per agent |
| Temporal Decay Half-Life | 30 days | After N days, a memory's relevance score halves |
| MMR Lambda | 0.7 | 1.0 = pure relevance, 0.0 = maximum diversity |

> **Note:** The embedding model requires `OPENAI_API_KEY` to be set. Without it, the system falls back to full-text search only (no vector similarity).

## 2.10 Sandbox Configuration (`/admin/settings/sandbox`)

Global defaults for the Python sandbox Docker environment.

| Setting | Default | Description |
|---|---|---|
| Python Docker Image | `pulse-python-sandbox:latest` | Image name for `python_execute` tool |
| Memory Limit | `256m` | Options: 128m / 256m / 512m / 1g |
| CPU Limit | `1.0` | Options: 0.5 / 1.0 / 2.0 |
| Default Timeout | 60 seconds | Per-execution time limit |
| Max Timeout | 300 seconds | Upper bound agents can request |
| Network Access | Enabled | Allow outbound API calls from sandbox |

## 2.11 Scheduling (`/admin/settings/scheduling`)

Global settings for the cron/scheduling system.

| Setting | Default | Description |
|---|---|---|
| Enable Scheduling | On | Master switch for the scheduler |
| Max Jobs per Tenant | 50 | Limit scheduled jobs per tenant |
| Max Jobs per Agent | 10 | Limit scheduled jobs per agent |
| Min Interval | 300 seconds (5 min) | Minimum allowed interval between job runs |

Below the settings: a read-only table of the 50 most recent scheduled jobs across all tenants, showing name, agent, schedule, timezone, status, and last run.

## 2.12 Plugin Management (`/admin/plugins`)

Install and manage platform plugins.

### Installing a plugin

1. Click **Install Plugin**
2. Fill in:
   - **Name**: Plugin identifier
   - **Source**: `local` (filesystem path) or `builtin`
   - **Version**: Semantic version
   - **Source Path**: Path to the plugin's entry file (for local plugins)
3. Submit — the plugin is loaded and registered

### Managing plugins

- Toggle **Enable/Disable** per plugin
- View plugin configuration (JSON)
- **Uninstall** to permanently remove

---

# Part 3 — Tenant Dashboard Guide

The tenant dashboard is accessed at `/dashboard` after logging in at `/login`. It provides workspace-level management for agents, conversations, integrations, and settings.

The left sidebar has six navigation items:
- Overview
- Agent Profiles
- Conversations
- MCP Servers
- Usage & Billing
- Settings

## 3.1 Workspace Overview (`/dashboard`)

Three information cards:

1. **Available Credits** — Current balance with health indicator (Healthy / Low / Empty), estimated input tokens remaining, and "Top Up Balance" link
2. **Active Integrations** — Shows connected Telegram bot (with green/red status dot) and CLI client count
3. **Quick Actions** — Links to Manage Agents, Workspace Settings, and View Billing

## 3.2 Onboarding (`/dashboard/onboarding`)

First-time setup wizard for new tenant users. Displayed in a clean layout with no sidebar.

**Step 1 — Set Password**
- User must create a permanent password to replace the temporary one issued by the admin
- Password confirmation required

**Step 2 — Connect Telegram** (optional)
- Paste a Telegram Bot API token (obtained from @BotFather)
- Can be skipped and configured later in Settings

**Done**
- Success confirmation
- User is signed out and must log in again with the new password

## 3.3 Agent Profiles (`/dashboard/agents`)

Card grid of all agent profiles for this tenant. Each card shows:
- Agent name and truncated ID
- Model badge (e.g., "Claude Sonnet 4")
- "Sandbox" badge if Docker sandbox is enabled
- System prompt preview (3 lines, truncated)
- Provider name and workspace status indicator

### Creating an agent

1. Click **Create Agent**
2. Enter a name for the agent
3. Submit — the agent is created with default settings
4. Click the agent card to enter the workspace editor

## 3.4 Agent Workspace (`/dashboard/agents/{id}`)

The main agent configuration interface. Manages four workspace markdown files and agent settings.

### Workspace Files

| File | Purpose |
|---|---|
| `SOUL.md` | Core system prompt — defines the agent's personality, capabilities, and behavior rules |
| `IDENTITY.md` | Identity context — who the agent is, who it works for, business context |
| `MEMORY.md` | Static memory / reference data — persisted facts the agent should always know |
| `HEARTBEAT.md` | Heartbeat instructions — what the agent does on scheduled heartbeat triggers |

Each file has:
- A text editor for content
- Revision count showing version history
- Save button (creates a new revision)

### Agent Settings

| Setting | Description |
|---|---|
| Model | Select which LLM model this agent uses (from active providers) |
| Docker Sandbox | Enable/disable Docker sandbox for this agent |
| Tool Policy | Allow/deny specific tools (JSON configuration) |
| Sandbox Config | Per-agent sandbox overrides (mode, image, limits) |
| Heartbeat Config | Schedule for automatic heartbeat messages |
| Skills | Enable/disable built-in skills and add custom skills (see 3.10) |
| Email | Configure per-agent email (SMTP/IMAP) or use tenant-level email (see 3.11) |

## 3.5 Agent Safety (`/dashboard/agents/{id}/safety`)

Per-agent exec safety overrides.

### Policy Rules

Add custom allow/deny rules that override the global policy for this specific agent:
- **Rule Type**: `allow` or `deny`
- **Pattern**: Glob or regex pattern
- **Description**: Explanation
- **Priority**: Evaluation order (higher first)

### Agent Audit Log

Table of execution decisions for this agent:
- Timestamp
- Decision badge (allowed / denied / sandboxed)
- Command preview
- Reason

## 3.6 Agent Memory (`/dashboard/agents/{id}/memory`)

View and manage the agent's long-term memory.

### Stats Row
- Total memories
- Facts count
- Preferences count
- Decisions count

### Memory Table

| Column | Description |
|---|---|
| Content | Memory text (full display) |
| Category | `general`, `fact`, `preference`, `decision`, `task`, `relationship` |
| Importance | 0.0 to 1.0 score |
| Use Count | How many times this memory has been retrieved |
| Created | Timestamp |
| Actions | Delete button |

### Bulk Operations
- Filter by category
- Bulk delete all memories matching a category

## 3.7 Agent Delegation (`/dashboard/agents/{id}/delegation`)

Configure multi-agent orchestration for this agent.

### Delegation Settings

| Setting | Default | Description |
|---|---|---|
| Can Delegate | Off | Allow this agent to send tasks to other agents |
| Accepts Delegation | Off | Allow other agents to send tasks to this agent |
| Specialization | — | Description shown to other agents (e.g., "ERPNext specialist") |
| Max Delegation Depth | 3 | Prevent infinite delegation chains (1–10) |
| Allowed Targets | All | Comma-separated agent IDs, or empty for all |

### Other Agents
Shows all other agents in the tenant with their delegation capabilities.

### Delegation History
Table of delegation events:
- Direction (Outgoing / Incoming)
- Task description
- Status (completed / failed / pending)
- Start time
- Result summary

## 3.8 Agent Schedules (`/dashboard/agents/{id}/schedules`)

Create and manage cron jobs, interval tasks, and one-time scheduled runs.

### Creating a Schedule

| Field | Description |
|---|---|
| Job Name | Descriptive name (e.g., "Daily Invoice Sync") |
| Schedule Type | `cron` / `interval` / `once` |
| Cron Expression | Standard cron (e.g., `0 8 * * 1-5` = weekdays at 8am) |
| Interval (seconds) | Minimum 300 (5 minutes) |
| Run At | ISO datetime for one-time jobs |
| Timezone | Select from 10 options: UTC, Africa/Johannesburg, America/New_York, America/Chicago, America/Denver, America/Los_Angeles, Europe/London, Europe/Paris, Asia/Tokyo, Australia/Sydney |
| Message | The instruction sent to the agent when the job fires |

### Common Cron Expressions

| Expression | Meaning |
|---|---|
| `0 2 * * *` | Every day at 2:00 AM |
| `0 8 * * 1-5` | Weekdays at 8:00 AM |
| `0 */6 * * *` | Every 6 hours |
| `30 9 1 * *` | 1st of each month at 9:30 AM |
| `0 0 * * 0` | Every Sunday at midnight |

### Scheduled Jobs Table

| Column | Description |
|---|---|
| Name | Job name |
| Schedule | Cron expression or interval description |
| Timezone | Selected timezone |
| Status | Enabled / Disabled (toggle) |
| Last Run | Timestamp of last execution |
| Webhook Token | Unique token for external triggers (copyable) |

Each job generates a **webhook URL** that external systems can call to trigger the job immediately:
```
POST http://your-gateway/webhooks/cron/{webhookToken}
```

## 3.9 Agent Scripts (`/dashboard/agents/{id}/scripts`)

Read-only view of Python scripts saved by the agent using the `script_save` tool.

Each script card shows:
- Filename (monospace)
- Description
- Language
- Use count and last used date
- Code content (read-only, syntax highlighted)
- Delete button

Scripts are created by agents during conversations using the `script_save` tool and can be reloaded by the agent with `script_load`.

## 3.10 Agent Skills (`/dashboard/agents/{id}` — Skills tab)

Configure which built-in skills are enabled for this agent and add custom skills.

### Built-in Skills

Skills are detailed behavioral guides that teach the agent how to use its tools effectively. They are grouped by category:

| Category | Skills |
|---|---|
| Core | `memory`, `scheduling`, `workspace`, `delegation`, `email` |
| Productivity | `scripts`, `python`, `formatting` |
| Meta | `skill-creator` |

Each skill has a toggle switch. Skills inherit from admin defaults (shown with a gray background). Per-agent overrides take priority over admin defaults.

- **Toggle on/off** — Enable or disable a skill for this agent
- **Reset** — Clear agent overrides and revert to admin defaults

### Custom Skills

Add agent-specific skills beyond the built-in set:

1. Click **Add Custom Skill**
2. Enter a name (e.g., `erp-lookup`)
3. Enter a description (shown in the skill list)
4. Write the skill body in markdown — this is injected into the agent's system prompt
5. Click **Save**

Custom skills are stored in the agent's `skillConfig` JSONB column.

### How Skills Work at Runtime

1. Admin sets global default skills in **Admin Settings → Skills**
2. Per-agent overrides (enable/disable) are applied on top
3. The skill loader reads `.skill.md` files and formats them for prompt injection
4. Skills appear in the system prompt under a `## Skills` section between tooling and tool call style

## 3.11 Agent Email (`/dashboard/agents/{id}` — Email tab)

Configure per-agent email sending and reading capabilities.

### Mode Selection

- **Use Company Email** — Uses the tenant-level email config (set in Settings → Email)
- **Use Custom Email** — Configure agent-specific SMTP/IMAP credentials

### SMTP Configuration (Sending)

| Field | Description |
|---|---|
| Host | SMTP server (e.g., `smtp.gmail.com`) |
| Port | SMTP port (587 for TLS, 465 for SSL) |
| Username | SMTP auth username |
| Password | SMTP auth password (encrypted at rest) |
| TLS | Enable TLS (recommended) |
| From Address | Sender email address |

### IMAP Configuration (Reading — Optional)

| Field | Description |
|---|---|
| Host | IMAP server (e.g., `imap.gmail.com`) |
| Port | IMAP port (993 for TLS) |
| Username | IMAP auth username |
| Password | IMAP auth password (encrypted at rest) |
| TLS | Enable TLS (recommended) |

### Email Resolution Chain

When the agent uses `email_send` or `email_read` tools:
1. Agent-level config is checked first (if SMTP host is set)
2. Falls back to tenant-level config (from Settings → Email)
3. Returns an error if neither is configured

### Related Tools

| Tool | Description |
|---|---|
| `email_send` | Send an email (to, subject, body, optional HTML) |
| `email_read` | Read recent emails from inbox (configurable count) |
| `email_list` | List email folders/labels |

## 3.12 Agent Knowledge (`/dashboard/agents/{id}/knowledge`)

Manage API reference templates that are injected into the agent's system prompt.

### Available Templates

| Template | Description |
|---|---|
| ERPNext API | Frappe REST API reference — endpoints, doctypes, auth, Python patterns |
| QuickBooks API | QuickBooks Online accounting API reference |
| Pastel API | Pastel Partner API reference |
| Xero API | Xero Accounting API reference |
| Python Patterns | Common Python patterns for API work |
| REST API General | General REST API patterns and best practices |

### Adding a Template

1. Click a template from the grid to add it
2. The template content is copied to the agent's workspace as `KNOWLEDGE_{NAME}.md`
3. Active templates appear in green
4. Edit the content to customize for your specific setup

### Custom Knowledge

1. Enter a custom name (e.g., `CUSTOM_INTERNAL_API`)
2. Click **Add Custom**
3. A blank `KNOWLEDGE_CUSTOM_INTERNAL_API.md` file is created
4. Fill in your API documentation

All knowledge files are automatically included in the agent's system prompt under a `## API Knowledge` section.

## 3.13 Orchestration Overview (`/dashboard/agents/orchestration`)

Cross-agent view of multi-agent delegation activity.

### Stats Row
- Total Agents
- Recent Delegations
- Completed
- Failed

### Agent Capabilities Table

All agents with their delegation config:
- Can Delegate (yes/no)
- Accepts Delegation (yes/no)
- Specialization description
- Max Depth
- Link to configure

### Recent Delegations Table

| Column | Description |
|---|---|
| Source Agent | Agent that initiated the delegation |
| Target Agent | Agent that received the task |
| Task | Task description (truncated) |
| Status | completed / failed / pending (badge) |
| Started | Timestamp |

## 3.14 Conversations (`/dashboard/conversations`)

View all conversations for this tenant, ordered by most recent activity.

Each conversation shows:
- Contact name
- Channel type (Telegram, API, etc.)
- Message count
- Last activity

Click to view the full message thread with user messages, assistant responses, and tool call results (including metadata like token usage).

## 3.15 MCP Servers (`/dashboard/mcp`)

Connect external API services via the Model Context Protocol (MCP).

### Adding an MCP Server

1. Click **Add MCP Server**
2. Enter:
   - **Name**: Descriptive name
   - **URL**: The MCP server endpoint
   - **Auth Headers**: Authentication headers (JSON)
3. Submit — the server is registered and can be bound to agents

### Binding Agents to MCP Servers

1. Select an MCP server
2. Choose which agents should have access to its tools
3. Bound agents can use the MCP server's tools during conversations

MCP exposes three built-in tools to connected clients:
- `send_message` — Send a message to an agent
- `list_conversations` — List tenant conversations
- `get_conversation` — Get conversation messages

## 3.16 Settings (`/dashboard/settings`)

The settings page has seven tabs:

### Account Tab

- View profile info (name, email)
- Change password form

### Integrations Tab

Status grid showing connected services:
- **Telegram** — Bot connection status (connected/disconnected)
- **OAuth / CLI** — Third-party CLI client count
- **WhatsApp** — Coming soon indicator

Telegram bot token entry form for initial setup or token updates.

### Telegram Tab

Configure Telegram bot behavior:

| Setting | Options | Description |
|---|---|---|
| DM Policy | `open` / `pairing` / `approval_list` | How to handle direct messages from new contacts |
| Group Policy | `open` / `allowlist` / `disabled` | How to handle group messages |
| Require Mention | On / Off | In groups, only respond when @mentioned |

**Pairing Management:**
- View pending pairing requests (approve / reject)
- View approved users (revoke access)
- View approved groups (revoke access)
- Add groups to allowlist manually

### Providers Tab

Manage per-tenant LLM provider API keys (Bring Your Own Key):

| Provider | Auth Methods |
|---|---|
| Anthropic | API Key |
| OpenAI | API Key |

For each provider:
- Add API key (encrypted at rest)
- Validate key (tests against provider API)
- Remove key
- Status indicator (active / inactive)

When a tenant has their own provider key, it takes priority over the global platform key.

### API & Developer Tab

- **OAuth Clients**: View registered OAuth clients (for third-party CLI tools)
- **Third-Party CLI Access**: Enable/disable OAuth for tools like Claude Code
- **API Base URL**: Display the gateway URL for API integrations
- **API Tokens**: Generate and manage tokens for the OpenAI-compatible API
  - Token name
  - Scopes: `chat` (for `/v1/chat/completions`) and `responses` (for `/v1/responses`)
  - Expiry date
  - Revoke tokens

### Email Tab

Configure tenant-wide email credentials used by all agents (unless overridden per-agent).

**SMTP (Sending):**
- Host, port, username, password, TLS toggle, from address

**IMAP (Reading — Optional):**
- Host, port, username, password, TLS toggle

**Test Connection** — Tests TCP connectivity to the SMTP server (5-second timeout).

Passwords are encrypted at rest with AES-256-GCM. When editing, existing passwords are preserved unless you enter a new value.

### Billing Tab

- Current credit balance display
- Link to top up
- Ledger overview showing recent debit/credit transactions

## 3.17 Credentials (`/dashboard/settings/credentials`)

Secure credential vault for storing API keys and secrets that agents can use as environment variables.

### Adding a Credential

1. Click **Add Credential**
2. Fill in:
   - **Name**: Environment variable name, auto-uppercased with underscores (e.g., `ERPNEXT_API_KEY`)
   - **Type**: `api_key` / `bearer` / `basic` / `oauth2`
   - **Value**: The secret value (password field; encrypted AES-256-GCM, never shown again after save)
   - **Description**: What this credential is for
   - **Base URL**: Optional — injected as `{NAME}_URL` environment variable
   - **Agent Scope**: `All Agents` or a specific agent

### How Agents Use Credentials

1. Agent calls the `credential_list` tool to see available credential names
2. Agent writes Python code using `os.environ["CREDENTIAL_NAME"]` to access values
3. When `python_execute` runs, credentials are injected as Docker environment variables

### Credential Table

| Column | Description |
|---|---|
| Name | Environment variable name |
| Type | Credential type badge |
| Description | Purpose of the credential |
| Scope | "All Agents" or specific agent name |
| Updated | Last modification date |
| Actions | Delete button |

## 3.18 Plugins (`/dashboard/settings/plugins`)

Enable or disable admin-installed plugins for this tenant workspace.

| Column | Description |
|---|---|
| Plugin Name | Plugin identifier |
| Version | Semantic version |
| Source | `local` / `builtin` |
| Your Status | Enabled / Disabled |
| Toggle | Enable/disable for this tenant |

Plugins are installed by platform admins. Tenants can only toggle them on/off for their workspace.

## 3.19 Usage (`/dashboard/usage`)

Tenant-specific usage analytics.

### Model Breakdown
Table showing per-model usage:
- Model name
- Input tokens
- Output tokens
- Cost (USD)
- Credits used
- Request count

### Recent Usage Records
Last 50 usage entries with conversation ID, model, tokens, cost, and timestamp.

### Ledger Transactions
Last 50 credit ledger entries showing top-ups and deductions.

### Summary
- Total tokens consumed
- Total cost
- Total credits used
- Current balance

---

# Part 4 — API Reference

The Pulse API gateway runs on the configured port (default 3000 in dev, 8080 in Docker). All endpoints are served by Fastify.

## 4.1 Health Check

```bash
GET /health
```

Returns the gateway health status.

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 3600.123
}
```

## 4.2 OpenAI-Compatible Chat Completions

```bash
POST /v1/chat/completions
```

Fully compatible with the OpenAI Chat Completions API. Supports streaming and non-streaming modes.

**Authentication:** Bearer token (API token with `chat` scope)

**Headers:**
```
Authorization: Bearer <api-token>
Content-Type: application/json
```

### Non-streaming example

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "pulse:agent-id-here",
    "messages": [
      {"role": "user", "content": "What are my unpaid invoices?"}
    ]
  }'
```

Response:
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1709000000,
  "model": "pulse:agent-id",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Here are your unpaid invoices..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 200,
    "total_tokens": 350
  }
}
```

### Streaming example

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "pulse:agent-id-here",
    "messages": [
      {"role": "user", "content": "Hello"}
    ],
    "stream": true
  }'
```

### Model selection

Use `model: "pulse:<agentId>"` to target a specific agent. If omitted, the tenant's default agent is used.

## 4.3 Models List

```bash
GET /v1/models
```

Lists the tenant's agent profiles as OpenAI-compatible model objects.

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer your-api-token"
```

Response:
```json
{
  "object": "list",
  "data": [
    {
      "id": "pulse:abc12345",
      "object": "model",
      "created": 1709000000,
      "owned_by": "pulse"
    }
  ]
}
```

## 4.4 OpenAI Responses API

```bash
POST /v1/responses
```

OpenAI Responses API format with streaming SSE.

**Authentication:** Bearer token with `responses` scope

```bash
curl -X POST http://localhost:3000/v1/responses \
  -H "Authorization: Bearer your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "pulse:agent-id",
    "input": "What is the weather?"
  }'
```

SSE stream events:
- `response.created` — Initial response object
- `response.output_text.delta` — Incremental text chunks
- `response.completed` — Final response with full text and usage

## 4.5 MCP Protocol

Model Context Protocol endpoints for machine-to-machine integration.

**Authentication:** Bearer token

### Main JSON-RPC endpoint

```bash
POST /mcp
```

Creates or reuses a session. Exposes three tools: `send_message`, `list_conversations`, `get_conversation`.

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

### SSE stream

```bash
GET /mcp
```

Server-sent events for server-initiated notifications. Requires `mcp-session-id` header.

### Terminate session

```bash
DELETE /mcp
```

## 4.6 Telegram Webhooks

```bash
POST /webhooks/telegram/:tenantSlug
```

Receives updates from the Telegram Bot API. The `tenantSlug` identifies which tenant's bot is receiving the message.

**Validation:** If `TELEGRAM_WEBHOOK_SECRET` is set, the `X-Telegram-Bot-Api-Secret-Token` header must match.

### Debug info

```bash
GET /webhooks/telegram/:tenantSlug/info
```

Returns the current webhook configuration from the Telegram API.

## 4.7 Cron Webhook Triggers

```bash
POST /webhooks/cron/:webhookToken
```

Triggers a scheduled job immediately via its unique webhook token. Use this to trigger agent tasks from external systems (e.g., ERPNext webhooks, CI pipelines).

```bash
curl -X POST http://localhost:3000/webhooks/cron/abc123-webhook-token
```

Response:
```json
{
  "jobRunId": "uuid",
  "status": "running"
}
```

## 4.8 OAuth Flow

Pulse implements OAuth 2.0 with PKCE for third-party CLI tool integration.

### Discovery

```bash
GET /.well-known/oauth-authorization-server
```

Returns full OAuth 2.0 server metadata (issuer, endpoints, supported grant types).

### Dynamic Client Registration

```bash
POST /oauth/register
```

```bash
curl -X POST http://localhost:3000/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My CLI Tool",
    "redirect_uris": ["http://localhost:8080/callback"],
    "token_endpoint_auth_method": "none"
  }'
```

Response:
```json
{
  "client_id": "generated-client-id",
  "client_name": "My CLI Tool",
  "redirect_uris": ["http://localhost:8080/callback"]
}
```

### Authorization

```bash
GET /oauth/authorize?client_id=xxx&redirect_uri=xxx&response_type=code&code_challenge=xxx&code_challenge_method=S256
```

Redirects to the dashboard consent page. After approval, redirects back with an authorization code.

### Token Exchange

```bash
POST /oauth/token
```

```bash
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=xxx&redirect_uri=xxx&client_id=xxx&code_verifier=xxx"
```

Response:
```json
{
  "access_token": "generated-access-token",
  "token_type": "Bearer",
  "expires_in": 2592000
}
```

Tokens are valid for 30 days.

## 4.9 Config API

Administrative API for hot-reloading gateway configuration.

**Authentication:** Admin authorization header

### Get current config

```bash
GET /api/config
```

```bash
curl http://localhost:3000/api/config \
  -H "Authorization: Bearer admin-token"
```

### Update config

```bash
PATCH /api/config
```

```bash
curl -X PATCH http://localhost:3000/api/config \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{"exec_safety_enabled": true, "exec_safety_default_policy": "allow_all"}'
```

Returns which keys require a gateway restart to take effect.

### Force reload

```bash
POST /api/config/reload
```

Reloads configuration from the database.

---

# Part 5 — Agent Tools Reference

Agents have access to built-in tools that are enabled per-tenant via the `tenant_skills` table. Tools are invoked automatically by the LLM when the agent determines they're needed.

## 5.1 `get_current_time`

Returns the current date and time in any timezone.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `timezone` | string | No | IANA timezone (default: UTC). e.g., `Africa/Johannesburg`, `America/New_York` |

**Example conversation:**
```
User: What time is it in South Africa?
Agent: [calls get_current_time with timezone="Africa/Johannesburg"]
Agent: It's currently 14:30 SAST (South African Standard Time).
```

## 5.2 `calculator`

Evaluates arithmetic expressions safely.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `expression` | string | **Yes** | Math expression (e.g., `(150 * 1.15) + 200`) |

Supports: `+`, `-`, `*`, `/`, `%`, `**`, `Math.sqrt()`, `Math.round()`, `Math.abs()`, etc.

**Example:**
```
User: What's 15% VAT on R12,500?
Agent: [calls calculator with expression="12500 * 0.15"]
Agent: The VAT amount is R1,875.00, making the total R14,375.00.
```

## 5.3 `exec`

Executes shell commands on the gateway host. Subject to the exec safety policy.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `command` | string | **Yes** | Shell command to execute |
| `yieldMs` | number | No | Auto-background after N milliseconds |
| `background` | boolean | No | Run in background immediately |
| `timeout` | number | No | Timeout in milliseconds |
| `workdir` | string | No | Working directory |

Vault credentials are injected as environment variables. The exec safety pipeline evaluates every command before execution.

**Example:**
```
User: List files in the workspace
Agent: [calls exec with command="ls -la /workspace"]
Agent: Here are the files in the workspace: ...
```

## 5.4 `process`

Manage background shell sessions created by the `exec` tool.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | string | **Yes** | `list` / `poll` / `log` / `write` / `kill` / `clear` |
| `sessionId` | string | Varies | Session ID (required for poll, log, write, kill) |
| `data` | string | No | Data to write to stdin (for `write` action) |
| `offset` | number | No | Log offset |
| `limit` | number | No | Log line limit |

## 5.5 `credential_list`

Lists available API credentials by name and type. **Never returns actual values.**

| Parameter | Type | Required | Description |
|---|---|---|---|
| — | — | — | No parameters needed |

Returns: Array of `{ name, type, description, agentId }` objects.

**Example:**
```
User: What API credentials do I have?
Agent: [calls credential_list]
Agent: You have the following credentials available:
  - ERPNEXT_API_KEY (api_key) — ERPNext production API key
  - ERPNEXT_API_SECRET (api_key) — ERPNext API secret
  - ERPNEXT_URL will be available as an environment variable
```

## 5.6 `python_execute`

Runs Python code in an isolated Docker container with pre-installed packages and credential injection.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `code` | string | **Yes** | Python code to execute |
| `packages` | string[] | No | Additional pip packages to install |
| `timeout` | number | No | Timeout in seconds (default: 60, max: 300) |

**Pre-installed packages:** requests, httpx, aiohttp, pandas, openpyxl, xlsxwriter, sqlalchemy, psycopg2-binary, pymysql, beautifulsoup4, lxml, pydantic, python-dateutil, pytz, jinja2, tabulate, cryptography, python-dotenv

**Container limits:** 256MB memory, 1 CPU, network access enabled, runs as `nobody` user.

**Example:**
```
User: Get all unpaid invoices from ERPNext over R50,000
Agent: [calls credential_list — sees ERPNEXT_API_KEY, ERPNEXT_API_SECRET, ERPNEXT_URL]
Agent: [calls python_execute with code:]
  import requests, os
  url = os.environ["ERPNEXT_URL"]
  headers = {"Authorization": f"token {os.environ['ERPNEXT_API_KEY']}:{os.environ['ERPNEXT_API_SECRET']}"}
  r = requests.get(f"{url}/api/resource/Sales Invoice", headers=headers, params={
      "filters": '[["outstanding_amount",">",50000],["docstatus","=",1]]',
      "fields": '["name","customer","grand_total","outstanding_amount"]'
  })
  print(r.json()["data"])
Agent: Here are the unpaid invoices over R50,000: ...
```

## 5.7 `script_save`

Saves a working script for future reuse.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filename` | string | **Yes** | Script filename (e.g., `fetch_invoices.py`) |
| `code` | string | **Yes** | Script source code |
| `description` | string | No | What this script does |
| `language` | string | No | Language (default: `python`) |

**Example:**
```
Agent: [calls script_save with filename="unpaid_invoices.py", code="...", description="Fetch unpaid invoices over R50k from ERPNext"]
Agent: I've saved this script as unpaid_invoices.py for future use.
```

## 5.8 `script_load`

Loads a previously saved script by filename.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filename` | string | **Yes** | Script filename to load |

Returns the script code. Increments the script's use count.

## 5.9 `script_list`

Lists all saved scripts for this agent.

| Parameter | Type | Required | Description |
|---|---|---|---|
| — | — | — | No parameters needed |

Returns: Array of `{ filename, description, language, lastUsed, useCount }` objects.

## 5.10 `memory_store`

Stores a fact, preference, or decision in the agent's long-term memory.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `content` | string | **Yes** | The memory content to store |
| `category` | string | No | `general` / `fact` / `preference` / `decision` / `task` / `relationship` |
| `importance` | number | No | 0.0 to 1.0 (default: 0.5) |

The content is embedded using OpenAI's `text-embedding-3-small` model (1536 dimensions) for semantic search.

**Example:**
```
Agent: [calls memory_store with content="Acme Corp prefers invoices in ZAR, not USD", category="preference", importance=0.8]
Agent: I'll remember that Acme Corp prefers ZAR invoices.
```

## 5.11 `memory_search`

Searches the agent's long-term memory using hybrid vector + full-text search.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | **Yes** | Search query (semantic + keyword) |
| `category` | string | No | Filter by category |
| `limit` | number | No | Max results (default: 5) |

**Search pipeline:**
1. Generate query embedding
2. Run hybrid search (vector cosine similarity + PostgreSQL full-text search)
3. Apply temporal decay (30-day half-life)
4. Apply MMR for diversity (lambda = 0.7)
5. Return ranked results

## 5.12 `memory_forget`

Deletes a specific memory entry.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `memoryId` | string | **Yes** | UUID of the memory to delete |

## 5.13 `schedule_job`

Creates a recurring scheduled job.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | **Yes** | Job name |
| `cron` | string | **Yes** | Cron expression (e.g., `0 8 * * 1-5`) |
| `message` | string | **Yes** | Instruction sent to the agent when the job fires |
| `timezone` | string | No | IANA timezone (default: UTC) |

**Example:**
```
User: Check for unpaid invoices every weekday morning at 8am South Africa time
Agent: [calls schedule_job with name="Daily Invoice Check", cron="0 8 * * 1-5", message="Check ERPNext for new unpaid invoices over R50,000 and report them", timezone="Africa/Johannesburg"]
Agent: Done! I'll check for unpaid invoices at 8:00 AM SAST every weekday.
```

## 5.14 `schedule_once`

Creates a one-time scheduled job.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | **Yes** | Job name |
| `runAt` | string | **Yes** | ISO 8601 datetime (e.g., `2026-03-01T09:00:00+02:00`) |
| `message` | string | **Yes** | Instruction for the agent |

## 5.15 `list_jobs`

Lists all scheduled jobs for this agent.

Returns: Array of `{ id, name, scheduleType, cronExpression, intervalSeconds, runAt, timezone, enabled, lastRunAt, nextRunAt, webhookToken }`.

## 5.16 `cancel_job`

Cancels or permanently deletes a scheduled job.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `jobId` | string | **Yes** | Job UUID |
| `permanent` | boolean | No | If true, deletes the job entirely |

## 5.17 `delegate_to_agent`

Sends a task to another specialized agent and returns the result.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agentId` | string | **Yes** | Target agent UUID |
| `task` | string | **Yes** | Clear description of what the target agent should do |

The source agent must have `canDelegate: true` and the target must have `acceptsDelegation: true`. Delegation depth is limited (default: 3) to prevent infinite chains.

**Example:**
```
Supervisor Agent: [calls list_agents — sees "ERPNext Agent" with specialization "ERPNext API specialist"]
Supervisor Agent: [calls delegate_to_agent with agentId="erpnext-agent-id", task="Get all unpaid invoices over R50,000 from ERPNext"]
Supervisor Agent: The ERPNext specialist found 5 unpaid invoices totaling R342,500...
```

## 5.18 `list_agents`

Lists all agents in the tenant that accept delegation.

Returns: Array of `{ id, name, specialization, model, capabilities }`.

---

# Part 6 — Feature Deep-Dives

## 6.1 Exec Safety System

The exec safety system evaluates every shell command and Python script before execution, providing defense-in-depth against dangerous operations.

### How the Policy Pipeline Works

Every command passes through this evaluation chain (in order):

```
Command
  │
  ▼
1. Global Enabled Check ──→ If disabled, allow all
  │
  ▼
2. Obfuscation Detection ──→ Deny if encoding/eval tricks detected
  │
  ▼
3. Dangerous Patterns Blacklist ──→ Deny if critical/high pattern matched
  │
  ▼
4. Safe Commands Whitelist ──→ Allow if binary is in safe list
  │
  ▼
5. DB Policy Rules ──→ Agent-specific → Tenant-wide → Global (priority ordered)
  │
  ▼
6. Default Policy ──→ allow_all / allowlist_only / deny_all
  │
  ▼
7. Audit Log ──→ Always logged (regardless of decision)
```

### Obfuscation Detection

Detects 12 patterns of command obfuscation:

| Pattern | Example |
|---|---|
| Base64 decode piped to shell | `base64 -d payload \| bash` |
| Hex decode piped to shell | `xxd -r payload \| sh` |
| eval with encoded input | `eval $(base64 -d ...)` |
| eval with variable expansion | `eval "$cmd"` |
| Process substitution with decode | `<(base64 -d payload)` |
| Language inline decode | `python -e "...decode..."` |
| Python exec with decode | `python -c "exec(decode(...))"` |
| Variable expansion chains | `$a$b$c$d \| bash` |
| Printf escape sequences piped to shell | `printf '\x...' \| sh` |
| OpenSSL decode piped to shell | `openssl enc -d \| bash` |
| Nested command substitution | `$($(...))` |
| Gzip decode piped to shell | `gunzip \| sh` |

### Dangerous Patterns (18 patterns)

| Category | Patterns | Severity |
|---|---|---|
| Filesystem destruction | `rm -rf /`, `rm -rf ~/`, `rm -rf .` | Critical |
| Database destruction | `DROP TABLE`, `DROP DATABASE`, `TRUNCATE` | Critical |
| Remote code execution | `curl \| sh`, `wget \| bash`, `curl > /tmp && bash` | Critical |
| Encoded execution | `eval $(base64 -d ...)` | Critical |
| Disk destruction | `mkfs`, `dd if=` | Critical |
| Fork bomb | `:(){ :\|:& };:` | Critical |
| Permission escalation | `chmod 777`, `chown root` | High |
| Reverse shells | `/dev/tcp/`, `nc -e /bin/sh` | High |
| Privilege escalation | `sudo` | High |
| Data exfiltration | `curl -d @/filepath` | Medium |

### Safe Commands Whitelist

These binaries are allowed by default:

**Read-only system tools:** `ls`, `cat`, `head`, `tail`, `grep`, `wc`, `sort`, `uniq`, `cut`, `jq`, `find` (without `-exec`/`-delete`), `file`, `stat`, `du`, `df`, `pwd`, `whoami`, `date`, `echo`, `printf`, `basename`, `dirname`, `env`, `tr`, `sed`, `awk`, `tee`, `diff`, `md5sum`, `sha256sum`, `base64`

**Programming:** `python3`, `python`, `pip`, `pip3`, `node`, `npm`, `npx`

**Network (read-only):** `curl`, `wget`, `ping`, `dig`, `nslookup`, `host`

**File manipulation:** `mkdir`, `touch`, `cp`, `mv`

### Configuring Global Policy

1. Go to **Admin → Settings → Exec Safety**
2. Set the **Default Policy**:
   - `allow_all` — Allow commands not in the blacklist (default)
   - `allowlist_only` — Only allow commands matching whitelist patterns
   - `deny_all` — Deny all commands unless explicitly allowed
3. Add **Global Deny Patterns** — one pattern per line
4. Add **Global Allow Patterns** — one pattern per line

### Per-Agent Overrides

1. Go to **Dashboard → Agent → Safety**
2. Add custom allow/deny rules for this specific agent
3. Agent rules take priority over global rules

### Reading the Audit Log

The audit log records every execution decision:
- **Admin view** (`/admin/settings/exec-safety`) — all tenants
- **Agent view** (`/dashboard/agents/{id}/safety`) — filtered to one agent

Each entry shows: timestamp, decision (allowed/denied/sandboxed), command text, and the reason.

## 6.2 Credential Vault

The credential vault provides secure storage for API keys and secrets with AES-256-GCM encryption at rest.

### How Encryption Works

1. The `ENCRYPTION_KEY` environment variable provides a 32-byte key (64 hex characters)
2. When a credential is stored, it is encrypted with AES-256-GCM (authenticated encryption)
3. Each credential gets a unique random IV (initialization vector)
4. The encrypted ciphertext + IV + auth tag are stored in the `credentials` table
5. Decryption only happens when credentials are injected into a sandbox or exec environment
6. Credential values are **never** returned via the API or displayed in the dashboard

### Adding Credentials via Dashboard

1. Go to **Dashboard → Settings → Credentials**
2. Click **Add Credential**
3. Enter:
   - **Name**: Use `UPPER_SNAKE_CASE` naming (auto-formatted). This becomes the environment variable name.
   - **Type**: `api_key`, `bearer`, `basic`, or `oauth2`
   - **Value**: Paste the secret (shown as password dots, never retrievable after save)
   - **Description**: What this credential is for
   - **Base URL**: If the API has a base URL, enter it here (injected as `{NAME}_URL`)
   - **Agent Scope**: Choose "All Agents" or restrict to a specific agent
4. Click **Save**

### How Agents Use Credentials

Agents access credentials as environment variables — they never see the raw values directly:

1. Agent calls `credential_list` to discover available credentials:
   ```
   Available: ERPNEXT_API_KEY (api_key), ERPNEXT_API_SECRET (api_key), ERPNEXT_URL
   ```
2. Agent writes Python code referencing them:
   ```python
   import os
   api_key = os.environ["ERPNEXT_API_KEY"]
   api_secret = os.environ["ERPNEXT_API_SECRET"]
   url = os.environ["ERPNEXT_URL"]
   ```
3. When `python_execute` runs, the vault decrypts all applicable credentials and injects them as Docker `-e` flags

### Credential Scoping

- **All Agents**: The credential is available to every agent in the tenant
- **Specific Agent**: Only the selected agent receives this credential in its environment

### Metadata Injection

If a credential has a `baseUrl` in its metadata, additional environment variables are created:
- `{NAME}_URL` — from metadata.baseUrl
- `{NAME}_HOST` — from metadata.host

## 6.3 Python Sandbox

The Python sandbox provides isolated code execution in Docker containers with pre-installed packages and network access.

### Docker Image Contents

The `pulse-python-sandbox:latest` image is based on `python:3.12-slim` with 18 pre-installed packages:

| Package | Category | Purpose |
|---|---|---|
| `requests` | HTTP | Synchronous HTTP client |
| `httpx` | HTTP | Modern async/sync HTTP client |
| `aiohttp` | HTTP | Async HTTP client |
| `pandas` | Data | DataFrames and data analysis |
| `openpyxl` | Data | Read/write Excel (.xlsx) files |
| `xlsxwriter` | Data | Write Excel files with formatting |
| `sqlalchemy` | Database | SQL toolkit and ORM |
| `psycopg2-binary` | Database | PostgreSQL adapter |
| `pymysql` | Database | MySQL adapter |
| `beautifulsoup4` | Parsing | HTML/XML parser |
| `lxml` | Parsing | Fast XML/HTML parser |
| `pydantic` | Validation | Data validation with type hints |
| `python-dateutil` | Dates | Advanced date parsing |
| `pytz` | Dates | Timezone definitions |
| `jinja2` | Templates | Template engine |
| `tabulate` | Formatting | Pretty-print tabular data |
| `cryptography` | Security | Cryptographic operations |
| `python-dotenv` | Config | Read .env files |

### How `python_execute` Works

1. **Safety check**: The Python code passes through the exec safety pipeline
2. **Credential injection**: Vault credentials for the tenant/agent are decrypted and prepared as `-e KEY=value` Docker flags
3. **Package installation**: If `packages` parameter is provided, `pip install --quiet {packages}` is prepended
4. **Docker execution**: The container runs with:
   - Image: `pulse-python-sandbox:latest` (configurable)
   - Memory limit: 256MB (configurable: 128m/256m/512m/1g)
   - CPU limit: 1.0 (configurable: 0.5/1.0/2.0)
   - Network: bridge (enabled for API calls)
   - User: `nobody` (no root access)
   - Auto-remove: `--rm` flag
   - Timeout: 60s default, max 300s
5. **Output capture**: stdout is returned as the tool result; stderr is returned as an error
6. **Audit logging**: The execution is logged in `exec_audit_log`

### Resource Limits

| Resource | Default | Options |
|---|---|---|
| Memory | 256 MB | 128m / 256m / 512m / 1g |
| CPU | 1.0 core | 0.5 / 1.0 / 2.0 |
| Timeout | 60 seconds | Up to 300 seconds |
| Network | Enabled | Can be disabled in admin settings |

### Script Persistence

Agents can save working scripts for reuse:

1. Agent develops and tests a script with `python_execute`
2. Agent calls `script_save` with the working code
3. Later, agent calls `script_load` to retrieve the saved script
4. `script_list` shows all saved scripts with use counts

Scripts are stored in the `agent_scripts` table, scoped per agent.

## 6.4 API Knowledge Templates

Knowledge templates provide agents with concise API reference documentation so they can write better code for specific business systems.

### Available Templates

| Template | File | Contents |
|---|---|---|
| ERPNext API | `ERPNEXT_API.md` | Frappe REST API: auth, CRUD endpoints, filter operators, doctypes, Python patterns, pagination, file uploads |
| QuickBooks API | `QUICKBOOKS_API.md` | QuickBooks Online API reference |
| Pastel API | `PASTEL_API.md` | Pastel Partner API reference |
| Xero API | `XERO_API.md` | Xero Accounting API reference |
| Python Patterns | `PYTHON_PATTERNS.md` | Common Python patterns for API work |
| REST API General | `REST_API_GENERAL.md` | General REST API patterns and best practices |

### How to Add Templates to an Agent

1. Go to **Dashboard → Agent → Knowledge**
2. Click a template from the grid to add it
3. The template is copied to the agent's workspace as `KNOWLEDGE_{TEMPLATE_NAME}.md`
4. Edit the content to customize for your specific environment (e.g., update base URLs, add custom doctypes)

### How Templates Are Injected

When an agent processes a message, the workspace service builds the system prompt:

1. Load `SOUL.md` (core personality)
2. Load `IDENTITY.md` (business context)
3. Load `MEMORY.md` (static reference data)
4. Load `HEARTBEAT.md` (scheduled task instructions)
5. Load all `KNOWLEDGE_*.md` files — injected under `## API Knowledge`

This gives the agent in-context reference material so it can write correct API calls without guessing.

### Creating Custom Knowledge Files

1. In the Knowledge page, enter a custom name (e.g., `INTERNAL_CRM`)
2. Click **Add Custom**
3. A blank `KNOWLEDGE_INTERNAL_CRM.md` file is created
4. Fill in your API documentation, endpoint references, and example patterns
5. Click **Save**

## 6.5 Memory System

The memory system gives agents persistent long-term memory using vector embeddings and hybrid search.

### How Memories Are Stored

1. Agent calls `memory_store` with content and optional category/importance
2. The content is sent to OpenAI's `text-embedding-3-small` model to generate a 1536-dimensional embedding vector
3. Both the text content and embedding are stored in the `memory_entries` table
4. The embedding is indexed using pgvector's IVFFlat index for fast similarity search
5. The text content is indexed using PostgreSQL's GIN index for full-text search

### Memory Categories

| Category | Use Case |
|---|---|
| `general` | Default; uncategorized memories |
| `fact` | Verified factual information |
| `preference` | User or business preferences |
| `decision` | Decisions made and their rationale |
| `task` | Ongoing or completed tasks |
| `relationship` | People, roles, and connections |

### Hybrid Search (Vector + FTS)

Memory search combines two approaches:

1. **Vector similarity** (70% weight): Cosine similarity between query embedding and stored embeddings
2. **Full-text search** (30% weight): PostgreSQL `tsvector` keyword matching

Combined score: `0.7 * vector_score + 0.3 * fts_score`

### Temporal Decay

Older memories are naturally deprioritized:

```
decayed_score = score * exp(-λ * age_days)
```

- Default half-life: 30 days
- After 30 days, a memory's score is halved
- After 60 days, it's at 25%
- Frequently accessed memories have their `accessed_at` updated, keeping them fresh

### MMR (Maximal Marginal Relevance)

To prevent retrieving repetitive memories, MMR selects diverse results:

- Lambda = 0.7 means 70% relevance, 30% diversity
- Each selected memory reduces the score of similar remaining candidates
- This ensures the agent gets a broad picture rather than five variations of the same fact

### Auto-Injection into System Prompt

Before every LLM call, the runtime:
1. Takes the user's message text
2. Calls `memoryService.getRelevantContext(tenantId, agentId, message, 5)`
3. Retrieves the top 5 most relevant memories
4. Appends them to the system prompt under `## Relevant Memories`

This happens automatically — the agent doesn't need to explicitly search.

### Managing Memories via Dashboard

Go to **Dashboard → Agent → Memory** to:
- View all memories with content, category, importance, and access stats
- Search memories by text
- Delete individual memories
- Bulk delete by category or date range

## 6.6 Scheduled Jobs

The scheduling system enables agents to run tasks automatically on cron schedules, at intervals, or as one-time events.

### Schedule Types

| Type | Description | Example |
|---|---|---|
| `cron` | Standard cron expression | `0 8 * * 1-5` (weekdays at 8am) |
| `interval` | Repeat every N seconds | Every 3600 seconds (hourly) |
| `once` | Run at a specific datetime | `2026-03-15T14:00:00+02:00` |

### Cron Expression Examples

| Expression | Description |
|---|---|
| `* * * * *` | Every minute |
| `0 * * * *` | Every hour on the hour |
| `0 2 * * *` | Daily at 2:00 AM |
| `0 8 * * 1-5` | Weekdays at 8:00 AM |
| `0 0 * * 0` | Every Sunday at midnight |
| `0 8,12,17 * * *` | Three times daily (8am, noon, 5pm) |
| `30 9 1 * *` | 1st of each month at 9:30 AM |
| `0 */6 * * *` | Every 6 hours |
| `0 2 * * 6` | Every Saturday at 2:00 AM |

### Timezone Support

Jobs can be configured with any of these timezones:
- UTC (default)
- Africa/Johannesburg (SAST)
- America/New_York (EST/EDT)
- America/Chicago (CST/CDT)
- America/Denver (MST/MDT)
- America/Los_Angeles (PST/PDT)
- Europe/London (GMT/BST)
- Europe/Paris (CET/CEST)
- Asia/Tokyo (JST)
- Australia/Sydney (AEST/AEDT)

### How Jobs Execute

1. The `CronScheduler` loads all enabled jobs on gateway boot
2. Each job creates a `Cron` instance (via the `croner` library), `setInterval`, or `setTimeout`
3. When a job fires:
   a. A `job_runs` record is created with status `running`
   b. A synthetic `InboundMessage` is built with the job's message text
   c. The agent's `processMessage()` is called (same pipeline as regular messages)
   d. The response is captured (not sent to any channel)
   e. `job_runs` is updated with the result, status, and token count

### Webhook Triggers

Every scheduled job gets a unique `webhookToken`. External systems can trigger the job immediately:

```bash
POST http://your-gateway/webhooks/cron/{webhookToken}
```

Use case: ERPNext sends a webhook when a new invoice is created → triggers the agent to process it.

### Job Run History

Each job maintains a history of runs accessible from the **Schedules** page:
- Start time
- Completion time
- Status (completed / failed)
- Result preview
- Tokens used

## 6.7 Multi-Agent Orchestration

Multi-agent orchestration allows agents to delegate tasks to specialized agents, creating a supervisor-specialist pattern.

### Delegation Config

Each agent profile has a `delegationConfig` JSON field:

| Field | Type | Default | Description |
|---|---|---|---|
| `canDelegate` | boolean | false | Can this agent call others? |
| `acceptsDelegation` | boolean | false | Can other agents call this one? |
| `delegateTo` | string[] | [] (all) | Restricted target agent IDs |
| `maxDepth` | number | 3 | Max recursion depth |
| `specialization` | string | — | Description for other agents |

### Depth Limits

To prevent infinite delegation chains (Agent A → Agent B → Agent A → ...), a depth counter is tracked. Each delegation increments the depth, and if `depth >= maxDepth`, the delegation is rejected.

### How `delegate_to_agent` Works

1. Source agent calls `list_agents` to discover available specialists
2. Source agent calls `delegate_to_agent` with target ID and task description
3. The system validates:
   - Source agent has `canDelegate: true`
   - Target agent has `acceptsDelegation: true`
   - Current depth < maxDepth
   - Target is in source's `delegateTo` list (if restricted)
4. A new `AgentRuntime` is created for the target agent
5. The task is processed as a synthetic message (not sent to any channel)
6. The target agent's response is captured and returned to the source agent
7. A delegation record is saved in `agent_delegations` for audit

### Example: Supervisor + Specialist Pattern

**Setup:**
- **Supervisor Agent**: `canDelegate: true`, broad knowledge, handles user conversations
- **ERPNext Agent**: `acceptsDelegation: true`, specialization: "ERPNext API specialist", has ERPNEXT credentials and knowledge template
- **QuickBooks Agent**: `acceptsDelegation: true`, specialization: "QuickBooks accounting specialist"

**Flow:**
```
User → Supervisor: "Compare our ERPNext invoices with QuickBooks"
  Supervisor → ERPNext Agent: "Get all invoices from last month"
  ERPNext Agent → [runs Python, calls ERPNext API] → returns invoice data
  Supervisor → QuickBooks Agent: "Get all invoices from last month"
  QuickBooks Agent → [runs Python, calls QuickBooks API] → returns invoice data
Supervisor → User: "Here's the comparison..."
```

### Orchestration Dashboard

Go to **Dashboard → Agents → Orchestration** to see:
- All agents and their delegation capabilities
- Recent delegations across all agents
- Success/failure stats

### Runtime Enhancement

When an agent has `canDelegate: true`, the runtime:
1. Injects `## Available Agents for Delegation` into the system prompt with agent names, IDs, and specializations
2. Increases the max tool iterations from 5 to 10 (to allow for multi-step delegation workflows)

## 6.8 Plugin System

The plugin system provides extensibility through a hook-based architecture. Plugins can add tools, intercept messages, modify prompts, and register HTTP routes.

### Plugin Manifest Structure

```typescript
{
  name: "my-plugin",
  version: "1.0.0",
  description: "What this plugin does",
  author: "Plugin Author",
  tools: [...],          // Tools added to the agent's toolbox
  hooks: {...},          // Lifecycle intercepts
  routes: [...]          // HTTP routes mounted at /plugins/<name>/
}
```

### Available Hooks

| Hook | When It Fires | Can Modify |
|---|---|---|
| `gateway-start` | Server boot | Receives Fastify instance |
| `gateway-stop` | Server shutdown | — |
| `message-received` | Inbound message arrives | Message content, contact, channel |
| `message-sending` | Before sending response | Response content |
| `before-prompt-build` | Before building system prompt | System prompt, messages |
| `before-tool-call` | Before executing a tool | Tool name, arguments |
| `after-tool-call` | After tool execution | Observe result (read-only) |
| `llm-input` | Before LLM API call | Model, prompt, messages |
| `llm-output` | After LLM response | Observe content and usage (read-only) |

Hooks that return a modified context object override the pipeline. Hooks that return `null` don't modify anything. Errors in hooks are caught and logged (they don't break the pipeline).

### Creating a Simple Plugin

Create a file (e.g., `plugins/hello-world/index.ts`):

```typescript
import { definePlugin } from "@runstate/pulse/plugins/sdk";

export default definePlugin({
  name: "hello-world",
  version: "1.0.0",
  description: "Adds a hello_world tool and logs all messages",

  tools: [
    {
      name: "hello_world",
      description: "Says hello",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ result: "Hello from plugin!" }),
    },
  ],

  hooks: {
    "message-received": async (ctx) => {
      console.log(`Message from ${ctx.contactId}: ${ctx.content}`);
      return ctx; // pass through unmodified
    },
    "gateway-start": async (ctx) => {
      console.log("Hello World plugin started!");
    },
  },

  routes: [
    {
      method: "GET",
      path: "/status",
      handler: async (req, reply) => reply.send({ status: "ok" }),
    },
  ],
});
```

This plugin:
- Adds a `hello_world` tool to all agents
- Logs every incoming message
- Registers a GET endpoint at `/plugins/hello-world/status`

### Installing and Managing Plugins

**Via Admin Panel:**
1. Go to **Admin → Plugins**
2. Click **Install Plugin**
3. Enter the plugin name, source type (`local`), version, and path to the entry file
4. Submit — the plugin is loaded and activated

**Lifecycle:**
- Plugins are loaded on gateway boot via `pluginManager.init()`
- Each plugin's hooks are registered in the `HookRegistry` with priority ordering
- Plugin tools are injected into the tool registry
- Plugin routes are mounted at `/plugins/<pluginName>/`
- On shutdown, `gateway-stop` hooks fire

### Tenant-Level Plugin Toggles

1. Go to **Dashboard → Settings → Plugins**
2. Each admin-installed plugin is listed
3. Toggle on/off per tenant workspace
4. When disabled for a tenant, that plugin's tools and hooks are skipped for that tenant's conversations

## 6.9 Telegram Integration

Pulse AI connects to Telegram via the grammY library and webhook mode.

### Bot Setup

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts to create a bot
3. Copy the bot API token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. In the Pulse dashboard, go to **Settings → Integrations**
5. Paste the token in the Telegram section
6. The gateway registers a webhook with Telegram

### Webhook Mode

Pulse uses webhook mode (not polling). Telegram sends HTTP POST requests to:

```
POST https://your-domain/webhooks/telegram/{tenantSlug}
```

For production, set `WEBHOOK_BASE_URL` in your `.env` to your public URL. The gateway automatically registers the webhook URL with the Telegram Bot API.

If `TELEGRAM_WEBHOOK_SECRET` is set, the gateway validates the `X-Telegram-Bot-Api-Secret-Token` header on every webhook delivery.

### DM Policies

Control how the bot handles direct messages from new users:

| Policy | Behavior |
|---|---|
| `open` | Anyone can message the bot — no restrictions |
| `pairing` | New users must submit a pairing code. The code is sent to the dashboard for admin/tenant approval |
| `approval_list` | Only pre-approved contacts (in the allowlist) can message the bot |

### Group Policies

Control how the bot behaves in Telegram groups:

| Policy | Behavior |
|---|---|
| `open` | Bot responds in any group it's added to |
| `allowlist` | Bot only responds in pre-approved groups |
| `disabled` | Bot ignores all group messages |

### Mention Requirement

When enabled, the bot only responds in groups when @mentioned. This prevents the bot from responding to every message in a busy group.

### Pairing Codes and Approval Flow

When DM policy is `pairing`:

1. A new user messages the bot
2. The bot replies asking for a pairing code
3. The tenant admin generates pairing codes in the dashboard
4. The user enters the code
5. The pairing request appears in **Settings → Telegram → Pending Pairings** (or admin's **Tenant → Approvals**)
6. Admin approves or rejects
7. If approved, the user is added to the allowlist

## 6.10 MCP Servers

MCP (Model Context Protocol) allows connecting external API services as tool providers for agents.

### What MCP Is

MCP is a protocol for connecting AI models to external tools and data sources. An MCP server exposes tools, resources, and prompts that agents can use.

### Connecting an MCP Server

1. Go to **Dashboard → MCP Servers**
2. Click **Add MCP Server**
3. Enter:
   - **Name**: A descriptive name (e.g., "Company CRM")
   - **URL**: The MCP server's endpoint URL
   - **Auth Headers**: JSON object with authentication headers
4. Submit — the server is registered

### Binding Agents to MCP Servers

1. In the MCP Servers page, select a server
2. Choose which agent profiles should have access to this server's tools
3. Only bound agents can see and use the MCP server's tools

### Using MCP Tools in Conversations

When an agent is bound to an MCP server:
1. The agent's available tools are expanded with the MCP server's tools
2. The agent can call these tools naturally during conversations
3. Tool calls are routed through the Pulse gateway to the MCP server
4. Results are returned to the agent

## 6.11 OpenAI-Compatible API

Pulse provides an OpenAI-compatible API, allowing any application or SDK that works with OpenAI to work with Pulse agents.

### Creating API Tokens

1. Go to **Dashboard → Settings → API & Developer**
2. Click **Generate Token**
3. Enter a name and select scopes:
   - `chat` — For `/v1/chat/completions` endpoint
   - `responses` — For `/v1/responses` endpoint
4. Set an optional expiry date
5. Copy the token immediately (it's only shown once)

### Using with Any OpenAI SDK

**Python (openai library):**

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-pulse-api-token",
    base_url="http://localhost:3000/v1"
)

response = client.chat.completions.create(
    model="pulse:your-agent-id",
    messages=[
        {"role": "user", "content": "Hello, what can you do?"}
    ]
)
print(response.choices[0].message.content)
```

**Node.js (openai package):**

```javascript
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: "your-pulse-api-token",
    baseURL: "http://localhost:3000/v1"
});

const completion = await client.chat.completions.create({
    model: "pulse:your-agent-id",
    messages: [{ role: "user", content: "Hello!" }]
});
console.log(completion.choices[0].message.content);
```

### Model Mapping

Use `model: "pulse:<agentId>"` to target a specific agent. If `model` is omitted or doesn't start with `pulse:`, the tenant's default agent is used.

### Streaming Support

Both endpoints support streaming via `stream: true`:

```python
stream = client.chat.completions.create(
    model="pulse:agent-id",
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

## 6.12 OAuth & Third-Party CLI

Pulse supports OAuth 2.0 with PKCE for secure integration with third-party CLI tools.

### Dynamic Client Registration

Third-party tools can register themselves as OAuth clients:

```bash
curl -X POST http://localhost:3000/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My CLI Tool",
    "redirect_uris": ["http://localhost:8080/callback"],
    "token_endpoint_auth_method": "none"
  }'
```

### PKCE Flow

1. **Client generates** a `code_verifier` (random string) and `code_challenge` (SHA-256 hash)
2. **Authorization request**:
   ```
   GET /oauth/authorize?client_id=xxx&redirect_uri=xxx&response_type=code
     &code_challenge=xxx&code_challenge_method=S256&state=xxx
   ```
3. **User consent**: The browser shows the consent page where the user approves
4. **Redirect**: User is redirected to `redirect_uri?code=xxx&state=xxx`
5. **Token exchange**:
   ```bash
   POST /oauth/token
   grant_type=authorization_code&code=xxx&redirect_uri=xxx
   &client_id=xxx&code_verifier=xxx
   ```
6. **Access token**: 30-day Bearer token is returned

### Claude Code Integration

To use Pulse with Claude Code CLI:

1. Enable **Third-Party CLI Access** in **Dashboard → Settings → API & Developer**
2. Claude Code can discover Pulse via the OAuth discovery endpoint:
   ```
   GET /.well-known/oauth-authorization-server
   ```
3. It will register as an OAuth client and initiate the PKCE flow
4. After authorization, Claude Code can interact with Pulse agents

### API Token Management

For simpler integrations (no OAuth), use API tokens directly:

1. Generate a token in **Settings → API & Developer**
2. Use it as a Bearer token: `Authorization: Bearer <token>`
3. Tokens can be scoped to specific API endpoints (`chat`, `responses`)
4. Revoke tokens at any time from the dashboard

---

# Part 7 — Troubleshooting

## Common Errors and Solutions

### "Insufficient credits"
**Cause:** Tenant balance is zero or negative.
**Fix:** Admin should add credits via **Admin → Tenant Detail → Credit Adjustment**.

### "All LLM providers failed"
**Cause:** No valid API key for any provider.
**Fix:**
1. Check `ANTHROPIC_API_KEY` is set in `.env`
2. Check if tenant has their own provider key in **Settings → Providers**
3. Check admin global keys in **Admin → Settings → AI Model Providers**

### "OAuth authentication is currently not supported"
**Cause:** Attempting to use a `sk-ant-oat01-...` OAuth token with the Anthropic API.
**Fix:** Use a standard `sk-ant-api03-...` API key. OAuth tokens from `claude setup-token` are for the Claude Code CLI only and are not supported by the Anthropic Messages API.

### "Command denied by exec safety"
**Cause:** The command matched a dangerous pattern or policy rule.
**Fix:**
1. Check the audit log for the specific reason
2. If the command should be allowed, add an allow pattern in exec safety settings
3. Review the agent's per-agent safety rules

### "Docker sandbox failed"
**Cause:** Docker daemon not running or image not built.
**Fix:**
```bash
# Check Docker is running
docker ps

# Build the Python sandbox image
docker compose build python-sandbox

# Verify the image exists
docker images | grep pulse-python-sandbox
```

### "Memory search returned no results"
**Cause:** No embedding generated (missing `OPENAI_API_KEY`) or no memories stored.
**Fix:**
1. Ensure `OPENAI_API_KEY` is set for vector embeddings
2. Without it, only full-text search works (reduced quality)
3. Check if the agent has any memories in **Agent → Memory**

## Health Check Endpoint

Use the health endpoint to verify the gateway is running:

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","version":"1.0.0","uptime":...}
```

## Database Migration Issues

### "relation does not exist"
Run pending migrations:
```bash
cd pulse && npm run db:migrate
```

### pgvector extension error
Ensure you're using the `pgvector/pgvector:0.8.0-pg15` Docker image (included in docker-compose.yml). The `0013_memory_system.sql` migration creates the extension:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

If using a custom PostgreSQL installation, install pgvector manually:
```bash
# Ubuntu/Debian
sudo apt install postgresql-15-pgvector

# Then in psql:
CREATE EXTENSION vector;
```

## Telegram Webhook Problems

### Bot not responding
1. Check the webhook is registered:
   ```bash
   curl http://localhost:3000/webhooks/telegram/your-tenant-slug/info
   ```
2. Verify `WEBHOOK_BASE_URL` is set and publicly accessible
3. Check the Telegram bot token is correct in **Settings → Integrations**
4. Check DM/Group policies in **Settings → Telegram** — new contacts may be blocked by policy

### "Secret token mismatch"
The `X-Telegram-Bot-Api-Secret-Token` header doesn't match `TELEGRAM_WEBHOOK_SECRET` in your `.env`. Update one to match the other.

## Docker Sandbox Failures

### "python_execute timed out"
- Default timeout is 60 seconds
- Increase via the `timeout` parameter (max 300s)
- Check if the code has infinite loops or is waiting on unresponsive APIs

### "Container memory exceeded"
- Default is 256MB
- For data-heavy operations (large pandas DataFrames), increase to 512m or 1g in **Admin → Settings → Sandbox**

### "Network unreachable from sandbox"
- Ensure **Network Access** is enabled in sandbox settings
- Check Docker network configuration: `docker network ls`
- The sandbox uses `--network=bridge` mode

## Scheduled Job Issues

### Job not firing
1. Check the scheduler is enabled in **Admin → Settings → Scheduling**
2. Verify the job is **Enabled** (toggle in Schedules page)
3. Check the cron expression is valid
4. Verify the timezone is correct
5. Check the gateway logs for scheduler errors

### Job failing silently
- Check the **Job Run History** for error messages
- The agent processes scheduled messages through the same pipeline as regular messages — check tenant credits
- Verify the agent has the necessary tools and credentials enabled

## Plugin Issues

### Plugin not loading
1. Check the source path is correct
2. Verify the plugin file exports a valid manifest
3. Check gateway logs for plugin load errors
4. Ensure the plugin is enabled in **Admin → Plugins**

### Plugin tools not appearing
1. Verify the plugin is enabled for the tenant in **Dashboard → Settings → Plugins**
2. Check that the plugin's tools array is properly defined
3. Restart the gateway after installing new plugins

---

# Appendix A — Database Tables Quick Reference

| Table | Purpose | Key Relationships |
|---|---|---|
| `global_settings` | Platform-wide config (singleton) | — |
| `tenants` | Multi-tenant organizations | — |
| `users` | Login accounts (admin + tenant) | `users.tenantId → tenants.id` |
| `agent_profiles` | AI agent configurations | `agent_profiles.tenantId → tenants.id` |
| `conversations` | Chat threads | `conversations.tenantId → tenants.id` |
| `messages` | Chat messages | `messages.conversationId → conversations.id` |
| `channel_connections` | Bot configurations | `channel_connections.tenantId → tenants.id` |
| `mcp_servers` | External MCP integrations | `mcp_servers.tenantId → tenants.id` |
| `agent_profile_mcp_bindings` | Agent ↔ MCP mappings | FK to both tables |
| `tenant_skills` | Enabled tools per tenant | `tenant_skills.tenantId → tenants.id` |
| `tenant_balances` | Credit balances | `tenant_balances.tenantId → tenants.id` |
| `ledger_transactions` | Credit ledger | `ledger_transactions.tenantId → tenants.id` |
| `usage_records` | LLM token usage | FK to tenants + conversations |
| `allowlists` | Telegram contact/group allowlists | `allowlists.tenantId → tenants.id` |
| `pairing_codes` | Telegram pairing flow | `pairing_codes.tenantId → tenants.id` |
| `oauth_clients` | OAuth 2.0 registered clients | `oauth_clients.tenantId → tenants.id` |
| `oauth_codes` | Short-lived auth codes | `oauth_codes.clientId → oauth_clients.id` |
| `oauth_tokens` | 30-day access tokens | `oauth_tokens.clientId → oauth_clients.id` |
| `api_tokens` | OpenAI-compatible API tokens | `api_tokens.tenantId → tenants.id` |
| `tenant_provider_keys` | BYOK encrypted provider keys | `tenant_provider_keys.tenantId → tenants.id` |
| `workspace_revisions` | Agent file version history | FK to agent_profiles + tenants |
| `credentials` | Encrypted credential vault | FK to tenants, optional FK to agent_profiles |
| `exec_audit_log` | Command execution audit trail | FK to tenants, optional FKs to agents + conversations |
| `exec_policy_rules` | Safety policy rules | Optional FKs to tenants + agents |
| `agent_scripts` | Saved Python scripts | FK to tenants + agent_profiles |
| `memory_entries` | Long-term agent memories (pgvector) | FK to tenants + agent_profiles |
| `scheduled_jobs` | Cron/interval/one-time jobs | FK to tenants + agent_profiles |
| `job_runs` | Job execution history | FK to scheduled_jobs + tenants |
| `agent_delegations` | Multi-agent delegation log | FK to tenants + agent_profiles (source + target) |
| `installed_plugins` | Platform plugin registry | — |
| `tenant_plugin_configs` | Per-tenant plugin overrides | FK to tenants + installed_plugins |

---

# Appendix B — Agent Runtime Message Flow

```
                     Inbound Message
                          │
                    ┌─────▼─────┐
                    │  Credit    │ ← Check tenant_balances
                    │ Pre-Flight │   Reject if balance ≤ 0
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  Resolve   │ ← Find/create conversation
                    │Conversation│   by (tenantId, channel, contactId)
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  Persist   │ ← Insert to messages table
                    │  Message   │   role: "user"
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  Build     │ ← Last 20 messages
                    │  Context   │   (sliding window)
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  Resolve   │ ← Load agent profile
                    │   Agent    │   model, tools, workspace
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │   Build    │ ← SOUL.md + IDENTITY.md + MEMORY.md
                    │   System   │   + HEARTBEAT.md + KNOWLEDGE_*.md
                    │   Prompt   │   + relevant memories
                    └─────┬─────┘   + delegation context
                          │
                    ┌─────▼─────┐
                    │  Resolve   │ ← tenant key → global key
                    │ Provider   │   Anthropic / OpenAI
                    │    Key     │
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │   LLM     │ ← ProviderManager.chat()
                    │   Call    │   Streaming if supported
                    └─────┬─────┘
                          │
                   ┌──────▼──────┐
                   │ Tool Calls? │──No──┐
                   └──────┬──────┘      │
                     Yes  │             │
                          │             │
                ┌─────────▼────────┐    │
                │  Execute Tools   │    │
                │ (parallel batch) │    │
                │  Loop up to 5x   │    │
                │  (10x w/deleg.)  │    │
                └─────────┬────────┘    │
                          │             │
                    ┌─────▼─────┐       │
                    │   Final   │◄──────┘
                    │  Response │
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  Persist  │ ← Insert assistant message
                    │  Response │
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  Billing  │ ← Calculate cost, deduct credits
                    │           │   Record usage + ledger entry
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  Dispatch │ ← Send to channel (Telegram, API, etc.)
                    │  Response │   or return to caller
                    └───────────┘
```

---

# Appendix C — Project File Structure

```
Pulse_AI/
├── docker-compose.yml          # All services (postgres, redis, gateway, dashboard, sandbox)
├── start-dev.sh                # Development startup script
│
├── pulse/                      # Backend API Gateway
│   ├── .env                    # Environment variables
│   ├── .env.example            # Template
│   ├── package.json            # Dependencies (fastify, grammy, drizzle, croner, etc.)
│   ├── tsconfig.json
│   ├── docker/
│   │   └── python-sandbox/
│   │       ├── Dockerfile      # Python 3.12-slim + 18 packages
│   │       └── requirements.txt
│   └── src/
│       ├── index.ts            # Entry point — boots Fastify, scheduler, plugins
│       ├── config.ts           # Environment variable definitions
│       │
│       ├── gateway/
│       │   ├── server.ts       # Route registration (all HTTP endpoints)
│       │   ├── oauth.ts        # OAuth 2.0 endpoints
│       │   └── routes/
│       │       ├── webhooks.ts       # Telegram webhooks
│       │       ├── cron-webhooks.ts  # Cron trigger webhooks
│       │       ├── mcp.ts            # MCP protocol
│       │       ├── config-api.ts     # Config hot-reload API
│       │       ├── openai-compat.ts  # /v1/chat/completions, /v1/models
│       │       └── open-responses.ts # /v1/responses
│       │
│       ├── agent/
│       │   ├── runtime.ts      # Core message processing pipeline
│       │   ├── tools/
│       │   │   ├── registry.ts        # Tool registration + per-tenant loading
│       │   │   ├── tool.interface.ts  # Tool type definitions
│       │   │   ├── credential-vault.ts # AES-256-GCM credential storage
│       │   │   ├── built-in/
│       │   │   │   ├── time.ts          # get_current_time
│       │   │   │   ├── calculator.ts    # calculator
│       │   │   │   ├── exec.ts          # exec (shell commands)
│       │   │   │   ├── process.ts       # process (background sessions)
│       │   │   │   ├── vault.ts         # credential_list
│       │   │   │   ├── python.ts        # python_execute
│       │   │   │   ├── script-store.ts  # script_save/load/list
│       │   │   │   ├── memory-tools.ts  # memory_store/search/forget
│       │   │   │   ├── schedule.ts      # schedule_job/once, list_jobs, cancel_job
│       │   │   │   ├── delegate.ts      # delegate_to_agent
│       │   │   │   ├── agent-mgmt.ts    # list_agents
│       │   │   │   ├── sandbox.ts       # Legacy Docker sandbox
│       │   │   │   └── sandbox-config.ts # Enhanced sandbox config
│       │   │   └── safety/
│       │   │       ├── exec-policy.ts         # Central policy engine
│       │   │       ├── dangerous-patterns.ts  # 18 blacklist patterns
│       │   │       ├── obfuscation-detect.ts  # 12 obfuscation detectors
│       │   │       ├── safe-commands.ts       # Whitelist of safe binaries
│       │   │       └── audit-log.ts           # DB audit logging
│       │   ├── workspace/
│       │   │   ├── workspace-service.ts  # File management + prompt building
│       │   │   └── templates/            # API reference templates
│       │   │       ├── ERPNEXT_API.md
│       │   │       ├── QUICKBOOKS_API.md
│       │   │       ├── PASTEL_API.md
│       │   │       ├── XERO_API.md
│       │   │       ├── PYTHON_PATTERNS.md
│       │   │       └── REST_API_GENERAL.md
│       │   └── orchestration/
│       │       ├── agent-delegation.ts  # Delegation logic + depth checking
│       │       ├── agent-registry.ts    # Discover delegatable agents
│       │       └── agent-router.ts      # Route to correct agent
│       │
│       ├── memory/
│       │   ├── memory-service.ts   # Store, search, forget, getRelevantContext
│       │   ├── embedding.ts        # OpenAI text-embedding-3-small
│       │   ├── hybrid-search.ts    # Vector + FTS combined search
│       │   ├── temporal-decay.ts   # Recency weighting
│       │   └── mmr.ts              # Maximal Marginal Relevance
│       │
│       ├── cron/
│       │   ├── scheduler.ts        # Cron/interval/once job scheduling
│       │   ├── job-runner.ts       # Execute jobs as agent messages
│       │   ├── job-store.ts        # DB persistence
│       │   └── webhook-trigger.ts  # External webhook → job execution
│       │
│       ├── plugins/
│       │   ├── manager.ts     # Plugin lifecycle management
│       │   ├── discovery.ts   # Find plugins in DB + filesystem
│       │   ├── loader.ts      # Dynamic import of plugin files
│       │   ├── hooks.ts       # Priority-ordered hook registry
│       │   └── sdk/
│       │       ├── types.ts   # Plugin interfaces for authors
│       │       └── index.ts   # SDK exports
│       │
│       ├── storage/
│       │   ├── schema.ts      # Drizzle ORM table definitions (30+ tables)
│       │   ├── db.ts          # Database connection
│       │   └── migrations/    # 17 SQL migration files
│       │
│       └── utils/
│           ├── logger.ts      # Pino logger
│           └── crypto.ts      # AES-256-GCM encrypt/decrypt
│
├── dashboard/                  # Next.js Admin Dashboard
│   ├── package.json
│   └── src/app/
│       ├── page.tsx                          # Landing page
│       ├── login/page.tsx                    # Tenant login
│       ├── oauth/authorize/page.tsx          # OAuth consent
│       ├── admin/                            # Admin panel (12 pages)
│       │   ├── page.tsx                      # Platform overview
│       │   ├── login/page.tsx                # Admin login
│       │   ├── tenants/page.tsx              # Tenant list
│       │   ├── tenants/[tenantId]/page.tsx   # Tenant detail
│       │   ├── tenants/[tenantId]/approvals/ # Pairing approvals
│       │   ├── tenants/[tenantId]/credentials/ # View credentials
│       │   ├── users/page.tsx                # User management
│       │   ├── conversations/page.tsx        # All conversations
│       │   ├── conversations/[id]/page.tsx   # Conversation detail
│       │   ├── usage/page.tsx                # Platform analytics
│       │   ├── plugins/page.tsx              # Plugin management
│       │   └── settings/
│       │       ├── page.tsx                  # Global settings hub
│       │       ├── exec-safety/page.tsx      # Exec safety config
│       │       ├── sandbox/page.tsx          # Python sandbox config
│       │       ├── memory/page.tsx           # Memory system config
│       │       └── scheduling/page.tsx       # Scheduling config
│       └── dashboard/                        # Tenant dashboard (17 pages)
│           ├── page.tsx                      # Workspace overview
│           ├── onboarding/page.tsx           # First-time setup
│           ├── agents/page.tsx               # Agent list
│           ├── agents/[id]/page.tsx          # Agent workspace
│           ├── agents/[id]/safety/           # Per-agent safety
│           ├── agents/[id]/memory/           # Agent memories
│           ├── agents/[id]/schedules/        # Cron jobs
│           ├── agents/[id]/delegation/       # Multi-agent config
│           ├── agents/[id]/knowledge/        # Knowledge templates
│           ├── agents/[id]/scripts/          # Saved scripts
│           ├── agents/orchestration/         # Orchestration overview
│           ├── conversations/page.tsx        # Tenant conversations
│           ├── conversations/[id]/page.tsx   # Conversation thread
│           ├── mcp/page.tsx                  # MCP servers
│           ├── usage/page.tsx                # Usage analytics
│           └── settings/
│               ├── page.tsx                  # Settings (6 tabs)
│               ├── credentials/page.tsx      # Credential vault
│               └── plugins/page.tsx          # Plugin toggles
│
└── docs/
    └── HOWTO.md                # This file
```
