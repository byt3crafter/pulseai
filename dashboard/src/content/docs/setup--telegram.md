Telegram is the fastest way to put an agent in front of your team: no app to install, just a chat. This page covers creating a bot, where the token goes, and — because Pulse lets you connect more than one bot — exactly which agent answers on which bot.

## Create a bot

1. Open Telegram, message **@BotFather**.
2. Send `/newbot`, give it a name and a username (must end in `bot`, e.g. `acmesupport_bot`).
3. BotFather replies with a token that looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`. Copy it — you won't see it again without regenerating it.

## Two places to connect a bot — they do different things

Pulse supports a bot token in two places, and they are **not** the same connection:

| Where | What it creates | Who answers |
|---|---|---|
| **Settings → Telegram** | The workspace-wide "default" bot | Whichever agent your routing rules pick |
| **Agent Profiles → an agent → Telegram section** | A bot dedicated to that one agent | Always that agent, regardless of routing |

You can run just the default bot, just one or more per-agent bots, or a mix — a support team might give its lead agent a dedicated `@acmesupport_bot` while every other agent only answers through the shared default bot.

> **A Telegram bot is bound to exactly one connection, and a connection is bound to at most one agent.** You cannot point two different agents at the same bot token — connecting a token that's already in use as a per-agent bot for one agent, then reusing it elsewhere, will overwrite that binding.

### Which bot answers, if you have several

When Pulse sends a reply, it has to pick which of your active bots to send it through. The priority is:

1. An agent-scoped bot whose agent matches exactly — always wins.
2. Otherwise, the workspace-wide default bot, if one exists.
3. Otherwise, any other connection that happens to match the agent.
4. Otherwise, the first bot your workspace has connected, so something answers rather than nothing.

Practically: if an agent has its own bot, replies always go out through that bot. Everything else falls back to the default bot from Settings → Telegram.

## Inbound flow

1. A person DMs the bot, or mentions/replies to it in a group.
2. Once you've saved the token, Pulse connects to Telegram automatically to receive messages — there's nothing further to set up on your end.
3. Pulse checks, in order: your DM/group policy below, the account-wide [People](/dashboard/docs/people) access setting (a blocked contact gets silence; an observe-only contact gets a one-time "ask an admin" notice), and — if that person's approval setting requires it — an approval card sent to your approvers before the message is even handed to the agent.
4. The message reaches the agent's normal reply flow, same as any other channel.

### DM and group policy (Settings → Telegram)

- **DM Policy** — Open (anyone can DM the bot, default), Pairing (a new contact gets a one-time code they must give an admin to approve), or Disabled.
- **Group Policy** — Disabled (default — the bot ignores groups entirely until you turn this on), Open, or Allowlist (a group must be pre-approved).
- **Require @mention in Groups** — on by default; the bot only responds in a group if it's `@mentioned` or the message is a reply to one of its own messages, so it doesn't answer every message in a busy group.

## Approval cards and DMs

When an agent's action needs a human sign-off (see [Approval gates](/dashboard/docs/approvals)), Pulse DMs every designated approver an inline card with Approve/Deny buttons through Telegram. This uses the same bot-selection priority above — if the agent that triggered the request has its own bot, the card comes from that bot; otherwise it comes from your default bot. Anyone can tap the buttons, but the tap is checked server-side against your actual approver list — a non-approver tapping "Approve" gets a silent "Not authorized" message and nothing changes.

## Photos and vision

If a message includes a photo, Pulse hands it to the agent's model as an image — as long as the model you've selected can see images and **Photo understanding (vision)** (Settings → Telegram, on by default) hasn't been turned off. With it off, or on a model that can't see images, the agent is simply told "a photo arrived" without being able to view it.

## Formatting

Agent replies are converted to Telegram's own rich-text formatting and split to stay under Telegram's message length limit. If Telegram rejects the formatting for some reason, Pulse automatically retries the same message as plain text rather than dropping it.

## Related

- [People & approvers](/dashboard/docs/people) — the account-wide access setting that sits on top of the DM/group policy above.
- [Approval gates](/dashboard/docs/approvals) — how a Telegram approval card is created and decided.
- [Departments & channels](/dashboard/docs/departments) — routing a group conversation between multiple agents, once a bot is answering in a group.
