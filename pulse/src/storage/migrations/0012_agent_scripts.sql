-- Phase 3: Python Sandbox & Script Persistence
CREATE TABLE IF NOT EXISTS agent_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id UUID NOT NULL REFERENCES agent_profiles(id),
  filename VARCHAR(255) NOT NULL,
  description TEXT,
  language VARCHAR(20) DEFAULT 'python',
  code TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, filename)
);
CREATE INDEX IF NOT EXISTS idx_scripts_agent ON agent_scripts(agent_id);
