-- 0008_rbac_access_role.sql
-- Granular RBAC: adds users.access_role (role within the plane). Existing users
-- default to 'owner' (full access) so nothing changes until roles are assigned.
-- The plane (platform vs tenant) is still driven by users.role (ADMIN | TENANT).

ALTER TABLE users ADD COLUMN IF NOT EXISTS access_role VARCHAR(20) NOT NULL DEFAULT 'owner';
