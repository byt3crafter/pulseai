Heartbeat is a per-agent self-check loop — the agent wakes itself up on a timer, follows whatever's written in its `HEARTBEAT.md` workspace file, and reports back only if there's something worth saying. It's the simplest of Pulse's automation surfaces: one file, one interval, one on/off switch.

## Configuring it

On an agent's **Heartbeat** tab you set:

- **Enabled** — off by default.
- **Interval (seconds)** — minimum 60, defaults to 3600 (one hour); shown alongside its minutes equivalent.
- **Active Hours (optional)** — restrict heartbeats to a start/end time in a chosen timezone (a fixed dropdown, not free text), so an agent doesn't ping you at 3am.

There's no field on this tab for the actual heartbeat instructions — those live in the agent's `HEARTBEAT.md` workspace file (edited via workspace tools / the agent's self-edit `workspace_update`, not this tab). If `HEARTBEAT.md` is empty or missing, a heartbeat tick does nothing (`pulse/src/infra/heartbeat-runner.ts` checks and skips silently).

## How it actually fires

At boot, `HeartbeatScheduler.start()` (`pulse/src/infra/heartbeat-scheduler.ts`) loads every agent with `heartbeatConfig.enabled = true` and starts one `setInterval` per agent at its configured interval. On each tick it checks Active Hours, then runs the check via `runHeartbeatOnce()`:

1. Build a prompt: *"You are running a scheduled heartbeat check. Follow the instructions in your HEARTBEAT.md file: ... Provide your heartbeat update. If everything is normal and there's nothing to report, respond with exactly `HEARTBEAT_OK`."*
2. Send it through the same agent runtime as a real message (channel type `heartbeat`).
3. If the reply is exactly `HEARTBEAT_OK`, nothing happens — that's the expected "all clear" outcome.
4. Otherwise, a de-dup check (24-hour window, by content hash) skips it if the agent produced the exact same report as last time — so a stuck check that keeps returning identical text won't spam.

## Honest gotcha: the heartbeat's own text answer isn't delivered anywhere by default

Beyond `HEARTBEAT_OK` and de-dup, the runner has one more branch: it only forwards the captured reply to a real channel if `heartbeatConfig.targetChannel` is set to something other than the literal string `"heartbeat"`. There is **no field anywhere in the dashboard that sets `targetChannel`** (or the related `customPrompt` override) — grep confirms both are only ever read in `heartbeat-runner.ts`, never written by any UI or tool. So out of the box, a heartbeat that finds something to report generates that report, logs it, and then the text itself goes nowhere — it is not pushed to Telegram or any channel.

This doesn't mean Heartbeat is useless without a code change: if `HEARTBEAT.md` instructs the agent to actively *use a tool* when it finds something wrong — send an email, post a Telegram message via the agent's own tools — that still works fine, because that's a normal tool call made during the heartbeat run, independent of the `targetChannel` routing. Write `HEARTBEAT.md` as "if X, use `email_send`/`telegram` tool to tell someone," not "just answer and expect it to reach me" — the plain-text answer alone won't reach anyone today.

## What it's for

Use Heartbeat for a single always-on self-check per agent — "every morning, check overnight errors and post a summary," "every 30 minutes, see if the shared inbox has anything urgent." For more than one distinct recurring responsibility with its own rules, or anything that needs a real fixed schedule (cron expression, specific run time), use [Standing Orders](/docs/automation/standing-orders) paired with a [Schedule](/docs/automation/schedules) instead — Heartbeat is intentionally a single loop, not a list of jobs.

## Related

- [Standing Orders](/docs/automation/standing-orders) — durable operating rules injected into every run, not just heartbeat ticks.
- [Schedules & cron](/docs/automation/schedules) — named, timed jobs with cron/interval/once scheduling.
