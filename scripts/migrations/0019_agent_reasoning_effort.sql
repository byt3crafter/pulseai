-- 0019_agent_reasoning_effort.sql
-- Per-agent "Thinking / Reasoning effort" setting. Nullable — null/absent
-- means "inherit the provider's default" (no override sent). Values are
-- validated at the application layer against: minimal | low | medium | high | xhigh.
-- Idempotent.

ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS reasoning_effort VARCHAR(12);
