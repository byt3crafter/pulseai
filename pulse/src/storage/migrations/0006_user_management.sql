-- Add columns for password management and login tracking
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;--> statement-breakpoint

-- Ensure existing admin doesn't need password change
UPDATE "users" SET "must_change_password" = false WHERE "role" = 'ADMIN';
