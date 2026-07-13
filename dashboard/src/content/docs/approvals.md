An approval gate pauses an agent before it does something sensitive and asks a human to say yes or no, with a tap in Telegram. There's no separate approvals screen to turn this on — you decide which tools need approval from an agent's [Tool Policy](/dashboard/docs/agents/tool-policy), and you manage who's allowed to answer under [People](/dashboard/docs/people).

## What triggers a gate

On an agent's **Tool Policy** tab, the **Ask First — Require Approval** field takes a comma-separated list of tool names — an exact name, or a name ending in `*` to match a group (for example `email_send, server_exec, erpnext_*`). Any call matching one of those patterns is held for approval, unless it's already covered by a standing "Allow always" grant (see below).

This is enforced the same way regardless of which AI model is powering the agent — there's no path around it.

## What the approver sees

Everyone marked as an **Approver** (see [People](/dashboard/docs/people)) gets a Telegram DM with the request and three buttons: **Allow**, **Deny**, **Allow always**. For an email, the card shows the actual draft, so the approver reviews real content, not a description of it:

```
🔐 Sales Agent wants to SEND an email — approve?
To: chipo@example.com
Subject: Re: Q3 invoice
—
Hi Chipo, following up on the invoice we discussed...

⏱ Expires in 2 minutes if nobody responds.
```

For any other tool, the card shows a short preview of the arguments instead:

```
🔐 Sales Agent wants to use the "server_exec" tool — approve?
command: systemctl restart nginx
```

> **The countdown on the card is wrong — don't trust it.** It always reads "Expires in 2 minutes," no matter what. For a Tool Policy approval like the ones above, the real window is about **two hours**. The card just understates how long an approver actually has to respond.

> The card is sent through that agent's own Telegram bot if it has one, or your workspace's default bot otherwise. If neither exists, nobody is notified and the request simply expires unanswered. An approver also has to have messaged that bot at least once before Telegram will let it DM them — which is exactly what puts someone on the [People](/dashboard/docs/people) list to begin with.

## The agent doesn't wait for the answer

Queuing an approval does not pause the conversation:

1. The tool call comes back immediately with a "waiting on approval" result.
2. The agent tells you it's prepared the action and is waiting for sign-off, then moves on — it's told not to retry or work around the hold.
3. Whenever an approver taps **Allow** — seconds or hours later — the action actually runs then, and the Telegram card updates in place to show what happened (approved and done, or failed).

That means a chat can end with "waiting on approval," and the real action — the email going out, the command running — happens afterward, with no one watching that conversation.

## If nobody answers in time

A Tool Policy approval stays open for about **two hours**. If nothing's happened by then:

- The action is **not** sent or run.
- Approvers get a new message, not just a silently-updated card: *"No response in time — this was NOT sent and still needs you to handle it manually."* That's deliberate, so an unapproved action can't just disappear in a scrollback of old messages.

Other kinds of approval in Pulse — a stranger's message held for review, or a command on a guarded server — use a shorter default window and don't get that same follow-up nudge; the manual-handling alert is specific to Tool Policy approvals.

If an agent has no one marked as Approver, a gated call still gets queued. There's just nobody to send it to, so it will expire unanswered every time, with nothing in the dashboard warning you that's about to happen.

## Allow always — standing allowances

Tapping **Allow always** creates a persistent, revocable grant for that exact tool. From then on, every future call to that tool is approved automatically, with no prompt, for your entire workspace — until someone revokes it.

> **This is not scoped to the one request, the one agent, or the one contact.** Tapping Allow always on an `email_send` approval means every agent in your workspace can send any email without asking again, until you revoke it. Treat Allow always as a workspace-wide decision, not a one-off yes.

Standing allowances are listed and revoked from [People & approvers](/dashboard/docs/people) — that page also explains a labeling quirk worth knowing about before you go looking for them there.

## What you can't see from the dashboard

There's currently no screen listing pending or past approvals — no queue, no record of who approved what and when. The Telegram card, and its live updates as it's decided or expires, is the only place that history is visible once it happens.

## Related

- [Tool Policy](/dashboard/docs/agents/tool-policy) — where you turn approval gates on per tool.
- [People & approvers](/dashboard/docs/people) — who can approve, and where standing allowances live.
- [The CFO email loop](/dashboard/docs/recipes/cfo-email) — a worked example of an agent that drafts, then waits for approval, before it sends.
