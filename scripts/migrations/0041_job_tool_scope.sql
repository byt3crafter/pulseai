-- Scheduled jobs: only send the tools the job actually needs.
--
-- Every run ships the schema for every tool the workspace has enabled. With
-- 105 enabled that was ~46,000 input tokens per run before the agent read a
-- single word of its instruction — for a job that calls one tool.
--
-- NULL or empty = send everything, which is what every job did before this
-- existed, so nothing changes until someone narrows a job deliberately.
ALTER TABLE scheduled_jobs
    ADD COLUMN IF NOT EXISTS tools JSONB;

COMMENT ON COLUMN scheduled_jobs.tools IS
    'Tool names this job may use. NULL/empty = all of the agent''s tools.';
