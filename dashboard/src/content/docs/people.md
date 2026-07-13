People is the workspace-wide list of everyone your agents have heard from on Telegram — and the control point for who's allowed to talk, who can approve gated actions, and which agents each person may address. It applies across every group and direct message, not per channel, and currently covers Telegram only.

## Who shows up here

A row appears automatically the first time someone messages any of your agents on Telegram. There's no "add a person" button — people show up because they've already been in touch, not because you pre-added them.

| Field | What it means |
|---|---|
| Person | Display name, @username, and their Telegram ID |
| Access | Talk (agent responds normally), Observe (agent sees the message but stays silent), or Blocked (ignored entirely) |
| Approver | Whether this person gets Allow / Deny / Allow-always cards for gated tool calls — see [Approval gates](/dashboard/docs/approvals) |
| Approval mode | Auto (handled per their Access level) or Requires approval (every message from them is held until an Approver taps Allow) |
| Allowed agents | Which of your agents they may address — leave empty for "all agents" |
| Last seen | How long since their last message |

**Default access for new people** is a separate setting at the top of the page, applied automatically the first time a stranger messages an agent. It defaults to Observe, so a new contact can be seen but won't get a reply until you upgrade them to Talk.

## Approvers

Turning on **Approver** for someone means they start receiving Telegram cards whenever a tool call needs sign-off, or whenever someone else's Requires-approval message is held. Any one approver deciding resolves it for everyone — the rest simply see the card update.

There's a hard requirement behind this: Telegram only lets a bot message someone who has messaged it first. In practice, you can only mark someone as an Approver *after* they already show up as a row here, which means they need to have messaged one of your agents' Telegram bots at least once. If the person you want as an approver — yourself, for instance — hasn't messaged the bot yet, send it a message from their account first. There's no way to add them ahead of time.

## Standing approvals

This table lists every active "Allow always" grant, created whenever someone taps **Allow always** on an approval card. It shows a **Type** badge, who or what it was granted to, when it was granted, and a **Revoke** button. Revoking sends future matching requests back to asking every time.

> **What you'll actually see:** a tool-level "always allow" grant (from [Tool Policy](/dashboard/docs/agents/tool-policy)) is listed here badged "Person," with the tool's name — for example `email_send` — sitting in the "Granted to" column exactly where a human's name would normally go, and the tool name repeated underneath where a Telegram ID would be. The Revoke button still works correctly on that row. It just looks, at a glance, like a person named `email_send` has standing approval. If you see a row that isn't a real name you recognize, it's almost certainly a tool allowance, not a person.

If the table is empty, the page says so plainly: "No standing approvals — every gated request is asked each time."

## Related

- [Approval gates](/dashboard/docs/approvals) — how a gate gets triggered, and what happens after someone taps Allow.
- [Tool Policy](/dashboard/docs/agents/tool-policy) — where "Ask First" patterns are set per agent.
