A schedule sends a message to an agent automatically — on a cron expression, at a fixed interval, or once at a specific time — the same way a person's message would trigger a reply. Use it for inbox checks, recurring reports, or reminders the agent should act on without anyone asking.

## Creating a schedule

There are two ways, and they behave differently in an important way (see the gotcha below):

**The agent creates it for itself.** Give an agent the `schedule_job` / `schedule_once` / `list_jobs` / `cancel_job` tools, and it can set up its own recurring or one-time jobs when you ask it to in conversation — e.g. "check the shared inbox every weekday at 8am."

**You create it from the dashboard**, at `/dashboard/agents/<agent-id>/schedules`. The form lets you set:

- **Name** — a label.
- **Schedule Type** — Cron Expression, Interval, or One-time.
- **Cron Expression** — e.g. `0 8 * * 1-5` (weekdays at 8am).
- **Interval (seconds)** — minimum 300 (5 minutes).
- **Run At** — an ISO datetime, for one-time jobs.
- **Timezone** — a fixed dropdown of common zones (UTC, Africa/Johannesburg, a handful of US/Europe/Asia/Australia zones); it's not free text.
- **Message / Instruction** — the exact text sent to the agent as a user message every time the job fires.

> **This page exists but isn't linked anywhere.** It's a real, working page — creating, enabling, disabling and deleting schedules all work — but it isn't one of the tabs in the agent workspace's left nav (Standing Orders and Heartbeat are tabs there; Schedules is not). The only way to reach it is to type the URL directly: `/dashboard/agents/<id>/schedules`.

## What happens when a job fires

`pulse/src/cron/job-runner.ts` builds a synthetic inbound message (channel type `heartbeat`, your configured `message` as the content) and runs it through the same agent runtime as a real conversation. The response is captured and saved to a `job_runs` row (status, result text, error) — but **nothing forwards that response anywhere by default.** Unlike Heartbeat, a schedule has no "target channel" setting. If you want the output to actually go somewhere, the instruction itself needs to tell the agent to use a tool that sends it (email, Telegram, a channel post) — otherwise the agent's answer is generated and then simply discarded into a log row nobody's shown.

The run history is recorded in the database, but the current schedules page doesn't render it (the code that would fetch it, `getJobRunHistory`, is imported and never called) — so today there's no dashboard view of whether a job's last run actually succeeded, beyond the "Last Run" timestamp and Enabled/Disabled badge in the table.

Every job also gets a **webhook token**, shown truncated in its row. `POST /webhooks/cron/<token>` fires that job immediately from any external system, independent of its schedule — useful for "run this when our nightly export finishes," triggered by whatever produces that file.

## Honest gotcha: dashboard changes don't reach the live scheduler without a restart

The gateway loads all enabled jobs into an in-memory scheduler once, at boot (`CronScheduler.init()` in `pulse/src/cron/scheduler.ts`). After that, the only way a job gets added to (or removed from) the live scheduler is a direct call to `cronScheduler.addJob()` / `.removeJob()`.

- The **agent's own tools** (`schedule_job`, `schedule_once`, `cancel_job`) call `cronScheduler.addJob()` / `.removeJob()` immediately after writing to the database — so a job the agent creates for itself goes live right away, and canceling it through the agent stops it right away too.
- The **dashboard's Create/Toggle/Delete Schedule actions** only write to the database. They never call `addJob`, `removeJob`, or `reload()`.

The practical consequences:

- A schedule you create from the dashboard sits in the database but **will not fire** until the gateway process next restarts and reloads jobs from the DB.
- If a job is already running live (because the agent created it, or because the gateway has restarted since you created it from the dashboard), clicking **Disable** or **Delete** in the dashboard updates the database row but **does not stop the in-memory timer** — it keeps firing on its old schedule until the process restarts. The dashboard will show it as disabled or gone while it's actually still running.

There is no manual "reload scheduler" button anywhere in the product. If a dashboard-created schedule seems to be doing nothing, or a disabled one keeps firing, a gateway restart is the only fix today.

## Related

- [Standing Orders](/docs/automation/standing-orders) — for "what does checking mean and where's the line," pair a schedule's timer with a standing order's rules.
- [Heartbeat](/docs/automation/heartbeat) — a simpler, single always-on self-check per agent, with an explicit target channel.
