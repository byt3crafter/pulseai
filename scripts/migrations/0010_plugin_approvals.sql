-- 0010_plugin_approvals.sql
-- Signed-manifest / least-privilege plugin approvals. A plugin's declared
-- capabilities are hashed; an admin approves that hash; the gateway only
-- activates a plugin when approved_hash = manifest_hash. Existing plugins are
-- grandfathered by the gateway on first load (approved_hash set to current hash).

ALTER TABLE installed_plugins ADD COLUMN IF NOT EXISTS manifest_hash VARCHAR(64);
ALTER TABLE installed_plugins ADD COLUMN IF NOT EXISTS approved_hash VARCHAR(64);
ALTER TABLE installed_plugins ADD COLUMN IF NOT EXISTS declared_permissions JSONB DEFAULT '{}';
ALTER TABLE installed_plugins ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE installed_plugins ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
