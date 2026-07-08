-- 0022_approval_workflow.sql
-- Stage 2 of People access control: a Telegram-based approval workflow.
-- Designated approvers (people.is_approver = true) approve gated actions via
-- inline-keyboard cards sent to their Telegram DM. Two gated flows:
--   (a) a person whose people.approval_mode = 'requires_approval' — every
--       inbound message from them needs approval before the agent acts.
--   (b) a server command on a server whose approval_mode requires it.
-- See pulse/src/channels/approval-service.ts for the enforcement logic.
CREATE TABLE IF NOT EXISTS pending_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    kind VARCHAR(20) NOT NULL,                      -- 'user_request' | 'command'
    status VARCHAR(12) NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'denied' | 'expired'
    requester_telegram_id VARCHAR(32),
    agent_profile_id UUID REFERENCES agent_profiles(id),
    server_id UUID REFERENCES servers(id),
    summary TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',            -- enough to resume, e.g. {command, serverName}
    channel_type VARCHAR(20),
    channel_contact_id VARCHAR(255),
    approval_message_ids JSONB NOT NULL DEFAULT '{}', -- {approverTelegramId: messageId} — to edit cards after decision
    decided_by VARCHAR(32),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_approvals_tenant_status
    ON pending_approvals (tenant_id, status);

-- Servers: per-server approval requirement for server_exec commands.
-- 'off' = never require approval (default, backward compatible);
-- 'writes' = any command NOT classified read-only by command-policy;
-- 'all' = every command, including read-only ones.
ALTER TABLE servers ADD COLUMN IF NOT EXISTS approval_mode VARCHAR(10) NOT NULL DEFAULT 'off';
