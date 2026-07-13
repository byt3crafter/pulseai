An approval gate pauses an agent before it does something sensitive and asks a human to say yes or no — over Telegram, with a tap. There is no separate "approvals" screen to configure: you turn a gate on from an agent's [Tool Policy](/docs/agents/tool-policy), and you manage who's allowed to answer under [People](/docs/people).

## What triggers a gate

On an agent's **Tool Policy** tab, the **Ask First — Require Approval** field takes a comma-separated list of tool-name patterns (exact names or a trailing `*` wildcard — e.g. `email_send, server_exec, erpnext_*`). Any tool call matching one of those patterns is gated, unless it's covered by a standing allowance (see below).

The gate is enforced in exactly one place in the code — `ensureToolApproved()` — but it's called from **two separate execution paths**, so it can't be bypassed by switching providers:

- the native runtime tool loop (Anthropic/OpenAI models), and
- the Codex operator bridge (`pulse/src/gateway/routes/mcp.ts`), used when an agent runs on the Codex/ChatGPT-subscription provider.

Both paths call the same function before the tool actually runs.

## What the approver sees

Every person marked as an **Approver** (see [People](/docs/people)) gets a Telegram DM with the request and three buttons: **Allow**, **Deny**, **Allow always**. For email, the card renders the actual draft so the approver reviews real content, not just a function name:

```
🔐 Sales Agent wants to SEND an email — approve?
To: chipo@example.com
Subject: Re: Q3 invoice
—
Hi Chipo, following up on the invoice we discussed...

⏱ Expires in 2 minutes if nobody responds.
```

For any other tool, the card shows a compact preview of the first few arguments instead:

```
🔐 Sales Agent wants to use the "server_exec" tool — approve?
command: systemctl restart nginx
```

> The card is delivered through the **same agent's own Telegram bot** if that agent has one connected, or the tenant's default bot otherwise. If neither exists, the approval is logged as "no bot available to deliver" and nobody is ever notified — it will simply expire. An approver must also have messaged that bot at least once before (Telegram requires this to DM someone), which is exactly what puts them in the [People](/docs/people) list in the first place.

**Honest bug:** the card's footer always says *"Expires in 2 minutes"* — that text is hardcoded (`approval-service.ts`, `cardText()`) regardless of the tool's actual timeout. For a Tool Policy gate the real window is **2 hours** (see below), so the card understates how long an approver actually has.

## Non-blocking execution

A gated tool call does **not** pause the agent's turn. The moment it's queued:

1. The tool call returns immediately with a "queued for approval" message.
2. The agent tells the user it's prepared the action and is waiting on sign-off — it's explicitly instructed not to retry or work around it.
3. Whenever an approver taps **Allow** — seconds later or hours later — the tool runs then, out of band, and the Telegram card is edited in place to show the outcome (`✅ Approved by <name> — done.` or a failure message).

This means a conversation can end with "waiting on approval" and the actual action (the email going out, the command running) happens afterwards with nobody watching that chat.

## Timeout and expiry

- A Tool Policy ("Ask First") approval stays actionable for **2 hours** (`APPROVAL_TTL_MS` in `pulse/src/agent/tools/approval-gate.ts`).
- A cron sweep every **60 seconds** (`pulse/src/cron/scheduler.ts`) finds anything past its expiry and finalizes it as expired.
- On expiry, approvers don't just see their old card silently edited — they get a **fresh push message**: *"No response in time — this was NOT sent and still needs you to handle it manually."* That's a deliberate design choice so an unapproved action can't vanish unnoticed in a wall of old Telegram messages.
- Other approval kinds in the same system — a person's message held for approval, or an SSH command on a guarded server — use a shorter **2-minute** default timeout and don't get the same "still needs manual handling" re-alert on expiry; that behavior is specific to tool-call approvals.

If an agent has **zero people marked as Approver**, a gated call is still queued — it just has nobody to send a card to, and will expire unanswered every time. Nothing warns you about this in the dashboard; it only shows up as a server log.

## Allow always — standing allowances

Tapping **Allow always** grants a persistent, revocable standing allowance for the exact tool name (e.g. `email_send`) — every future call to that tool for this tenant is auto-approved with no prompt, forever, until someone revokes it.

> **Scope gotcha:** the allowance is keyed on the tool name only. It is not scoped to the agent that triggered it, the specific arguments, or the person who asked. "Allow always" on `email_send` means *any* agent in the tenant can send *any* email without another approval, until you revoke it.

Standing allowances are listed and revoked from the [People](/docs/people) page — see that page for an important labeling quirk: tool allowances show up there mislabeled as people.

## What you can't see from the dashboard

There is currently no dashboard screen listing pending or historical approvals — no queue, no audit trail of who approved what and when. The Telegram card (and its live edits as it gets decided or expires) is the only place that history is visible. Once a card scrolls out of view, the record only exists in the `pending_approvals` table, which nothing in the UI reads back out.

## Related

- [Tool Policy](/docs/agents/tool-policy) — where you turn gates on per tool.
- [People & approvers](/docs/people) — who can approve, and where standing allowances live.
- [The CFO email loop](/docs/recipes/cfo-email) — a worked example of an agent that drafts, then waits for approval, before it sends.
