These are the terms you'll hit throughout the dashboard and the rest of these docs. Each entry is deliberately short — follow the link for the full page.

## Agent Profile

The unit of "an AI that does something" in Pulse — one row in `agentProfiles`: a name, a model, a system prompt, and JSON config for tool policy, sandbox, heartbeat, and delegation. Everything else on this page (tools, channels, memory, automation) attaches to an Agent Profile. See [Profile, Soul & Identity](/docs/agents/profile).

## Soul & Identity

An agent's persona isn't one field — it's a stack of markdown files in a per-agent workspace directory (`SOUL.md` for personality/values, `IDENTITY.md` for name/vibe/avatar, plus `MEMORY.md`, `USER.md`, `TOOLS.md`, `BOOTSTRAP.md`, `AGENTS.md`, `HEARTBEAT.md`) that get concatenated into the system prompt on every message, in a fixed order. Agents with **Self-Config** enabled can rewrite these files themselves via a `workspace_update` tool call. Full detail: [Profile, Soul & Identity](/docs/agents/profile).

## Tools vs. Skills — the distinction that actually matters

These two words get used loosely everywhere, including inside the dashboard's own labels, but in the code they mean different things:

- A **tool** is a capability the model can call — a function with a name, a description, and a JSON schema, executed server-side when the LLM asks for it (send email, run a shell command, hit a custom API). An agent's actual tool list at runtime is assembled from several independent sources: the built-in tool library, MCP server bindings, installed plugins, per-tenant Custom Tools, and Server (SSH) access — then filtered by that agent's Tool Policy.
- A **skill** (in the agent editor's **Skills** section) is a short markdown document injected into the system prompt to teach the model *how* to use a tool it already has — conventions, patterns, gotchas. Toggling a skill on doesn't grant the tool it talks about; it only adds guidance for a tool that has to already be present.
- **The confusing part:** whether a *built-in* tool exists for an agent at all — `calculator`, `exec`, `memory_store`, `schedule_job`, `email_send`, `delegate_to_agent`, and the rest — is decided by a `tenant_skills` database table (yes, also called "skills," a third meaning), matched by tool name. There is no dashboard page, tenant-side or admin-side, that writes to this table. A new tenant starts with none of these built-in tools enabled; they're switched on by inserting rows directly (there's a seed script for it), not through the UI. MCP tools, plugin tools, custom tools, and server tools are **not** gated by `tenant_skills` — those really are self-serve from the dashboard.

Read [Tools & Skills](/docs/agents/tools) for the full breakdown of every tool source, and [Tool Policy](/docs/agents/tool-policy) for the layer above all of them.

## Tool Policy

A per-agent allow-list, deny-list, and "ask" list (`agentProfiles.toolPolicy`) applied after every other tool source has contributed its tools. `deny` removes a tool outright; `ask` routes that specific tool call through the same human-approval flow used elsewhere (a Telegram card, Allow/Deny). It can only restrict tools the agent already has — it's not a way to grant one. See [Tool Policy](/docs/agents/tool-policy).

## Channels

A channel is where a message comes from and where the reply goes. **Telegram** is the one channel that's a fully-shipped inbound adapter — connect a bot per agent and it just works ([Telegram](/docs/setup/telegram)). **Email** is tool-driven: an agent sends, reads, and replies to mail because it (or a schedule) decided to, not because an inbound email started a conversation the way a Telegram message does ([Email](/docs/setup/email)). The desktop client and any programmatic integration talk to agents over the App API / an OpenAI-compatible endpoint rather than a channel adapter in this sense.

## Departments

Pulse can model a tenant as a small org chart instead of one agent talking to one person: a **Department** (or nested **Group**) is a channel with a **lead agent** that answers by default and can route work to teammates or, via `@mention`, to a specific agent directly. Humans in a department have `talk` (can post) or `observe` (read-only) access. This is real and shipped for the flat case; nested departments and cross-department routing are still being built. See [Departments & channels](/docs/departments).

## Routing

Outside a department, which agent answers a given message is decided by **routing rules** (`routing_rules`: match by contact, group, keyword, or "channel default", ranked by priority) — falling back to the tenant's first enabled agent if nothing matches. Inside a department, routing is bypassed in favor of the lead/`@mention` logic above. See [Message routing](/docs/routing).

## People

A record (`people`, keyed by Telegram user ID today) of who's allowed to talk to your agents on Telegram, whether they can approve gated actions (`isApprover`), and whether their own messages need approval before an agent acts on them (`approvalMode`). See [People & approvers](/docs/people).

## Approvals

A human-in-the-loop gate: a **pending approval** is created either because a person's `approvalMode` requires it or because a Tool Policy marked a tool `ask`. Every approver gets a card with Allow / Deny / Allow-always buttons; "Allow always" writes a persistent, revocable **approval allowance** so the same kind of request stops asking. See [Approval gates](/docs/approvals).

## Standing Orders

Per-agent "operating programs" — scope, trigger, steps, approval gates, escalation, and boundaries, all free text — injected straight into the agent's system prompt so it runs a routine autonomously and knows when to escalate instead of guessing. See [Standing Orders](/docs/automation/standing-orders).

## Schedules

Cron, fixed-interval, or one-shot jobs (`scheduled_jobs`) that fire a message to a specific agent — inbox checks, recurring reports, reminders — with retry and run-history tracking (`job_runs`). See [Schedules & cron](/docs/automation/schedules).

## Heartbeat

A recurring, lighter-weight self-check separate from Schedules: an agent reads its own `HEARTBEAT.md` on a timer to decide if anything needs proactive attention, using a minimal prompt mode rather than a full conversational turn. Configured per-agent in the **Heartbeat** section. See [Heartbeat](/docs/automation/heartbeat).

## Commitments

Things an agent promised to follow up on (`commitments`: a summary and a due time), tracked independently of any specific conversation and delivered back to the right channel when they come due. See [Commitments & follow-ups](/docs/automation/commitments).

## Memory

Two different mechanisms share the word "memory." Passive recall — relevant past context pulled in automatically and injected into the prompt — runs on every turn regardless of what tools the agent has. Explicit memory management via the `memory_store` / `memory_search` / `memory_forget` tools is a built-in tool set, so it's subject to the same `tenant_skills` gating described above. There's also `MEMORY.md`, the curated workspace file the agent (or you) can write to directly. See [Memory](/docs/agents/memory).

## Plugins

Larger, self-contained integrations (ERPNext, OneDrive, web search, browser control, and more) installed at the platform level and then enabled per tenant. Installing one requires an admin to approve its declared permissions (`installedPlugins.approvedHash` must match its manifest hash) before a tenant can turn it on in **Settings → Plugins**. See [Plugins](/docs/tools/plugins).

## MCP

Model Context Protocol — attach any MCP server (a URL + optional auth headers) and bind it to specific agents; every tool that server exposes becomes available to those agents. See [MCP servers](/docs/tools/mcp).

## Custom Tools

Per-tenant, no-code HTTP tools: define a name, an HTTP method, a URL template with `{param}` placeholders, and a parameter schema, and it becomes a callable tool for whichever agents you scope it to. Auth headers are encrypted at rest. See [Custom Tools](/docs/tools/custom).

## Servers

A registered SSH-reachable server an agent can operate under guard rails — command safety is enforced in code based on a per-server safety mode, and access is default-deny: a server with no agents explicitly assigned is usable by nobody. See [Servers (SSH)](/docs/tools/servers).
