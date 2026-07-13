This walks through the real dashboard flow — every step below names the exact page you'll be on. It gets you to an agent that replies to a message; it doesn't cover every setting, and it's straight about the one step (turning on tools) where availability is provisioned for you rather than toggled by you.

## 1. Connect an AI provider

Go to **Settings → AI Providers**. Pick a provider from the "Add a provider" dropdown, paste an API key, and save. Anthropic is the default model family if an agent has no model set; Google's Gemini has a free tier if you just want to try things without a card. Full details, including how Pulse decides which key to use, are in [AI providers](/dashboard/docs/setup/providers).

> Skip this and your agent will still be created — it just won't be able to reply. Pulse checks for a usable provider key before calling the model and shows a "Setup required" message pointing back at this page instead of a generic error.

## 2. Create an agent

Go to **Agent Profiles → New**. You get an AI-assisted starting point: describe the agent in a sentence or two ("A friendly sales assistant for Acme, a logistics firm — answers product questions, drafts quotes, checks order status") and Pulse drafts a name and a full persona for you to review and edit before saving. You can also skip the AI draft and fill in the name and persona yourself.

**Self-Config is on by default** for a new agent, meaning it can update its own persona and settings when you ask it to in conversation — you don't have to opt into that, you'd have to opt out.

## 3. Shape its persona

Open the agent you just created. The section rail on the left has **Profile**, **Soul**, **Identity**, **Memory**, and more. The description you wrote at creation lives in **Soul**; **Identity** is name, vibe, and avatar; **Bootstrap** is a first-run script the agent reads once when it starts talking to someone new. See [Profile, Soul & Identity](/dashboard/docs/agents/profile) for what each section is for.

## 4. Decide what it's allowed to do

This is the step most likely to surprise you, so read it before you go looking for a toggle that isn't there.

The agent editor has three sections that sound like they control tools, and mostly don't:

| Section | What it actually does |
|---|---|
| **Tools** | A free-text notebook for your own reference — server names, device nicknames, that kind of thing. Does **not** enable or disable any tool. |
| **Skills** | Turns on/off short guidance documents that teach the model *how* to use a tool it already has (memory, scheduling, email conventions, and so on). Turning a skill on doesn't grant the tool it talks about if that tool isn't available to the agent in the first place. |
| **Tool Policy** | An allow/deny/ask filter over whatever tools the agent *already has* from elsewhere. It can restrict, and it can require human approval per call — it can't add a tool the agent was never given. See [Tool Policy](/dashboard/docs/agents/tool-policy). |

> **The standard library of built-in tools — sending email, running scheduled checks, remembering things, delegating to another agent, and more — is switched on for your workspace during onboarding, not from a toggle in the dashboard.** A brand-new workspace starts with none of these enabled. If you configure an agent's mailbox in the **Email** section and it still can't send mail, this is why: the mailbox is connected, but the send tool itself hasn't been granted yet. If a tool you expect isn't available to your agent, contact your Pulse administrator.

What **is** self-serve from the dashboard, with no help needed from anyone else:

- **Sandbox** (agent editor) — turn on code execution for this agent.
- **Self-Config** (Profile section) — lets the agent edit its own settings (on by default, see step 2).
- **Custom Tools** (left nav) — wire up your own HTTP API as a tool, no code. See [Custom Tools](/dashboard/docs/tools/custom).
- **MCP Servers** (left nav) — attach any MCP server and bind it to an agent. See [MCP servers](/dashboard/docs/tools/mcp).
- **Servers** (left nav) — register a real server for SSH access and explicitly assign this agent to it. See [Servers (SSH)](/dashboard/docs/tools/servers).
- **Settings → Plugins** — enable a plugin your administrator has already approved. See [Plugins](/dashboard/docs/tools/plugins).

For a full breakdown of tools vs. skills, read [Tools & Skills](/dashboard/docs/agents/tools).

## 5. Talk to it

Two real ways to do this today:

**Fastest — an API call, no bot setup.** Go to **Settings → API & Developer**, click **Generate New API Token**, and call the OpenAI-compatible endpoint with it:

```bash
curl https://your-pulse-domain/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "pulse:YOUR_AGENT_ID",
    "messages": [{ "role": "user", "content": "Hey, who are you?" }]
  }'
```

Leave `model` off (or drop the `pulse:` prefix) and it falls back to your workspace's first agent.

**For real usage — give it a Telegram bot.** Open the agent's **Telegram** section, follow the setup in [Telegram](/dashboard/docs/setup/telegram), and message the bot directly. A human sends a message, the agent replies — no calls or polling required on your end.

## What you have now

An agent with a persona, a model, and (if you did step 4) a real capability or two, reachable over the API and/or Telegram. From here:

- [Core concepts](/dashboard/docs/concepts) for the full vocabulary.
- [Departments & channels](/dashboard/docs/departments) if you want more than one agent working together.
- [Standing Orders](/dashboard/docs/automation/standing-orders) and [Schedules & cron](/dashboard/docs/automation/schedules) to make it proactive instead of purely reactive.
