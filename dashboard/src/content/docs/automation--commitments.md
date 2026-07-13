A commitment is something an agent promised to come back to — "I'll check if the order shipped by Friday," "let me confirm with the warehouse and get back to you" — recorded as a tracked item instead of relying on the agent to remember it three days later in a different conversation. What happens when one comes due is a setting you control, not something the agent decides in the moment.

## How a commitment gets created

This feature needs to be turned on for your workspace under [Plugins](/dashboard/docs/tools/plugins) before an agent can use it — it isn't on by default. If you don't see it there, ask your Pulse administrator to enable it.

Once it's on, the agent decides for itself, mid-conversation, when a promise it just made is worth recording — there's nothing for you to press. It records a short summary and either a specific due time or a number of hours from now.

## Delivery settings

Configure what happens when a commitment comes due under **Settings → Memory → Follow-up commitments**:

- **Act on due commitments automatically** — a master on/off switch. Off by default: agents can still record and review commitments, but nothing is ever delivered when one comes due.
- **When a commitment is due**, choose one of three modes:

| Mode | What it does |
|---|---|
| Track only (no messages) — default | The commitment is recorded and agents can review it; nothing is sent automatically. |
| Message the customer | The agent writes a short, natural check-in and sends it to the original conversation. |
| Remind me (the owner) | A plain reminder is sent to a Telegram contact you provide; the customer is never contacted. |

- **Max follow-ups per check** — a safety cap (0–20, default 3) on how many commitments get delivered at once, so a backlog can't flood a chat. Checks run every few minutes.

> **Reminders are delivered over Telegram only, today.** Both "Message the customer" and "Remind me" send through your connected Telegram bot. If the original conversation happened somewhere else, or your workspace has no Telegram bot connected, delivery can't happen — and the commitment is still marked as delivered even though nobody actually received anything. If reminders don't seem to be arriving, check that the agent has a Telegram bot connected and, for "Remind me," that your Telegram contact is set correctly.

> **An unresolved commitment stays open indefinitely.** If nobody closes it out, it remains pending and keeps being picked up at every check — there's no automatic expiry.

## Closing a commitment out

You close a commitment by asking the agent to mark it done or dismissed once it's been handled. There's no separate dashboard list for viewing or closing commitments today — this happens entirely through conversation with the agent; the Settings page above only controls delivery behavior.

## Related

- [Plugins](/dashboard/docs/tools/plugins) — turn commitment tracking on for your workspace.
- [Memory](/dashboard/docs/agents/memory) — the same settings area also controls what an agent remembers between conversations.
