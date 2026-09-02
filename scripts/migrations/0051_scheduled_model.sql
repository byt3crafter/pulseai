-- Per-agent model for SCHEDULED work (cron jobs + heartbeats).
-- Additive + nullable: existing rows get NULL, and NULL means "use the agent's
-- own model" — i.e. behaviour is byte-identical to before for every agent until
-- someone opts in. Safe to run on a live DB (instant metadata-only ALTER).
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS scheduled_model_id varchar(100);
