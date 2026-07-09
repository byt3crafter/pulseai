-- 0023_approval_allowances.sql
-- Persistent, revocable "Allow always" standing approvals — replaces the old
-- 30-minute in-memory session bypass ("Allow all (session)"). A grant lasts
-- until an admin revokes it from the dashboard (People page / Servers page).
-- See pulse/src/channels/approval-service.ts for the enforcement logic.
CREATE TABLE IF NOT EXISTS approval_allowances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    kind VARCHAR(10) NOT NULL,               -- 'user' | 'server'
    subject VARCHAR(64) NOT NULL,            -- telegram user id (kind='user') or server uuid (kind='server')
    label VARCHAR(255),                      -- human-readable — person name or server name, for the dashboard
    created_by VARCHAR(32),                  -- approver telegram id who granted it
    created_at TIMESTAMPTZ DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_approval_allowances_tenant_revoked
    ON approval_allowances (tenant_id, revoked_at);
