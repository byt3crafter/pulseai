A standing order is a permanent operating instruction for an agent — a routine it runs on its own authority, every time it's active, without you re-explaining it in every conversation. Think of it as a written job description for one recurring responsibility, not the agent's whole personality.

## Where it lives, and how it actually reaches the agent

Standing orders are edited per-agent under **Automation → Standing Orders** in the agent workspace. Each one is a named block with six free-text fields:

| Field | Prompt shown in the editor |
|---|---|
| Program name | — |
| What it's allowed to do (scope) | "e.g. Prepare and send the weekly sales summary to the team channel." |
| When (trigger) | "e.g. Every Friday at 4pm, or when a new order file arrives." |
| Steps | "e.g. 1) Pull this week's orders from ERPNext 2) Total by product 3) Post to the Sales channel." |
| Ask me before (approval gates) | "e.g. Issuing any refund over P500, or emailing a customer directly." |
| Stop and escalate to me if | "e.g. The data looks wrong, a total is negative, or a step fails twice." |
| Never (boundaries) | "e.g. Never delete records. Never share pricing with anyone outside the company." |

Every enabled standing order for the agent is appended to its system prompt on **every single run** — every inbound message, every heartbeat, every scheduled job — not just when the trigger condition seems to match. There's no scheduler or trigger-matching engine behind the `trigger` field; it's read by the model as instructions, and the model decides whether "now" fits it. Concretely, in `pulse/src/agent/runtime.ts`, right after tool-specific prompt additions, the runtime loads the agent's enabled standing orders and renders them like this:

```
## Standing orders (your operating programs)
These are permanent instructions your operator has given you. Follow them without being
re-asked. Always execute → verify → report (do the work, confirm it actually happened, then
say what you did). Where an "approval before" is set, pause and ask first. Where an
"escalate if" condition is met, stop and tell your operator instead of guessing.

1. Weekly sales report
  - You are authorised to: Prepare and send the weekly sales summary to the team channel.
  - When: Every Friday at 4pm, or when a new order file arrives.
  - Steps: 1) Pull this week's orders from ERPNext 2) Total by product 3) Post to the Sales channel.
  - Get my approval before: Emailing a customer directly.
  - Stop and escalate to me if: A total is negative or a step fails twice.
  - Never: Delete records.
```

Multiple standing orders are numbered and injected in `sortOrder` (the order they appear in the editor's list).

## How this differs from other places you write instructions

- **Soul / Identity** (`SOUL.md`, `IDENTITY.md`) define *who the agent is* — tone, personality, how it writes. A standing order defines *a job the agent does*, independent of personality.
- **A [scheduled job](/docs/automation/schedules)** fires a message to the agent at a specific time (cron/interval/once). A standing order has no timer of its own — it's always present in context and the agent applies it whenever the trigger text seems relevant. In practice these two often pair up: a cron job says "check now," and a standing order tells the agent what "checking" means and where the line is.
- **[Heartbeat](/docs/automation/heartbeat)** is a single per-agent self-check loop reading one file (`HEARTBEAT.md`). Standing orders are a list of separate named programs, each with its own scope/steps/limits, and they load into *every* conversation, not just the heartbeat tick.

## Honest gotcha: "approval before" here is not a hard gate

The **"Ask me before"** and **"Stop and escalate to me if"** fields are advisory prose injected into the prompt — the code comment in `pulse/src/standing-orders/standing-order-service.ts` says it plainly: *"Approval gates are enforced softly ... Hard runtime pause/resume is intentionally out of scope."* The model is told to pause and ask, but nothing in the code actually blocks the tool call the way [Tool Policy's Ask First list](/docs/agents/tool-policy) does.

If you need a guarantee that a specific tool call cannot run without a human tapping Allow — refunds, emails, server commands — put that tool name in the agent's **Tool Policy → Ask First** field, which is enforced in code (see [Approval gates](/docs/approvals)). Use a standing order's "Ask me before" field to describe *when* judgment calls should be escalated in plain language, not as your only safety net for something that must never happen unsupervised.

## Managing a standing order

Each one has a per-order **enabled** toggle (turn it off without deleting the wording), and Edit/Delete. There's no separate "test" or "preview" — the only way to see the effect is to talk to the agent and watch it follow (or not follow) the routine.
