-- 0011_2fa_backup_codes.sql
-- One-time recovery codes for 2FA (sha256-hashed). Lets a user regain access
-- if they lose their authenticator; each code works once.

ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB NOT NULL DEFAULT '[]';
