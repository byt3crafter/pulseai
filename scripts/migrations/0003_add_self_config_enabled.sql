-- Add self_config_enabled flag to agent_profiles
-- When true, the agent gets a workspace_update tool to modify its own workspace files.
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS self_config_enabled BOOLEAN NOT NULL DEFAULT false;
