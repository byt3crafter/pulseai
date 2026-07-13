Heartbeat is a per-agent self-check loop — the agent wakes itself up on a timer, follows the instructions you've written for it, and reports back only if there's something worth saying. It's the simplest of Pulse's automation features: one set of instructions, one interval, one on/off switch.

## Configuring it

On an agent's **Heartbeat** tab you set:

- **Enabled** — off by default.
- **Interval (seconds)** — how often it checks in; minimum 60, defaults to 3600 (one hour), shown alongside its minutes equivalent.
- **Active Hours (optional)** — restrict heartbeats to a start and end time in a chosen timezone, so an agent doesn't check in at 3am.
- **Heartbeat Prompt** — the actual instructions the agent follows on each check, e.g. "every morning, check overnight errors and post a summary." If this is left empty, a heartbeat tick does nothing.

## How it actually runs

On each tick, the agent is told it's running a scheduled heartbeat check and given your Heartbeat Prompt instructions. If everything is normal and there's nothing to report, it says so and nothing further happens — that's the expected "all clear" outcome. If the agent produces the exact same report it gave last time within the last day, that repeat is skipped too, so a stuck check that keeps finding the same thing won't spam you.

> **The heartbeat's plain-text answer isn't delivered anywhere by default.** Beyond the "all clear" and repeat-skipping behavior above, there's currently no setting that sends a heartbeat's written report to a chat or channel on its own — it's generated and logged, not pushed out. This doesn't make Heartbeat useless: if you write the Heartbeat Prompt so that it tells the agent to actively use one of its own tools when it finds something worth flagging — send an email, post a Telegram message — that still works, because it's a normal tool call made during the check. Write your instructions as "if X, use your email or Telegram tool to tell someone," not "just answer and expect it to reach me" — the plain-text answer alone won't reach anyone today.

> **A change you make on the Heartbeat tab doesn't take effect immediately.** Like schedules, heartbeat settings are picked up the next time the platform restarts. If you need a heartbeat to start, stop, or change its timing right away, contact your Pulse administrator rather than assuming the tab's Enabled state reflects what's actually running.

## What it's for

Use Heartbeat for a single always-on self-check per agent — "every morning, check overnight errors and post a summary," "every 30 minutes, see if the shared inbox has anything urgent." For more than one distinct recurring responsibility with its own rules, or anything that needs a specific run time, use [Standing Orders](/dashboard/docs/automation/standing-orders) paired with a [Schedule](/dashboard/docs/automation/schedules) instead — Heartbeat is intentionally a single loop, not a list of jobs.

## Related

- [Standing Orders](/dashboard/docs/automation/standing-orders) — durable operating rules that apply on every run, not just heartbeat checks.
- [Schedules & cron](/dashboard/docs/automation/schedules) — named, timed jobs with their own schedule and instructions.
