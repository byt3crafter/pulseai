-- 0007_audit_logs.sql
-- Platform-wide audit trail: who did what, when (enterprise / SOC2 requirement).

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    actor_id UUID REFERENCES users(id),
    actor_email VARCHAR(255),
    actor_role VARCHAR(20),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id VARCHAR(255),
    summary TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    ip VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs (tenant_id);
