-- Let one workspace hold the same credential name scoped to different agents.
--
-- Was: UNIQUE (tenant_id, name) — so a workspace could have exactly ONE
-- ERPNEXT_URL, blocking a second ERPNext instance even though the vault already
-- resolves agent-specific credentials over tenant-wide ones (getEnvVars sorts
-- agent-scoped last). The constraint was the only thing in the way.
--
-- Now: two PARTIAL uniques, because a plain UNIQUE(tenant_id, name, agent_id)
-- would NOT catch two tenant-wide rows — Postgres treats NULL agent_ids as
-- distinct, so duplicates would slip through. Split it:
--   * one tenant-wide credential per name  (agent_id IS NULL)
--   * one per agent per name               (agent_id IS NOT NULL)
--
-- Result: a tenant-wide ERPNEXT_URL AND a per-agent ERPNEXT_URL for a different
-- agent can coexist; the per-agent one overrides for that agent.

ALTER TABLE credentials DROP CONSTRAINT IF EXISTS idx_unique_credential;
DROP INDEX IF EXISTS idx_unique_credential;

CREATE UNIQUE INDEX IF NOT EXISTS credentials_tenant_name_global
    ON credentials (tenant_id, name) WHERE agent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS credentials_tenant_name_agent
    ON credentials (tenant_id, name, agent_id) WHERE agent_id IS NOT NULL;
