-- Pairing codes table for DM approval flow
CREATE TABLE pairing_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    channel_type VARCHAR(50) NOT NULL,
    contact_id VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    code VARCHAR(8) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_pairing_code ON pairing_codes(code);
CREATE INDEX idx_pairing_tenant ON pairing_codes(tenant_id, status);

-- Add contact_type to allowlists (user vs group)
ALTER TABLE allowlists ADD COLUMN contact_type VARCHAR(20) DEFAULT 'user';

-- Add PKCE columns to oauth_codes for Claude Code / Codex
ALTER TABLE oauth_codes ADD COLUMN code_challenge VARCHAR(255);
ALTER TABLE oauth_codes ADD COLUMN code_challenge_method VARCHAR(10);
