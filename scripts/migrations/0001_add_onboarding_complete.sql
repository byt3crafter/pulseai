-- Migration 0001: Add onboarding_complete column to users table
-- Applied by: Onboarding Wizard feature
-- Date: 2026-02-26

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT true;

-- Mark existing tenant users with mustChangePassword as needing onboarding
UPDATE users SET onboarding_complete = false
WHERE must_change_password = true AND role = 'TENANT';
