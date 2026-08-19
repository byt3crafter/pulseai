-- Smart model routing: per-agent optional fast model for trivial, tool-free turns.
-- When smart_routing is on, the runtime routes trivial messages to fast_model_id and
-- anything with tools/attachments/complexity to the agent's capable model_id.
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS smart_routing boolean DEFAULT false;
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS fast_model_id varchar(100);
