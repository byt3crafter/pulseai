-- 0006_account_email_flows.sql
-- Adds email verification tracking and password reset / invite tokens
-- for the dashboard's email-based account flows (forgot-password, invites).

-- Track when a user's email was verified (NULL = unverified).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified TIMESTAMPTZ;

-- Password reset + invite tokens. The raw token is emailed to the user;
-- only its sha256 hash is stored here.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'reset', -- 'reset' | 'invite'
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id);
