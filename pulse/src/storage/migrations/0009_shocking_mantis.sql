CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"name" text DEFAULT 'API Token' NOT NULL,
	"scopes" text[] DEFAULT '{"chat","responses"}',
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"channel_type" varchar(50) NOT NULL,
	"contact_id" varchar(255) NOT NULL,
	"contact_name" varchar(255),
	"code" varchar(8) NOT NULL,
	"status" varchar(20) DEFAULT 'pending',
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_provider_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"auth_method" varchar(20) DEFAULT 'api_key' NOT NULL,
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
	CONSTRAINT "idx_unique_tenant_provider" UNIQUE("tenant_id","provider")
);
--> statement-breakpoint
CREATE TABLE "workspace_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_profile_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"change_summary" varchar(500),
	"changed_by" uuid,
	"revision_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "model_id" varchar(100) DEFAULT 'claude-sonnet-4-20250514';--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "workspace_path" varchar(512);--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "heartbeat_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "sandbox_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "tool_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "allowlists" ADD COLUMN "contact_type" varchar(20) DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "global_settings" ADD COLUMN "gateway_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD COLUMN "code_challenge" varchar(255);--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD COLUMN "code_challenge_method" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_provider_keys" ADD CONSTRAINT "tenant_provider_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_revisions" ADD CONSTRAINT "workspace_revisions_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_revisions" ADD CONSTRAINT "workspace_revisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_revisions" ADD CONSTRAINT "workspace_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_tokens_hash" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_api_tokens_tenant" ON "api_tokens" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_pairing_code" ON "pairing_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_pairing_tenant" ON "pairing_codes" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_tenant_provider_keys_tenant" ON "tenant_provider_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_revisions_agent_file" ON "workspace_revisions" USING btree ("agent_profile_id","file_name","revision_number");