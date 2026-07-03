-- 0014_tool_scoping.sql
-- Scope a custom tool to specific agents. Empty array = available to all the
-- tenant's agents (current behavior); non-empty = only those agent profile ids.

ALTER TABLE custom_tools ADD COLUMN IF NOT EXISTS allowed_agent_ids JSONB NOT NULL DEFAULT '[]';
