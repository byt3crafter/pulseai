-- 0017_servers.sql
-- Server Inventory: tenants register VPS/servers with per-server guardrails,
-- assign them to specific agents, and agents get SSH tools whose safety is
-- enforced in code (see pulse/src/servers/command-policy.ts). Secrets
-- (SSH key or password) are encrypted at rest with the shared AES-256-GCM key.
--
-- Access model is default-deny: allowed_agent_ids empty = NO agent can use the
-- server (unlike custom_tools, where empty means "all agents"). This is
-- infrastructure access — explicit assignment is required.

CREATE TABLE IF NOT EXISTS servers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES tenants(id),
    name               VARCHAR(120) NOT NULL,
    host               VARCHAR(255) NOT NULL,
    port               INTEGER NOT NULL DEFAULT 22,
    username           VARCHAR(120) NOT NULL,
    auth_type          VARCHAR(10) NOT NULL DEFAULT 'key',      -- 'key' | 'password'
    encrypted_secret   TEXT NOT NULL,                           -- AES-256-GCM: private key or password
    environment        VARCHAR(12) NOT NULL DEFAULT 'dev',      -- 'production' | 'staging' | 'dev'
    safety_mode        VARCHAR(10) NOT NULL DEFAULT 'observe',  -- 'observe' | 'safe' | 'full'
    instructions       TEXT,                                    -- operator guidance shown to the agent verbatim
    allowed_agent_ids  JSONB NOT NULL DEFAULT '[]',             -- [] = NO agent access (default-deny; explicit assignment required)
    enabled            BOOLEAN NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servers_tenant ON servers(tenant_id);

CREATE TABLE IF NOT EXISTS server_exec_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    server_id     UUID NOT NULL REFERENCES servers(id),
    agent_id      UUID REFERENCES agent_profiles(id),
    command       TEXT NOT NULL,
    blocked       BOOLEAN NOT NULL DEFAULT false,
    block_reason  TEXT,
    exit_code     INTEGER,
    duration_ms   INTEGER,
    output_head   TEXT,                                          -- first 500 chars of stdout+stderr
    created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_server_exec_logs_tenant ON server_exec_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_server_exec_logs_server ON server_exec_logs(server_id, created_at);
