-- Model groups: a named, ordered set of models an agent auto-picks from.
--
-- Replaces two hardcoded things with config:
--   1. getFallbackModelId()'s hardcoded model->model map (provider fallback)
--   2. smart routing's two fixed slots (capable + fast)
--
-- The group IS the configuration. Zero hardcoding: the model list and the
-- pick STRATEGY are both stored and edited in the app.
--
-- See docs/MODEL_GROUPS_PLAN.md.

CREATE TABLE IF NOT EXISTS model_groups (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        varchar(120) NOT NULL,

    -- failover  — use the first model; on error/rate-limit fall through in order
    -- cost      — cheapest model for simple turns, capable for complex/tool turns
    -- both      — cost-tier to choose, failover within the choice
    strategy    varchar(24) NOT NULL DEFAULT 'failover',

    -- Ordered list of model ids, e.g. ["MiniMax-M3","gpt-5.5","claude-sonnet-4-6"].
    -- Order is the failover order and, for cost, cheap -> capable.
    models      jsonb NOT NULL DEFAULT '[]',

    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_model_groups_tenant ON model_groups (tenant_id);

-- An agent may point at a group instead of a single model. NULL = use modelId
-- as today, so nothing changes for existing agents.
ALTER TABLE agent_profiles
    ADD COLUMN IF NOT EXISTS model_group_id uuid REFERENCES model_groups(id) ON DELETE SET NULL;

COMMENT ON TABLE model_groups IS
    'A named, ordered set of models an agent auto-picks from, with a selectable strategy. Replaces the hardcoded fallback map.';
