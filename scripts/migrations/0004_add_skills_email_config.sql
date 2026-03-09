-- Migration 0004: Add skill_config and email_config to agent_profiles
-- Skills: per-agent skill overrides (enabled/disabled built-in skills, custom skills)
-- Email: per-agent email configuration override

ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS skill_config JSONB NOT NULL DEFAULT '{}';
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS email_config JSONB NOT NULL DEFAULT '{}';
