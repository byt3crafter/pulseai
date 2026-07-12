-- Commitments: agent follow-up "check-ins" (inferred or explicit). Delivery
-- behaviour when due is a per-tenant setting (tenants.config.commitments.deliveryMode:
-- channel | owner | internal) — nothing hardcoded.
CREATE TABLE IF NOT EXISTS commitments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    agent_id            uuid REFERENCES agent_profiles(id),
    conversation_id     uuid,
    channel_type        varchar(30),
    channel_contact_id  varchar(255),
    summary             text NOT NULL,
    due_at              timestamptz NOT NULL,
    status              varchar(20) NOT NULL DEFAULT 'pending', -- pending | delivered | done | dismissed | expired
    delivered_at        timestamptz,
    metadata            jsonb NOT NULL DEFAULT '{}',
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commitments_due ON commitments (status, due_at);
CREATE INDEX IF NOT EXISTS idx_commitments_tenant ON commitments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_commitments_agent ON commitments (agent_id);
