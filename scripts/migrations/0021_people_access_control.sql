-- 0021_people_access_control.sql
-- Account-wide, Telegram-ID-based access control ("People").
-- One row per human a tenant has ever heard from, across all channels/groups/DMs
-- (scope is account-wide, not per-channel). `access` gates whether agents will
-- respond to this person at all: 'talk' | 'observe' (default) | 'blocked'.
-- `allowed_agent_ids` (jsonb array, empty = all) further restricts which agents
-- they may address. `is_approver` / `approval_mode` are stored for a later
-- approval-workflow stage — NOT enforced yet.
CREATE TABLE IF NOT EXISTS people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    telegram_user_id VARCHAR(32) NOT NULL,
    display_name VARCHAR(255),
    username VARCHAR(255),
    access VARCHAR(12) NOT NULL DEFAULT 'observe',
    is_approver BOOLEAN NOT NULL DEFAULT false,
    approval_mode VARCHAR(20) NOT NULL DEFAULT 'auto',
    allowed_agent_ids JSONB NOT NULL DEFAULT '[]',
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_people_tenant_telegram
    ON people (tenant_id, telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_people_tenant
    ON people (tenant_id);
