CREATE TABLE "global_settings" (
	"id" varchar(50) PRIMARY KEY DEFAULT 'root' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"anthropic_api_key_hash" varchar(255),
	"openai_api_key_hash" varchar(255),
	"updated_at" timestamp with time zone DEFAULT now()
);
