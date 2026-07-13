Telegram is the fastest way to put an agent in front of your team: no app to install, just a chat. This page covers creating a bot, where the token goes, and — because Pulse lets you connect more than one bot — exactly which agent answers on which bot.

## Create a bot

1. Open Telegram, message **@BotFather**.
2. Send `/newbot`, give it a name and a username (must end in `bot`, e.g. `acmesupport_bot`).
3. BotFather replies with a token that looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`. Copy it — you won't see it again without regenerating it.

## Two places to connect a bot — they do different things

Pulse supports a bot token in two places, and they are **not** the same connection:

| Where | What it creates | Who answers |
|---|---|---|
| **Settings → Telegram** | The tenant-wide "default" bot | Whichever agent the tenant-routing rules pick |
| **Agent Profiles → an agent → Telegram section** | A bot dedicated to that one agent | Always that agent, regardless of routing |

Both are rows in the same `channel_connections` table, distinguished by a `scope` flag (`"agent"` for a per-agent bot, absent/`"default"` for the tenant-wide one). You can run just the default bot, just one or more per-agent bots, or a mix — a support team might give its lead agent a dedicated `@acmesupport_bot` while every other agent only answers through the shared default bot.

> **A Telegram bot is bound to exactly one connection, and a connection is bound to at most one agent.** You cannot point two different agents at the same bot token — connecting a token that's already in use as a per-agent bot for one agent, then reusing it elsewhere, will overwrite that binding.

### Which bot answers, if a tenant has several

When Pulse sends a reply, it has to pick *which* of the tenant's active bots to send it through (`pulse/src/channels/telegram/bot-selector.ts`). The priority is:

1. An agent-scoped bot whose agent matches exactly (the agent has its own dedicated bot) — wins.
2. Otherwise, the tenant-wide default bot, if one exists.
3. Otherwise, any other connection that happens to match the agent.
4. Otherwise, the first bot the tenant has connected, so something answers rather than nothing.

Practically: if an agent has its own bot, replies always go out through that bot. Everything else falls back to the default bot from Settings → Telegram.

## Inbound flow

1. A user DMs the bot, or mentions/replies to it in a group.
2. The bot delivers the update to Pulse — over a webhook in production, or long-polling in local dev (`NODE_ENV=development` starts polling automatically; production relies on `WEBHOOK_BASE_URL` being set so Pulse registers a Telegram webhook when you save the token).
3. Pulse checks, in order: the tenant's DM/group policy, the account-wide [People](/docs/people) access gate (`blocked` stays silent, `observe` gets a one-time "ask an admin" notice), and — if that person's approval mode requires it — an approval card sent to your approvers before the message is even handed to the agent.
4. The message is queued (or processed synchronously if no queue is configured) and reaches the agent's normal message-handling loop, same as any other channel.

### DM and group policy (Settings → Telegram)

- **DM policy** — `open` (anyone can DM the bot, default), `pairing` (a new contact gets a one-time code they must give an admin to approve), or `disabled`.
- **Group policy** — `disabled` (default — the bot ignores groups entirely until you turn this on), `open`, or `allowlist` (a group must be pre-approved).
- **Require mention** — when on (the default for groups), the bot only responds in a group if it's `@mentioned` or the message is a reply to one of its own messages; otherwise every group message would trigger a reply.

## Approval cards and DMs

When an agent's action needs a human sign-off (see [Approval gates](/docs/approvals)), Pulse DMs every designated approver an inline-keyboard card (Approve/Deny buttons) through Telegram. This uses the same bot-selection logic above — if the triggering agent has its own bot, the card comes from that bot; otherwise it comes from the tenant's default bot. Any Telegram user can tap the buttons, but the tap is re-validated server-side against the actual approver list — a non-approver tapping "Approve" gets a silent "Not authorized" toast and nothing changes.

## Photos and vision

If an inbound message includes a photo, Pulse downloads it and hands it to the agent's model as an image attachment — as long as the model you've selected supports vision and `telegram_vision_enabled` (default on) hasn't been turned off for the tenant. With it off, or on a non-vision model, the agent is simply told "a photo arrived" without being able to see it.

## Formatting

Agent replies are converted from Markdown to Telegram's own HTML subset (`<b>`, `<i>`, `<code>`, `<pre>`, links) and chunked to stay under Telegram's 4096-character message limit. If Telegram rejects the HTML for some reason, Pulse automatically retries the same chunk as plain text rather than dropping the message.

## Related

- [People & approvers](/docs/people) — the account-wide access gate (`talk`/`observe`/`blocked`) that sits on top of the DM/group policy above.
- [Approval gates](/docs/approvals) — how a Telegram approval card is created and decided.
- [Departments & channels](/docs/departments) — routing a group conversation between multiple agents, once a bot is answering in a group.
