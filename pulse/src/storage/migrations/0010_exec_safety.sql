-- Phase 1: Exec Safety System
-- Audit trail for all command executions
CREATE TABLE IF NOT EXISTS exec_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id UUID REFERENCES agent_profiles(id),
  conversation_id UUID REFERENCES conversations(id),
  command TEXT NOT NULL,
  decision VARCHAR(20) NOT NULL,
  reason TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exec_audit_tenant ON exec_audit_log(tenant_id, executed_at DESC);

-- Per-tenant exec policy rules (admin sets global defaults, tenants override)
CREATE TABLE IF NOT EXISTS exec_policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  agent_id UUID REFERENCES agent_profiles(id),
  rule_type VARCHAR(10) NOT NULL,
  pattern TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exec_policy_tenant ON exec_policy_rules(tenant_id);
