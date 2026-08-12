-- In-app notification inbox. Agent + system notifications per tenant.
CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    agent_id uuid REFERENCES agent_profiles(id),
    title text NOT NULL,
    body text,
    kind varchar(24) DEFAULT 'info',
    priority varchar(12) DEFAULT 'normal',
    link text,
    read boolean DEFAULT false,
    read_at timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_read ON notifications (tenant_id, read);
