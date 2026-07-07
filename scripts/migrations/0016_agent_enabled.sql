-- 0016_agent_enabled.sql
-- Per-agent enable/disable. Disabled agents don't respond or route (paused
-- without deleting). Idempotent; defaults existing agents to enabled.

ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
