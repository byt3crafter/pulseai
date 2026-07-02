-- 0013_custom_tools.sql
-- Per-tenant custom HTTP tools — connect a customer's own API/software so agents
-- can call it. Each row becomes an agent tool at runtime. Auth headers are stored
-- encrypted (AES-256-GCM) at the app layer in headers_enc.

CREATE TABLE IF NOT EXISTS custom_tools (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    name          VARCHAR(64) NOT NULL,          -- tool name exposed to the LLM (snake_case)
    description   TEXT NOT NULL,                 -- what it does — the LLM reads this
    method        VARCHAR(8) NOT NULL DEFAULT 'GET',
    url_template  TEXT NOT NULL,                 -- supports {param} placeholders
    headers_enc   TEXT,                          -- encrypted JSON of static/auth headers
    body_template TEXT,                          -- optional; supports {param} placeholders
    param_schema  JSONB NOT NULL DEFAULT '{}',   -- { properties, required }
    timeout_ms    INTEGER NOT NULL DEFAULT 15000,
    enabled       BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_tools_tenant ON custom_tools(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_custom_tool_name ON custom_tools(tenant_id, name);
