This walks through the real dashboard flow — every step below names the exact page you'll be on. It gets you to an agent that replies to a message; it does not cover every setting, and it's honest about the one step (turning on tools) that has a real gap in the dashboard today.

## 1. Connect an AI provider

Go to **Settings → AI Providers**. Pick a provider from the "Add a provider" dropdown, paste an API key, and save. Anthropic is the runtime's default if an agent has no model set (`claude-sonnet-4-20250514`); Groq has a genuinely free tier if you just want to try things without a card. Full details, including how Pulse decides which key to use and what happens when a key is missing, are in [AI providers](/docs/setup/providers).

> Skip this and your agent will still be created — it just won't be able to reply. `AgentRuntime` checks for a resolvable provider key before calling the LLM and returns a "Setup required" message pointing back at this page instead of a generic error.

## 2. Create an agent

Go to **Agent Profiles → New**. You get an AI-assisted starting point: describe the agent in a sentence or two ("A friendly sales assistant for Acme, a logistics firm — answers product questions, drafts quotes, checks order status") and Pulse drafts a name and a full system prompt for you to review and edit before saving. You can also skip the AI draft and fill in the name and prompt yourself.

Saving creates the `agentProfiles` row and initializes that agent's workspace — a directory of markdown files (`SOUL.md`, `IDENTITY.md`, `MEMORY.md`, and others) that get assembled into its system prompt on every turn. **Self-config is on by default** for a new agent, meaning it can rewrite its own workspace files (including its persona) when you tell it to in conversation — you don't have to opt into that, you'd have to opt out.

## 3. Shape its persona

Open the agent you just created. The section rail on the left has **Profile**, **Soul**, **Identity**, **Memory**, and more. The system prompt you wrote at creation lives in **Soul**; **Identity** is name/vibe/avatar; **Bootstrap** is a first-run onboarding script the agent reads once and is meant to delete. See [Profile, Soul & Identity](/docs/agents/profile) for the exact order these files get assembled in and the (real, silent) size limits per file.

## 4. Decide what it's allowed to do

This is the step most likely to surprise you, so read it before you go looking for a toggle that isn't there.

The agent editor has three sections that sound like they control tools, and they mostly don't:

| Section | What it actually does |
|---|---|
| **Tools** | Free-text notes to yourself (`TOOLS.md`) — SSH hostnames, device nicknames, that kind of thing. Does **not** enable or disable any tool. |
| **Skills** | Turns on/off short markdown documents that teach the model *how* to use tools it already has (memory, scheduling, email conventions, etc.). Turning a skill doc on doesn't grant the underlying tool if that tool isn't available in the first place. |
| **Tool Policy** | An allow/deny/ask filter over whatever tools the agent *already has* from elsewhere. It can restrict, and it can require human approval per call — it can't add a tool that was never granted. See [Tool Policy](/docs/agents/tool-policy). |

> **The built-in tool library (calculator, shell exec, `memory_store`, `schedule_job`, `email_send`, `delegate_to_agent`, and more) is gated by a `tenant_skills` database table with no dashboard control at all** — not in the tenant dashboard, not in the admin panel. A brand-new tenant has none of these switched on. If you configure an agent's mailbox in the **Email** section and it still can't send mail, this is why: the SMTP/IMAP credentials are set, but the `email_send` tool itself was never granted. Today, getting these tools turned on means asking whoever operates your Pulse deployment to insert the right rows (there's a seed script at `pulse/scripts/seed-demo-skills.sql` showing the shape).

What **is** self-serve from the dashboard, with no backend intervention:

- **Sandbox** (agent editor) — turn on code execution for this agent.
- **Self-Config** toggle (Profile section) — lets the agent edit its own workspace files (on by default, see step 2).
- **Custom Tools** (left nav) — wire up your own HTTP API as a tool, no code. See [Custom Tools](/docs/tools/custom).
- **MCP Servers** (left nav) — attach any MCP server and bind it to an agent. See [MCP servers](/docs/tools/mcp).
- **Servers** (left nav) — register a real server for SSH access and explicitly assign this agent to it. See [Servers (SSH)](/docs/tools/servers).
- **Settings → Plugins** — enable a plugin an admin has already approved. See [Plugins](/docs/tools/plugins).

For a full breakdown of tools vs. skills, read [Tools & Skills](/docs/agents/tools).

## 5. Talk to it

Two real ways to do this today:

**Fastest — an API call, no bot setup.** Go to **Settings → API & Developer**, create a token with the `chat` scope, and call the OpenAI-compatible endpoint:

```bash
curl https://your-pulse-domain/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "pulse:YOUR_AGENT_ID",
    "messages": [{ "role": "user", "content": "Hey, who are you?" }]
  }'
```

Leave `model` off (or omit the `pulse:` prefix) and it falls back to your tenant's first agent.

**For real usage — give it a Telegram bot.** Open the agent's **Telegram** section, follow the setup in [Telegram](/docs/setup/telegram), and message the bot directly. This is the only channel that's a fully-shipped inbound adapter today — a human sends a message, the agent responds, no polling or API calls required on your end.

## What you have now

An agent with a persona, a model, and (if you did step 4) a real capability or two, reachable over the API and/or Telegram. From here:

- [Core concepts](/docs/concepts) for the full vocabulary.
- [Departments & channels](/docs/departments) if you want more than one agent working together.
- [Standing Orders](/docs/automation/standing-orders) and [Schedules & cron](/docs/automation/schedules) to make it proactive instead of purely reactive.
