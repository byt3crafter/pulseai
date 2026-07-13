People is the account-wide list of every human your agents have ever heard from on Telegram, and the control point for who's allowed to talk, who can approve gated actions, and which agents each person may address. It applies across every group and DM — not per-channel, and (today) Telegram only.

## Who shows up here

A row is created automatically the first time someone messages any of your agents on Telegram. There's no "add a person" button — you don't pre-provision people, you react to who's already talking to your agents.

Each row shows:

| Field | What it means |
|---|---|
| Person | Display name, `@username`, and their raw Telegram numeric ID |
| Access | `Talk` (agent responds normally), `Observe` (agent sees the message but stays silent — read-only), or `Blocked` (ignored entirely) |
| Approver | Whether this person receives Allow/Deny/Allow-always cards for gated tool calls (see [Approval gates](/docs/approvals)) |
| Approval mode | `Auto` (their messages are handled per their Access level) or `Requires approval` (every message from them is held until an Approver taps Allow) |
| Allowed agents | Which of your agents they may address — leave empty to mean "all agents" |
| Last seen | Relative time since their last message |

**Default access for new people** is a separate setting at the top of the page — it's applied automatically the first time someone new messages an agent (default is `Observe`, so a stranger can be seen but can't get a reply until you upgrade them to `Talk`).

## Approvers

Toggling **Approver** on for a person means they start receiving Telegram DM cards whenever a tool call needs sign-off, or whenever another person's `Requires approval` mode holds a message. Any one approver deciding resolves it for everyone who got the card.

There's a hard requirement hiding in how Telegram works: a bot can only DM someone who has messaged it first. In practice that means you can only ever mark someone as an Approver *after* they already exist as a row here — which they can only do by having messaged one of your agents' Telegram bots at least once. If your intended approver (e.g. yourself, as the business owner) hasn't messaged the bot yet, there's no way to add them ahead of time.

## Standing approvals

This table lists every active "Allow always" grant — the persistent, revocable allowances created when someone taps **Allow always** on an approval card. It shows a **Type** badge (`Person` or `Server`), who or what it was granted to, when, and a **Revoke** button. Revoking means future matching requests go back to asking every time.

> **Labeling gotcha, verified in code:** approval allowances actually come in three kinds — `user`, `server`, and `tool` (a Tool Policy "Ask First" gate that got "Allow always" tapped — see [Approval gates](/docs/approvals)). This page's query only recognizes two of them: anything that isn't literally `kind = "server"` gets displayed as `Person`. So a **tool-name allowance shows up here badged "Person"**, with the tool's name (e.g. `email_send`) sitting in the "Granted to" column exactly where a person's display name would go, and the tool name again in the monospace line underneath where a person's Telegram ID would be. It revokes correctly — the Revoke button still targets the right row — but at a glance it reads as if a human named `email_send` had been granted standing approval, which is confusing until you know what to look for.

If the table is empty, the page says so plainly: *"No standing approvals — every gated request is asked each time."*

## Related

- [Approval gates](/docs/approvals) — how a gate gets triggered and what happens after someone taps Allow.
- [Tool Policy](/docs/agents/tool-policy) — where "Ask First" patterns are configured per agent.
