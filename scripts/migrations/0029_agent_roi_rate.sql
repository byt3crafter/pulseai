-- Per-agent ROI hourly rate: the hourly value of the human this agent replaces,
-- set by the tenant. Nullable — an agent with no rate contributes to "hours
-- saved" but not to "money saved". Drives the Analytics ROI estimate.
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS roi_hourly_rate numeric(10,2);
