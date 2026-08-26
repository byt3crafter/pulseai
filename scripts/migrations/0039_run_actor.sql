-- Who gave the work, and what a run had produced so far.
--
-- 1. people.user_id links a Telegram identity to a workspace member, so a
--    message from Thierry's phone is known to be Thierry. Nullable: plenty of
--    Telegram contacts are customers, not members.
--
-- 2. agent_runs.user_id records the human who triggered a run, when known.
--    Null for cron/heartbeat/standing orders, which nobody triggered.
--
-- 3. agent_runs.partial_content holds the answer as it is being written, so a
--    browser that reloads mid-reply can show progress instead of a blank
--    thread. Cleared when the run finishes — the final text lives in messages.

ALTER TABLE people
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE agent_runs
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE agent_runs
    ADD COLUMN IF NOT EXISTS partial_content text;

-- The floor asks "which runs are live for this session?" on every poll, keyed
-- by the web contact id. Without this it is a sequential scan of every run.
CREATE INDEX IF NOT EXISTS idx_agent_runs_contact_status
    ON agent_runs (channel_contact_id, status);
