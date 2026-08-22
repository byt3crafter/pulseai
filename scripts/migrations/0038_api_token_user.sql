-- Browser chat tokens carry the signed-in user, so the agent knows exactly who is
-- talking (not just which tenant). Null for tenant-level API tokens.
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;
