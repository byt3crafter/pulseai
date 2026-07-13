Pulse AI gives your business a team of AI agents that you configure, not code. Each agent has a persona, a set of things it's allowed to do, and a way for people to reach it — Telegram today, with more channels planned. Where it matters, an agent checks with a human before it acts. This page is a short tour of what that looks like in practice; the [Quickstart](/dashboard/docs/quickstart) walks you through building your first agent.

## An agent is a persona plus a job

Every agent starts from a plain-language description of who it is and what it's for — a sales assistant, a support triager, an inbox manager. You write that description once when you create the agent, and refine it any time from the agent's own settings page: its personality and tone, its name and avatar, what it should remember, and how it should behave. See [Profile, Soul & Identity](/dashboard/docs/agents/profile).

What an agent is allowed to *do* is a separate question from who it *is*. An agent's tools — sending email, searching the web, calling one of your own systems — come from several places at once, and a **Tool Policy** sits on top of all of them deciding what's allowed, denied, or needs a human's sign-off first. This is one of the more confusing parts of the dashboard if nobody explains it, so [Core concepts](/dashboard/docs/concepts) spells it out plainly, and [Tools & Skills](/dashboard/docs/agents/tools) goes deeper.

## Where it can talk to people

**Telegram** is the fastest way to put an agent in front of your team or your customers today — connect a bot and people can message it directly, in a DM or a group. See [Telegram](/dashboard/docs/setup/telegram).

**Email** works differently: an agent doesn't sit and wait for mail to trigger a reply the way it does on Telegram. Instead, it checks, reads, drafts, and sends mail because it decided to — in the moment, or on a schedule you set up. See [Email](/dashboard/docs/setup/email).

You can also reach an agent through Pulse's API, or through a desktop app, if your team builds against either.

## A human stays in control

For anything sensitive — sending an email under your company's name, running a command on a real server, spending money — you can require a person to approve the action before it happens. The agent drafts what it wants to do, a designated approver sees exactly what that is, and nothing happens until someone says yes. See [Approval gates](/dashboard/docs/approvals) and [People & approvers](/dashboard/docs/people).

## More than one agent working together

Beyond a single agent answering a single person, Pulse can model your company as a small org chart: a **Department** groups a lead agent with its teammates, the lead answers and routes work by default, and anyone can address a specific agent directly with an `@mention`. This is real and works today for a single flat layer of departments; connecting departments to each other and building out deeper hierarchies are still on the roadmap. See [Departments & channels](/dashboard/docs/departments) and [Message routing](/dashboard/docs/routing).

## What to expect on day one

> **Telegram is the channel that works out of the box; email is tool-driven, not inbound.** Connecting a Telegram bot gives you a live conversation immediately. Email needs an agent to decide to check the inbox — on its own, or on a schedule — rather than an incoming message starting the conversation the way a Telegram message does.
>
> **Built-in tools are switched on for your workspace, not toggled by you.** The standard library of tools — sending email, running scheduled checks, remembering things across conversations, and more — is provisioned for your account during onboarding. If a tool you expect isn't available to your agent, that's not a setting you're missing; contact your Pulse administrator.

## Where to go next

- [Quickstart](/dashboard/docs/quickstart) — the fastest real path from an empty workspace to a working agent.
- [Core concepts](/dashboard/docs/concepts) — the vocabulary: agents, tools vs. skills, channels, approvals, automation.
- [AI providers](/dashboard/docs/setup/providers) — connect a model.
- [Security & your data](/dashboard/docs/security) — encryption, roles, audit log, SSO, 2FA.
