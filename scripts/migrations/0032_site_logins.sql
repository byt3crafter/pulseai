-- Password vault: site logins (username + AES-256-GCM password). Passwords are
-- never returned to the model; the runtime fills them into the browser directly.
CREATE TABLE IF NOT EXISTS site_logins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    agent_id uuid REFERENCES agent_profiles(id),
    label text NOT NULL,
    site text,
    username text NOT NULL,
    encrypted_password text NOT NULL,
    notes text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_logins_tenant ON site_logins(tenant_id);
