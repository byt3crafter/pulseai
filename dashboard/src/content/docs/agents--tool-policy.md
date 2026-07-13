Tool Policy is a per-agent set of rules — deny, allow, and ask — layered on top of whatever tools the agent already has loaded (see [Tools & Skills](/docs/agents--tools)). It lives in `agentProfiles.toolPolicy` and is enforced in `pulse/src/agent/tools/tool-policy.ts`.

## The three lists, in evaluation order

| List | Evaluated | Effect |
|---|---|---|
| **Deny List** | First | If a tool name matches any deny pattern, it is blocked outright — it's removed from the agent's toolset entirely, before the model ever sees it. |
| **Allow List** | Second | If empty, every tool not denied is permitted. If non-empty, only tools matching an allow pattern survive — everything else is filtered out, even if it wasn't explicitly denied. |
| **Ask First — Require Approval** | At call time, not at list time | Matching tools are *not* hidden from the model — they're still listed with full schemas. The gate only triggers when the agent actually tries to call one. |

Deny and Allow are applied by `filterTools()` when an agent's toolset is built (`registry.ts`) — they decide what the model can even see. Ask is checked later, inside the tool-execution loop, by `ensureToolApproved()` — it decides whether a call the model *attempts* is allowed to run right now.

## Exactly which glob forms work

The help text says "glob matching is supported," and it is — but only three literal forms are recognized by `matchesPattern()`. There is no general glob engine here:

```
"*"              → matches every tool name
"prefix*"        → matches any tool name starting with "prefix"
"exact_name"     → matches only that exact tool name
```

What does **not** work: a leading wildcard (`*_dangerous`), a wildcard in the middle (`erp*_pay`), multiple wildcards, `?` single-character matching, or character classes (`[abc]`). If you type any of those, they're compared as a literal exact-match string and will almost certainly match nothing. `mcp_*` and `erpnext_*` (from the field's own placeholder text) work because they end in `*`; `*_send` or `email_*_confirm` would not.

## What happens on an "ask" match

When the model calls a tool matching an `ask` pattern:

1. `ensureToolApproved()` checks whether the call already has a standing allowance (see below). If so, it runs immediately, no approval needed.
2. Otherwise, it queues an approval via the same [approval-gate](/docs/approvals) system used elsewhere in Pulse — `kind: "tool_call"`, with a 2-hour window to act on it, and a human-readable summary (for `email_send`/`email_reply` this renders the actual to/subject/body so the approver reviews real content, not just a JSON blob).
3. The tool call returns immediately with a message telling the model the action is queued and instructing it **not** to retry or work around it. The model relays this to the user — from the agent's perspective, its turn is effectively over.
4. The approver gets a card in their Telegram DM with **Allow / Deny / Allow-always**. If they tap Allow, the tool call executes out-of-band, asynchronously — the result reaches the user whenever the approver acts, which could be minutes or hours later, not within the original conversation turn.

Approvers and standing allowances are managed under [People & approvers](/docs/people).

## Enforced on both execution paths

The gate is not something you can bypass by switching providers. `ensureToolApproved()` is called from two separate places in the codebase, and both must honor it:

- The native runtime tool loop (`pulse/src/agent/runtime.ts`) — used by Anthropic, OpenAI, and other directly-integrated providers.
- The Codex operator MCP bridge (`pulse/src/gateway/routes/mcp.ts`) — used when an agent runs through the Codex CLI / ChatGPT subscription path, which calls tools via MCP rather than the native loop.

If a tool is marked `ask`, it is gated no matter which path invoked it.

## Honest gotcha: `alwaysAllow` in the policy is not what grants "Allow always"

The `ToolPolicy` type has an `alwaysAllow` field, and `isToolGated()` does check it — if a tool name matches a pattern in `policy.alwaysAllow`, the gate is skipped. But **nothing in the codebase ever writes to that field.** The Tool Policy editor has no UI for it; it only round-trips the existing value untouched when you save Deny/Allow/Ask.

The actual "Allow always" mechanism, triggered by tapping **Allow-always** on a Telegram approval card, writes to a completely separate table (`approvalAllowances`, kind `"tool"`, subject = tool name) and is checked independently via `hasStandingAllowance()` — before the `ask` gate is even evaluated, not through `policy.alwaysAllow`. So `alwaysAllow` on the policy object is effectively dead weight in the current build: present in the type and read by the gate, but never populated by any live code path. Standing allowances granted this way are visible and revocable under [People & approvers](/docs/people), not on the agent's Tool Policy screen.

## Related

- [Tools & Skills](/docs/agents--tools) — what gets into an agent's toolset before policy is applied.
- [Approval gates](/docs/approvals) — the general HITL approval system Tool Policy's `ask` list plugs into.
- [People & approvers](/docs/people) — assign approvers, view and revoke standing allowances.
