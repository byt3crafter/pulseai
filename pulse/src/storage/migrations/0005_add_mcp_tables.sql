CREATE TABLE "agent_profile_mcp_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_profile_id" uuid NOT NULL,
	"mcp_server_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "idx_unique_agent_mcp" UNIQUE("agent_profile_id","mcp_server_id")
);
--> statement-breakpoint
CREATE TABLE "agent_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"system_prompt" text,
	"docker_sandbox_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" varchar(1024) NOT NULL,
	"auth_headers" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "channel_connections" ADD COLUMN "agent_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_profile_mcp_bindings" ADD CONSTRAINT "agent_profile_mcp_bindings_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profile_mcp_bindings" ADD CONSTRAINT "agent_profile_mcp_bindings_mcp_server_id_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_profiles_tenant" ON "agent_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_servers_tenant" ON "mcp_servers" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_agent_profile_id_agent_profiles_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE no action ON UPDATE no action;