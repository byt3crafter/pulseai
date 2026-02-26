-- Phase 1: Feature configs for OpenClaw-inspired features
-- Adds heartbeat, sandbox, tool policy configs to agent profiles
-- Adds API tokens table for OpenAI-compatible API
-- Adds gateway config to global settings

-- Agent profile extended configs
ALTER TABLE agent_profiles ADD COLUMN heartbeat_config JSONB DEFAULT '{}';
ALTER TABLE agent_profiles ADD COLUMN sandbox_config JSONB DEFAULT '{}';
ALTER TABLE agent_profiles ADD COLUMN tool_policy JSONB DEFAULT '{}';

-- API tokens for OpenAI-compatible HTTP API
CREATE TABLE api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'API Token',
    scopes TEXT[] DEFAULT '{"chat","responses"}',
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_api_tokens_hash ON api_tokens(token_hash);
CREATE INDEX idx_api_tokens_tenant ON api_tokens(tenant_id);

-- Gateway config on global settings (hot-reloadable)
ALTER TABLE global_settings ADD COLUMN gateway_config JSONB DEFAULT '{}';
