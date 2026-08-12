-- Document locker / file store. Holds uploaded files + agent-generated files
-- (filled PDFs). content = base64 of raw bytes; extracted_text = searchable text.

CREATE TABLE IF NOT EXISTS documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    filename text NOT NULL,
    mime_type varchar(128),
    size_bytes integer,
    content text,
    extracted_text text,
    title text,
    notes text,
    tags text,
    source varchar(16) DEFAULT 'upload',
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents (tenant_id);
