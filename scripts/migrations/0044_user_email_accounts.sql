-- Phase 4: each person can connect their own mailbox.
--
-- resolveEmailConfig(tenantId, agentProfileId) has no user in its signature, so
-- when anyone asks an agent to "check my email" it opens the AGENT's or the
-- WORKSPACE's mailbox. In a one-person workspace that looks correct. With a
-- team it means one person's mail is read, and replied to, on behalf of another.
--
-- Two layers, deliberately kept apart:
--   the agent's own mailbox  = the agent's identity (Natalie writes as Natalie)
--   a user's mailbox         = delegation (the agent acts FOR that person)
--
-- Credentials use the same AES-256-GCM envelope as every other secret here
-- (iv:authTag:ciphertext); nothing is stored in the clear.
--
-- See docs/MULTI_USER_PLAN.md.

CREATE TABLE IF NOT EXISTS user_email_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- The mailbox belongs to the person. If they leave, it goes with them —
    -- unlike workspace data, a personal mailbox must NOT outlive its owner.
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    email_address   varchar(320) NOT NULL,
    display_name    varchar(255),

    smtp_host       varchar(255),
    smtp_port       integer,
    smtp_secure     boolean NOT NULL DEFAULT true,
    smtp_username   varchar(255),
    smtp_password   text,              -- encrypted
    imap_host       varchar(255),
    imap_port       integer,
    imap_secure     boolean NOT NULL DEFAULT true,
    imap_username   varchar(255),
    imap_password   text,              -- encrypted

    enabled         boolean NOT NULL DEFAULT true,
    last_verified_at timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- One mailbox per person for now. Multiple accounts is a later question and
    -- a unique constraint is far easier to relax than to add.
    UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_email_accounts_tenant ON user_email_accounts (tenant_id);

COMMENT ON TABLE user_email_accounts IS
    'Per-user mailbox so an agent can act on that person''s behalf. The agent''s own mailbox stays in agent_profiles.email_config.';
