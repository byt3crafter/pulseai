Pulse AI is a multi-tenant platform for running AI agents that have a persona, a set of tools, and a place to talk to people — Telegram, email, an API, or a chat app your team builds against. You run one deployment (one gateway, one dashboard, one Postgres database); each of your customers or business units is a **tenant** with its own agents, keys, and conversation history, fully isolated from every other tenant's.

## The two codebases, one database

Pulse ships as two services that share a single schema:

| Codebase | What it is | Tech |
|---|---|---|
| `pulse/` | The API gateway — receives messages, runs the agent loop, calls the LLM, executes tools | Fastify 5 + TypeScript + Node.js |
| `dashboard/` | The admin/tenant web app — where you configure agents, providers, channels, and settings | Next.js 16 + React 19 + Tailwind CSS 4 |

Both talk to the same PostgreSQL database through Drizzle ORM. The schema is defined once (`pulse/src/storage/schema.ts`) and copied into the dashboard so both sides stay in sync. Nothing about an agent, a tool, or a conversation lives in two places — the dashboard is a UI over the same rows the gateway reads and writes at runtime.

## What happens when someone sends a message

A message — say, a Telegram DM — takes this path through the gateway:

```
Telegram / API token / desktop app
        ↓
pulse/src/gateway/server.ts        Fastify HTTP + WebSocket entrypoint
        ↓
pulse/src/queue/                   BullMQ + Redis (or a synchronous fallback if Redis isn't configured)
        ↓
pulse/src/agent/runtime.ts         AgentRuntime.processMessage() — the core loop
        ↓
pulse/src/agent/providers/         Routes the call to Anthropic / OpenAI / Codex / Google / Groq / OpenRouter / MiniMax
        ↓
pulse/src/agent/tools/registry.ts  Resolves which tools this agent actually has, executes tool calls
        ↓
Reply sent back through the same channel
```

`AgentRuntime.processMessage()` is the one function that does all of this for every inbound message, regardless of channel: it resolves which agent should answer, loads that agent's persona and enabled tools, calls the LLM (looping on tool calls up to a fixed iteration budget), strips any chain-of-thought the model leaked into its answer, records token usage against the tenant's balance, and dispatches the reply.

## An agent, concretely

An **Agent Profile** (`agentProfiles` table) is a row with a name, a model, a system prompt, and a handful of JSON config blobs (tool policy, sandbox settings, heartbeat schedule, delegation config). In the dashboard it's a single editor page with a section rail — Profile, Soul, Identity, Memory, Heartbeat, User, Bootstrap, Agents, Tools, Skills, Tool Policy, Sandbox, Standing Orders, Email, Telegram, Revisions. On disk it also has a workspace directory of markdown files (`SOUL.md`, `IDENTITY.md`, `MEMORY.md`, and others) that get assembled into its system prompt on every turn — see [Profile, Soul & Identity](/docs/agents/profile) for exactly how.

What an agent can *do* is a separate question from who it *is*. Tools are capabilities the model can call (send email, run a shell command, hit your API); which tools are actually switched on for a given agent comes from several independent sources at once — built-in tools, MCP servers, custom HTTP tools, SSH-guarded server access, and installed plugins — then filtered by a per-agent allow/deny/ask **Tool Policy**. This is one of the more confusing parts of the system if you don't read the code, so [Core concepts](/docs/concepts) spells it out precisely, and [Tools & Skills](/docs/agents/tools) goes deep.

## Multi-tenancy and billing

Every tenant-facing table carries a `tenantId` column, and every query in the dashboard and the gateway filters by it — there is no cross-tenant query path by design. Before an agent runs, `AgentRuntime` checks the tenant's credit balance (`tenantBalances`) unless the platform is running in `unlimited` billing mode (used for dedicated, self-hosted deployments on the client's own provider keys); every LLM call is metered and deducted from that balance afterward, with a full ledger (`usageRecords`, `ledgerTransactions`).

## Organizing agents like a company

Beyond a single agent answering a single person, Pulse can model a customer as a small **org chart of AI**: a company (the tenant) breaks into **Departments**, which can contain **Groups**, each with a **lead agent** that answers by default and routes work to teammates or other departments. This is documented in full in [Departments & channels](/docs/departments) and [Message routing](/docs/routing) — it's real and shipped for the flat, single-level case; nested departments and cross-department routing are still being built.

## What's genuinely self-serve today, and what isn't

Not every knob described in these docs has a dashboard toggle yet. The two biggest examples:

> **Telegram is the only fully-shipped inbound channel adapter.** The gateway's channel-type registry has room for others, but only `TelegramAdapter` is actually registered at startup. Email is real, but it's tool-driven (the agent sends/reads mail when it decides to, or on a schedule) rather than an inbound trigger that starts a conversation the way a Telegram message does. The desktop app and any API-token integration talk to agents through the App API / OpenAI-compatible endpoint, not through a "channel" in this sense.

> **A tenant can't self-serve every built-in tool from the dashboard.** The classic built-in tool library — calculator, shell exec, memory, scheduling, email, delegation, and more — is gated by a `tenant_skills` table that has zero UI, tenant-side or admin-side, anywhere in the dashboard. See [Tools & Skills](/docs/agents/tools) and [Core concepts](/docs/concepts) for what that actually means in practice and which tool sources *are* self-serve (Custom Tools, MCP servers, Servers/SSH, Plugins).

## Where to go next

- [Quickstart](/docs/quickstart) — the fastest real path from an empty workspace to a working agent.
- [Core concepts](/docs/concepts) — the vocabulary: agents, tools vs. skills, channels, approvals, automation.
- [AI providers](/docs/setup/providers) — connect a model.
- [Security](/docs/security) — encryption, roles, audit log, SSO, 2FA.
