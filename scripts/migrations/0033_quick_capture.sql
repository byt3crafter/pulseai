-- Quick-capture suite: notes (notepad), todos, bookmarks (web + YouTube).
-- Simple per-tenant lists shared by the agent tools and the dashboard.

CREATE TABLE IF NOT EXISTS notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    title text,
    body text NOT NULL,
    pinned boolean DEFAULT false,
    tags text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_tenant ON notes (tenant_id);

CREATE TABLE IF NOT EXISTS todos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    text text NOT NULL,
    done boolean DEFAULT false,
    done_at timestamptz,
    due_at timestamptz,
    priority varchar(16) DEFAULT 'normal',
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_todos_tenant ON todos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_todos_tenant_done ON todos (tenant_id, done);

CREATE TABLE IF NOT EXISTS bookmarks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    url text NOT NULL,
    title text,
    notes text,
    kind varchar(16) DEFAULT 'web',
    tags text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_tenant ON bookmarks (tenant_id);
