-- Phase 2: Credential Vault
CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id UUID REFERENCES agent_profiles(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  credential_type VARCHAR(20) DEFAULT 'api_key',
  encrypted_value TEXT NOT NULL,
  oauth_client_id TEXT,
  oauth_encrypted_refresh_token TEXT,
  oauth_token_url TEXT,
  oauth_scopes TEXT,
  oauth_expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_credentials_tenant ON credentials(tenant_id);
