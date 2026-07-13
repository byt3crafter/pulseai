A schedule sends a message to an agent automatically — on a repeating pattern, at a fixed interval, or once at a specific date and time — the same way a person's message would trigger a reply. Use it for inbox checks, recurring reports, or reminders the agent should act on without anyone asking.

## Creating a schedule

There are two ways to set one up:

**Ask the agent to create it for itself.** If an agent has scheduling enabled, you can just tell it in conversation — "check the shared inbox every weekday at 8am" — and it sets up the recurring or one-time job on its own.

**Create it yourself from the agent's Schedules page.** Open the agent, then add `/schedules` to the end of that page's address in your browser (this page isn't listed among the agent's tabs yet, so the direct address is the way in for now). The form lets you set:

- **Name** — a label for the schedule.
- **Schedule Type** — Cron Expression, Interval, or One-time.
- **Cron Expression** — a repeating pattern, e.g. `0 8 * * 1-5` for weekdays at 8am.
- **Interval (seconds)** — a fixed gap between runs, minimum 300 (5 minutes).
- **Run At** — a specific date and time, for one-time jobs.
- **Timezone** — chosen from a fixed list of common zones.
- **Message / Instruction** — the exact text sent to the agent, as if it were a message from a person, every time the job fires.

### Useful cron expressions

| Expression | Meaning |
|---|---|
| `0 8 * * 1-5` | 8am, Monday through Friday |
| `0 9 * * *` | 9am every day |
| `*/15 8-17 * * 1-5` | Every 15 minutes, 8am–5pm, weekdays |
| `0 18 * * 5` | 6pm every Friday |
| `0 0 1 * *` | Midnight on the first of each month |

## What happens when a schedule fires

The agent receives the instruction text as an ordinary message and responds the same way it would to a person. That response is recorded, but nothing forwards it anywhere on its own — a schedule has no built-in delivery target. If you want the result to actually reach someone, write the instruction so it tells the agent to use one of its own tools to deliver it, for example: "check the shared inbox and email me a summary" or "post the totals to the Sales group." Otherwise the agent's answer is generated and simply logged, with nobody shown it.

Each schedule also gets its own trigger address, shown (in part) on its row in the table. Sending a request to that address from another system runs the job immediately, separately from its normal timing — useful for "run this as soon as our nightly export finishes."

> **A schedule you create, enable, or disable in the dashboard does not take effect immediately.** It is picked up the next time the platform restarts. If you need a schedule to start or stop running right now, contact your Pulse administrator rather than assuming the dashboard's Enabled/Disabled state reflects what's actually running — a schedule you just disabled may keep firing until the next restart, and one you just created won't start until then either. A schedule an agent sets up for itself, in conversation, does take effect immediately — this delay only applies to schedules created or changed from the dashboard.

## Related

- [Standing Orders](/dashboard/docs/automation/standing-orders) — pair a schedule's timing with a standing order that spells out what "checking" means and where the line is.
- [Heartbeat](/dashboard/docs/automation/heartbeat) — a simpler, single always-on self-check per agent, with no setup form of its own.
