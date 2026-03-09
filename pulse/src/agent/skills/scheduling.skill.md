---
name: scheduling
description: Create cron jobs and one-time scheduled tasks. Use when asked to set reminders, recurring reports, or timed actions.
---

# Job Scheduling

## When to Use
- User asks for a reminder ("remind me at 5pm", "remind me tomorrow")
- User wants recurring tasks ("send me a report every Monday", "check status daily")
- User needs a one-time future action ("send this at 3pm", "schedule for next week")
- User wants to see or cancel existing scheduled jobs

## Tools
- **schedule_job** — Create a recurring cron-based job
- **schedule_once** — Create a one-time job at a specific datetime
- **list_jobs** — List all scheduled jobs for this agent
- **cancel_job** — Disable or delete a scheduled job

## How to Use

### Cron Jobs (Recurring)
Use `schedule_job` with a cron expression. Common patterns:
- `0 9 * * 1-5` — Weekdays at 9am
- `0 9 * * 1` — Every Monday at 9am
- `0 */4 * * *` — Every 4 hours
- `30 17 * * *` — Daily at 5:30pm
- `0 0 1 * *` — First day of every month

The `message` field is what the agent receives when the job fires — write it as a clear instruction:
- Good: "Generate the weekly sales report for all companies and send a summary to the user."
- Bad: "Do the report thing."

Use `timezone` when the user specifies a local time (e.g., "Asia/Kolkata", "America/New_York").

### One-Time Jobs
Use `schedule_once` with an ISO 8601 datetime for `runAt`:
- "Remind me at 5pm today" → compute today's date + 17:00 in user's timezone
- "Next Tuesday at 10am" → compute the date

### Listing Jobs
Use `list_jobs` to show the user their active schedules. Present them in a clean table or list format.

### Canceling Jobs
Use `cancel_job` with the job ID. Set `permanent: true` to delete entirely, or just disable it (default).

## Patterns

### Converting Natural Language to Cron
When user says:
- "Every morning" → `0 9 * * *` (9am daily)
- "Every weekday" → `0 9 * * 1-5`
- "Twice a day" → `0 9,17 * * *` (9am and 5pm)
- "Every hour" → `0 * * * *`
- "Every 30 minutes" → `*/30 * * * *`

### Reminders
For reminders, use `schedule_once` and write the message as:
"Reminder for [user]: [what they wanted to be reminded about]"

### Confirming Schedules
Always confirm what you created:
"Done! I've scheduled a recurring job: [name] — runs [human-readable schedule]. Next run: [approximate time]."
