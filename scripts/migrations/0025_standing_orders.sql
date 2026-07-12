-- Standing Orders: per-agent "operating programs" a business owner defines once.
-- Structured (scope / trigger / steps / approval gates / escalation / boundaries),
-- injected into the agent's system prompt so it runs the routine autonomously and
-- only escalates exceptions. Nothing hardcoded — all fields are user-authored.
CREATE TABLE IF NOT EXISTS standing_orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id),
    agent_id        uuid NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
    name            varchar(255) NOT NULL,
    enabled         boolean NOT NULL DEFAULT true,
    scope           text,               -- what the agent is authorised to do
    trigger_text    text,               -- when it runs (plain language)
    steps           text,               -- execution steps
    approval_gates  text,               -- actions requiring human sign-off first
    escalation      text,               -- when to stop and ask for help
    boundaries      text,               -- what NOT to do
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_standing_orders_agent ON standing_orders (agent_id);
CREATE INDEX IF NOT EXISTS idx_standing_orders_tenant ON standing_orders (tenant_id);
