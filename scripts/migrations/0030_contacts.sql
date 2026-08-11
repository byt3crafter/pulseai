-- Native contacts store (mini-CRM). The agent uses this when a tenant's
-- contacts source is "native"; ERPNext/Google are used when configured.
CREATE TABLE IF NOT EXISTS contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    name text NOT NULL,
    email varchar(320),
    phone varchar(64),
    company text,
    title text,
    notes text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_name ON contacts(tenant_id, name);
