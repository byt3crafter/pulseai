Tool Policy is a per-agent set of rules that decides which tools it can use freely, which it can never use, and which need a human's sign-off before they run. It sits on top of whichever tools the agent already has loaded — see [Tools & Skills](/dashboard/docs/agents/tools) for how a tool gets loaded in the first place.

## The three lists, and the order they're checked in

| List | Checked | Effect |
|---|---|---|
| Deny List | First | Any tool matching a pattern here is blocked outright. It's removed from what the agent can even see — the model never gets a chance to call it. |
| Allow List | Second | Leave it empty and everything not denied is permitted. Fill it in and only matching tools survive — everything else is filtered out, even if the Deny List never mentioned it. |
| Ask First — Require Approval | When the agent actually tries to call the tool | Matching tools are **not** hidden from the agent — it can still see them and attempt to call them. The difference is what happens next: the call is held for a human to approve before it runs. |

## Which patterns actually work

The field only understands three forms:

```
*              matches every tool
prefix*        matches any tool name starting with "prefix"
exact_name     matches only that exact tool name
```

Nothing else works as a wildcard. A leading wildcard (`*_send`), a wildcard in the middle (`email_*_confirm`), more than one wildcard, `?`, or a character list like `[abc]` are all compared as a literal, exact string — they will almost certainly match nothing. `erpnext_*` works because it ends in `*`; `*_send` does not, even though it looks like it should.

## What happens when a tool needs approval

A gated tool call never blocks the agent mid-turn. Here's the sequence:

1. The agent tries to call a tool matching an Ask First pattern.
2. If there's already a standing "Allow always" grant for that exact tool (see below), it runs immediately — no prompt.
3. Otherwise the call is queued as an approval request and returns right away with a message telling the agent the action is waiting on sign-off. The agent is told not to retry it or work around it — it tells you the action is prepared and pending, and its turn ends there.
4. Every person marked as an **Approver** gets a card in their Telegram DM with **Allow**, **Deny**, and **Allow always**. Whenever one of them taps Allow — seconds or hours later — the action runs then, out of band. The result can reach you well after the original conversation has moved on.

Full detail on the approval card, timing, and what happens if nobody answers is on [Approval gates](/dashboard/docs/approvals). Approvers and standing allowances are managed under [People & approvers](/dashboard/docs/people).

> This is enforced the same way no matter which AI model or provider is powering the agent — there's no way to bypass it by switching models.

> There's no field on this screen for "always allow." The only way a tool gets standing approval is someone tapping **Allow always** on a Telegram card after a real request, and that grant is workspace-wide for that tool (see [Approval gates](/dashboard/docs/approvals)), not something you pre-set here.

## Related

- [Tools & Skills](/dashboard/docs/agents/tools) — what gets loaded into an agent's toolset before policy is applied.
- [Approval gates](/dashboard/docs/approvals) — the full lifecycle of an approval request.
- [People & approvers](/dashboard/docs/people) — assign approvers, view and revoke standing allowances.
