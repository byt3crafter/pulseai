-- Phase 8: Plugin System

CREATE TABLE IF NOT EXISTS installed_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  version VARCHAR(50),
  source VARCHAR(20) NOT NULL, -- 'local', 'builtin'
  source_path TEXT,
  config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  installed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_plugin_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plugin_id UUID NOT NULL REFERENCES installed_plugins(id),
  enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  UNIQUE(tenant_id, plugin_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_plugin_tenant ON tenant_plugin_configs(tenant_id);
