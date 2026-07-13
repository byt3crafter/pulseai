A commitment is something an agent promised to come back to — "I'll check if the order shipped by Friday," "let me confirm with the warehouse and get back to you" — recorded as data instead of trusting the model to remember it three days later in a different conversation. What happens when one comes due is a setting you control, not something the agent decides in the moment.

## How a commitment gets created

Commitments are recorded, listed, and closed by three tools — `commitment_create`, `commitment_list`, `commitment_complete` — shipped in the **commitments plugin**, not as a built-in tool. That means it needs to be enabled for your workspace under [Plugins](/docs/tools/plugins) like any other plugin before an agent can use it; it isn't on by default.

`commitment_create` takes a `summary` and either an ISO `due_at` or `due_in_hours`. The agent decides on its own, mid-conversation, when a promise it just made is worth recording — there's no prompt from you required, only the plugin needs to be enabled and the model needs to actually call the tool.

## What happens when one comes due

A tick in the cron scheduler (`deliverDueCommitments`, every **5 minutes** — `pulse/src/cron/scheduler.ts`) scans every tenant for pending commitments whose due time has passed, and acts according to that tenant's delivery setting.

Configure this under **Settings → Memory → Follow-up commitments**:

- **Act on due commitments automatically** — a master on/off switch. Off by default: agents can still record and review commitments with `commitment_create`/`commitment_list`, but nothing is ever delivered when one comes due.
- **When a commitment is due**, one of three modes:

| Mode | What it does |
|---|---|
| Track only (no messages) — **default** | Recorded and reviewable via `commitment_list`; nothing is sent automatically. |
| Message the customer | The agent writes a short, natural check-in (not "this is a reminder") and sends it to the original conversation. |
| Remind me (the owner) | A plain reminder ("⏰ Follow-up due: ...") is sent to a Telegram chat ID you provide — the customer is never contacted. |

- **Max follow-ups per check** — a safety cap (0–20, default 3) on how many commitments get delivered in a single 5-minute tick, so a backlog can't flood a chat.

## Honest gotchas

**Delivery is Telegram-only, today.** Both "Message the customer" and "Remind me" send through the tenant's connected Telegram bot. If the original conversation was on a different channel, or there's no Telegram bot connected at all, delivery can't happen.

**A misconfigured delivery mode fails silently — the commitment is still marked "delivered."** Look at the actual delivery code (`pulse/src/commitments/commitment-delivery.ts`): in "Remind me" mode, if there's no Telegram bot token or no owner contact set, the send is skipped — but the commitment's status is set to `delivered` anyway. In "Message the customer" mode, if the original channel wasn't Telegram, the same thing happens: nothing is sent, but the commitment is marked handled so it "doesn't loop." Either way, `commitment_list` will show it as `delivered` even though nobody was ever actually notified — there's no separate "failed" state to catch this.

**A commitment can never reach `expired`.** The database schema documents `expired` as a valid status alongside `pending`/`delivered`/`done`/`dismissed`, but no code path ever sets it — `setCommitmentStatus()` only accepts `done`, `dismissed`, or `delivered`. An unresolved commitment just sits as `pending` (and gets picked up again and again by the delivery tick, since only status matters, not how many times it's already been due) until an agent calls `commitment_complete`.

## Closing one out

`commitment_complete` marks a commitment `done` (the default) or `dismissed`, given its id from `commitment_list`. There's no dashboard UI for viewing or closing commitments — it's entirely tool-driven; the only human-facing surface is the Settings → Memory delivery configuration described above.

## Related

- [Plugins](/docs/tools/plugins) — enable the commitments plugin for a workspace.
- [Memory](/docs/agents/memory) — the same Settings → Memory area also controls auto-memory extraction.
