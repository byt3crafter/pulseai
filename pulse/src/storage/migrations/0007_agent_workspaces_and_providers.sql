-- Phase 10: Agent Workspaces, Multi-Provider Registry & BYOK Key Management
-- Migration: 0007_agent_workspaces_and_providers

-- Add model and workspace columns to agent_profiles
ALTER TABLE "agent_profiles" ADD COLUMN "model_id" varchar(100) DEFAULT 'claude-sonnet-4-20250514';
ALTER TABLE "agent_profiles" ADD COLUMN "workspace_path" varchar(512);

-- Workspace revision history for SOUL.md, IDENTITY.md etc.
CREATE TABLE IF NOT EXISTS "workspace_revisions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "agent_profile_id" uuid NOT NULL REFERENCES "agent_profiles"("id") ON DELETE CASCADE,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
    "file_name" varchar(255) NOT NULL,
    "content" text NOT NULL,
    "change_summary" varchar(500),
    "changed_by" uuid REFERENCES "users"("id"),
    "revision_number" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX "idx_workspace_revisions_agent_file" ON "workspace_revisions" ("agent_profile_id", "file_name", "revision_number");

-- Tenant BYOK provider keys (encrypted at rest)
CREATE TABLE IF NOT EXISTS "tenant_provider_keys" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "provider" varchar(50) NOT NULL,
    "auth_method" varchar(20) NOT NULL DEFAULT 'api_key',
    "encrypted_api_key" text,
    "oauth_client_id" varchar(255),
    "oauth_client_secret_enc" text,
    "oauth_access_token_enc" text,
    "oauth_refresh_token_enc" text,
    "oauth_token_expires_at" timestamp with time zone,
    "key_alias" varchar(100),
    "is_active" boolean DEFAULT true,
    "last_validated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "idx_unique_tenant_provider" UNIQUE ("tenant_id", "provider")
);

CREATE INDEX "idx_tenant_provider_keys_tenant" ON "tenant_provider_keys" ("tenant_id");
