A standing order is a permanent operating instruction for an agent — a responsibility it carries on its own, every time it's active, without you re-explaining it in every conversation. Think of it as a written job description for one recurring task, not the agent's whole personality.

## Where to set them up

Standing orders are edited per agent, under **Automation → Standing Orders** in that agent's workspace. Each one is a named entry with six fields:

| Field | What to put there |
|---|---|
| Program name | A short label, e.g. "Weekly sales report." |
| What it's allowed to do (scope) | e.g. "Prepare and send the weekly sales summary to the team channel." |
| When (trigger) | e.g. "Every Friday at 4pm, or when a new order file arrives." |
| Steps | e.g. "1) Pull this week's orders. 2) Total by product. 3) Post to the Sales channel." |
| Ask me before | e.g. "Issuing any refund over 500, or emailing a customer directly." |
| Stop and escalate to me if | e.g. "The data looks wrong, a total is negative, or a step fails twice." |
| Never | e.g. "Never delete records. Never share pricing with anyone outside the company." |

## A worked example

Say you fill in a standing order like this:

| Field | Value |
|---|---|
| Program name | Weekly sales report |
| Scope | Prepare and send the weekly sales summary to the team channel. |
| When | Every Friday at 4pm, or when a new order file arrives. |
| Steps | 1) Pull this week's orders. 2) Total by product. 3) Post to the Sales channel. |
| Ask me before | Emailing a customer directly. |
| Stop and escalate if | A total is negative, or a step fails twice. |
| Never | Delete records. |

Once this is turned on, the agent carries "prepare and send the weekly sales summary" as a standing responsibility from that point forward. It doesn't need you to bring it up — on Friday afternoon, or the moment it notices a new order file, it acts on its own, following the steps you wrote, and stops to ask before emailing a customer directly.

## How this differs from other instructions

- **Soul and Identity** define *who the agent is* — its tone, personality, and how it introduces itself. A standing order defines *a job the agent does*, independent of personality.
- A [schedule](/dashboard/docs/automation/schedules) sends the agent a message at a specific time. A standing order has no timer of its own — it's always present, and the agent applies it whenever the situation matches what you wrote in "When." In practice the two often pair up: a schedule says "check now," and the standing order tells the agent what "checking" means and where the line is.
- [Heartbeat](/dashboard/docs/automation/heartbeat) is a single recurring self-check per agent. Standing orders are a list of separate named responsibilities, each with its own scope, steps, and limits, and they apply to *every* conversation the agent has — not just its heartbeat checks.

> **"Ask me before" is a request, not a lock.** The "Ask me before" and "Stop and escalate to me if" fields are instructions the agent is asked to follow — they are not enforced the way a hard approval rule is. The agent is told to pause and ask, but nothing automatically stops the underlying action if it doesn't. If you need a guarantee that a specific action can never happen without a person approving it first — a refund, an email to a customer, a command on a server — set that up as an **Ask First** rule under [Tool Policy](/dashboard/docs/agents/tool-policy) instead. That is enforced every time. Use a standing order's "Ask me before" field to describe *when* judgment calls should be raised in plain language, not as your only safety net for something that must never happen unsupervised. See also [Approval gates](/dashboard/docs/approvals).

## Managing a standing order

Each standing order has its own **enabled** switch, so you can turn it off without deleting the wording, plus Edit and Delete. There's no separate "test" or "preview" button — the only way to see the effect is to talk to the agent and watch whether it follows the routine.
