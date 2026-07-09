-- 0018_agent_identity.sql
-- Agent profile picture + role/title, shown across the dashboard (agent list,
-- agent detail header). Idempotent; both columns are nullable so existing
-- agents fall back to initials-based avatars and no subtitle.

ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS title VARCHAR(160);
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS avatar TEXT;
