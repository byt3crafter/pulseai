-- 0009_two_factor.sql
-- Per-user TOTP two-factor auth. Off by default; secret encrypted at rest.

ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
