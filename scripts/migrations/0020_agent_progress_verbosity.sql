-- 0020_agent_progress_verbosity.sql
-- Per-agent progress-update verbosity for channel streaming:
-- 'off' (silent until done) | 'progress' (tool-step trail, default) | 'verbose' (steps + reasoning).
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS progress_verbosity VARCHAR(12);
