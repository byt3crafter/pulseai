-- Phase 7: Multi-Agent Orchestration

-- Add delegation config to agent profiles
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS delegation_config JSONB DEFAULT '{}';
-- delegation_config: {
--   canDelegate: boolean,
--   acceptsDelegation: boolean,
--   delegateTo: string[] (allowed target agent IDs, empty = all),
--   maxDepth: number (prevent infinite chains, default: 3),
--   specialization: string (description for other agents)
-- }

-- Track delegation relationships and history
CREATE TABLE IF NOT EXISTS agent_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_agent_id UUID NOT NULL REFERENCES agent_profiles(id),
  target_agent_id UUID NOT NULL REFERENCES agent_profiles(id),
  conversation_id UUID REFERENCES conversations(id),
  task TEXT NOT NULL,
  result TEXT,
  status VARCHAR(20) NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  tokens_used INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_delegations_source ON agent_delegations(source_agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_delegations_tenant ON agent_delegations(tenant_id, started_at DESC);
