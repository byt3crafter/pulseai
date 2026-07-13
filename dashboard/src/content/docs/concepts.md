These are the terms you'll hit throughout the dashboard and the rest of these docs. Each entry is deliberately short — follow the link for the full page.

## Agent

The basic unit of "an AI that does something" in Pulse: a name, a model, a persona, and configuration for tools, approvals, and automation. Everything else on this page — tools, channels, memory, automation — attaches to an agent. See [Profile, Soul & Identity](/dashboard/docs/agents/profile).

## Soul & Identity

An agent's persona isn't one text box — the agent editor splits it across several sections: **Soul** (personality, values, how it should sound), **Identity** (name, avatar, vibe), plus **Memory**, **User**, and **Bootstrap** notes, all combined every time the agent replies. If **Self-Config** is on for an agent (it is, by default, for a new one), it can update these sections itself when you ask it to in conversation. Full detail: [Profile, Soul & Identity](/dashboard/docs/agents/profile).

## Tools vs. Skills — the distinction that actually matters

These two words get used loosely everywhere, including on the dashboard's own tabs, but they mean different things:

- A **tool** is a capability the model can call — send an email, run a shell command, hit one of your own APIs. An agent's actual tool list at any moment is put together from several sources at once: the standard built-in library, any MCP servers you've connected, installed plugins, your own Custom Tools, and any Server (SSH) access you've granted — then filtered by that agent's Tool Policy.
- A **Skill**, in the agent editor's **Skills** section, is a short guidance document injected into the agent's instructions to teach it *how* to use a tool it already has — conventions, patterns, gotchas. Turning a skill on doesn't grant the tool it talks about; it only adds guidance for a tool that has to already be present.
- **The confusing part:** whether a built-in tool — send email, search memory, run a scheduled check, delegate to another agent, and the rest — exists for your agent at all is decided during onboarding, for your whole workspace, not per agent and not from a dashboard toggle. A brand-new workspace starts with none of these built-in tools switched on; they're turned on for you as part of setup. MCP tools, plugin tools, Custom Tools, and Server tools are **not** part of that provisioning step — those really are self-serve from the dashboard.

Read [Tools & Skills](/dashboard/docs/agents/tools) for the full breakdown of every tool source, and [Tool Policy](/dashboard/docs/agents/tool-policy) for the layer above all of them.

## Tool Policy

A per-agent allow-list, deny-list, and "ask" list, applied on top of every tool source described above. `deny` removes a tool outright; `ask` routes that specific tool call through the same human-approval flow used elsewhere — a Telegram card with Allow/Deny. It can only restrict tools the agent already has; it's not a way to grant one. See [Tool Policy](/dashboard/docs/agents/tool-policy).

## Channels

A channel is where a message comes from and where the reply goes. **Telegram** is the channel that works as a live, two-way conversation out of the box — connect a bot per agent and it just works ([Telegram](/dashboard/docs/setup/telegram)). **Email** is tool-driven: an agent sends, reads, and replies to mail because it (or a schedule) decided to, not because an incoming email starts a conversation the way a Telegram message does ([Email](/dashboard/docs/setup/email)). A desktop client and any API integration your team builds talk to agents directly rather than through a channel in this sense.

## Departments

Pulse can model your company as a small org chart instead of one agent talking to one person: a **Department** (or nested **Group**) is a shared space with a **lead agent** that answers by default and can route work to teammates, or — with an `@mention` — you can address a specific agent directly. People in a department have **talk** (can post) or **observe** (read-only) access. This is real and works today for a single flat layer; connecting departments to each other and deeper org charts are still on the roadmap. See [Departments & channels](/dashboard/docs/departments).

## Routing

Outside a department, which agent answers a given message is decided by routing rules — matched by contact, group, keyword, or a channel default, ranked by priority — falling back to your workspace's first enabled agent if nothing matches. Inside a department, routing is set aside in favor of the lead/`@mention` logic above. See [Message routing](/dashboard/docs/routing).

## People

A record of who's allowed to talk to your agents on Telegram, whether they're allowed to approve gated actions, and whether their own messages need approval before an agent acts on them. See [People & approvers](/dashboard/docs/people).

## Approvals

A human-in-the-loop gate: a pending approval is created either because a person's approval setting requires it, or because a Tool Policy marked a tool `ask`. Every approver gets a card with Allow / Deny / Allow-always buttons; "Allow always" creates a standing, revocable exception so the same kind of request stops asking. See [Approval gates](/dashboard/docs/approvals).

## Standing Orders

Per-agent operating instructions — scope, trigger, steps, approval gates, escalation, and boundaries, all written in plain language — that run the agent through a routine on its own and tell it when to stop and escalate instead of guessing. See [Standing Orders](/dashboard/docs/automation/standing-orders).

## Schedules

Cron, fixed-interval, or one-shot jobs that fire a message to a specific agent — inbox checks, recurring reports, reminders — with retry and a run history you can review. See [Schedules & cron](/dashboard/docs/automation/schedules).

## Heartbeat

A recurring, lighter-weight self-check separate from Schedules: an agent looks at its own notes on a timer to decide whether anything needs proactive attention, without running a full conversation. Configured per-agent in the **Heartbeat** section. See [Heartbeat](/dashboard/docs/automation/heartbeat).

## Commitments

Things an agent promised to follow up on — a summary and a due time — tracked independently of any one conversation and delivered back to the right channel when they come due. See [Commitments & follow-ups](/dashboard/docs/automation/commitments).

## Memory

Two different things share the word "memory." Passive recall — relevant past context pulled in automatically — runs on every turn regardless of what tools the agent has. Explicit memory management, where the agent deliberately stores, searches, or forgets something, is part of the built-in tool library, so it's subject to the same workspace provisioning described above. There's also a curated memory note the agent (or you) can write to directly. See [Memory](/dashboard/docs/agents/memory).

## Plugins

Larger, self-contained integrations — ERPNext, OneDrive, web search, browser control, and more — installed at the platform level and then enabled per workspace. Before you can turn one on in **Settings → Plugins**, your Pulse administrator approves it for your workspace. See [Plugins](/dashboard/docs/tools/plugins).

## MCP

Model Context Protocol — attach any MCP server (a URL and optional auth) and bind it to specific agents; every tool that server exposes becomes available to those agents. See [MCP servers](/dashboard/docs/tools/mcp).

## Custom Tools

No-code HTTP tools you define yourself: a name, an HTTP method, a URL with placeholders for parameters, and a parameter list — it becomes a callable tool for whichever agents you scope it to. Auth headers are encrypted. See [Custom Tools](/dashboard/docs/tools/custom).

## Servers

A server you register for SSH access, which an agent can then operate under guard rails — command safety is enforced based on the safety mode you set per server, and access is default-deny: a server with no agents explicitly assigned is usable by nobody. See [Servers (SSH)](/dashboard/docs/tools/servers).
