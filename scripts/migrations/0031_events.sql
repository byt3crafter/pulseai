-- Native user calendar (events). Google Calendar backend added later.
CREATE TABLE IF NOT EXISTS events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    title text NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    all_day boolean DEFAULT false,
    location text,
    notes text,
    attendees text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_events_tenant_start ON events(tenant_id, starts_at);
