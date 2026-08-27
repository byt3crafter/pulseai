-- Scheduled jobs: only wake the agent when there is something to do.
--
-- A polling job ("check the inbox every 15 minutes") spent ~49,000 input
-- tokens per run to produce ~15 output tokens, forty times a day, and the
-- answer was almost always "nothing new". The model was being used as a
-- sensor. A precondition is a cheap, code-evaluated check that runs FIRST;
-- the agent is only invoked when it says there is work.
--
-- NULL means "always run", so every existing job keeps its current behaviour.
ALTER TABLE scheduled_jobs
    ADD COLUMN IF NOT EXISTS precondition VARCHAR(32);

COMMENT ON COLUMN scheduled_jobs.precondition IS
    'Cheap code check before invoking the agent. NULL = always run. e.g. email_unread';
