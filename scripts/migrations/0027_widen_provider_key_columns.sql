-- Widen the admin/global provider-key columns from varchar(255) to text.
--
-- These columns were originally sized for a sha256 hex hash (64 chars) but are
-- now used to store AES-256-GCM ciphertext of the API key (iv:tag:ciphertext).
-- A modern Anthropic key (~108 chars) encrypts to ~274 chars and an OpenAI
-- sk-proj key (~164 chars) to ~386 chars, both over 255 — so saving a global
-- provider key silently failed with "value too long for type character varying".
-- Widening to text is a safe, non-destructive change.

ALTER TABLE global_settings ALTER COLUMN anthropic_api_key_hash TYPE text;
ALTER TABLE global_settings ALTER COLUMN openai_api_key_hash TYPE text;
