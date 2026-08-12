-- Expenses ledger + hybrid tasks/projects tracker.

CREATE TABLE IF NOT EXISTS expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    amount numeric(14,2) NOT NULL,
    currency varchar(8),
    vendor text,
    category text,
    description text,
    spent_at timestamptz,
    receipt_document_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_spent ON expenses (tenant_id, spent_at);

CREATE TABLE IF NOT EXISTS tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    title text NOT NULL,
    description text,
    status varchar(16) DEFAULT 'todo',
    priority varchar(16) DEFAULT 'normal',
    parent_id uuid,
    agent_id uuid REFERENCES agent_profiles(id),
    source varchar(16) DEFAULT 'user',
    conversation_id uuid,
    due_at timestamptz,
    done_at timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks (tenant_id, status);
