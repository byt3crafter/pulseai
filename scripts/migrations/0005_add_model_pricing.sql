-- Migration 0005: Dynamic model pricing
-- Moves model/pricing definitions from hardcoded registry to database

CREATE TABLE IF NOT EXISTS model_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    category VARCHAR(20) NOT NULL DEFAULT 'flagship',
    base_input_per_million DECIMAL(10,4) NOT NULL DEFAULT 0,
    base_output_per_million DECIMAL(10,4) NOT NULL DEFAULT 0,
    customer_input_per_million DECIMAL(10,4) NOT NULL DEFAULT 0,
    customer_output_per_million DECIMAL(10,4) NOT NULL DEFAULT 0,
    max_tokens INTEGER NOT NULL DEFAULT 8192,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider, model_id)
);

CREATE INDEX idx_model_pricing_provider ON model_pricing(provider);
CREATE INDEX idx_model_pricing_active ON model_pricing(is_active);

-- Add base_cost_usd to usage_records for profit tracking
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS base_cost_usd DECIMAL(10,6) DEFAULT '0';

-- Seed with current hardcoded models and real provider pricing
INSERT INTO model_pricing (provider, model_id, display_name, category, base_input_per_million, base_output_per_million, customer_input_per_million, customer_output_per_million, max_tokens) VALUES
    -- Anthropic
    ('anthropic', 'claude-opus-4-6', 'Claude Opus 4.6', 'flagship', 15.0, 75.0, 15.0, 75.0, 32768),
    ('anthropic', 'claude-sonnet-4-6', 'Claude Sonnet 4.6', 'flagship', 3.0, 15.0, 3.0, 15.0, 16384),
    ('anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 'flagship', 3.0, 15.0, 3.0, 15.0, 8192),
    ('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 'fast', 0.8, 4.0, 0.8, 4.0, 8192),
    ('anthropic', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 'fast', 3.0, 15.0, 3.0, 15.0, 8192),
    ('anthropic', 'claude-3-haiku-20240307', 'Claude 3 Haiku', 'fast', 0.25, 1.25, 0.25, 1.25, 4096),
    -- OpenAI (real models only, no fictional ones)
    ('openai', 'gpt-4.1', 'GPT-4.1', 'flagship', 2.0, 8.0, 2.0, 8.0, 32768),
    ('openai', 'gpt-4o', 'GPT-4o', 'flagship', 2.5, 10.0, 2.5, 10.0, 16384),
    ('openai', 'gpt-4o-mini', 'GPT-4o Mini', 'fast', 0.15, 0.6, 0.15, 0.6, 16384),
    ('openai', 'gpt-4-turbo', 'GPT-4 Turbo', 'flagship', 10.0, 30.0, 10.0, 30.0, 4096),
    ('openai', 'o1', 'o1', 'reasoning', 15.0, 60.0, 15.0, 60.0, 32768),
    ('openai', 'o3-mini', 'o3 Mini', 'reasoning', 1.1, 4.4, 1.1, 4.4, 16384),
    -- Google
    ('google', 'gemini-2.0-flash', 'Gemini 2.0 Flash', 'fast', 0.1, 0.4, 0.1, 0.4, 8192),
    ('google', 'gemini-1.5-pro', 'Gemini 1.5 Pro', 'flagship', 1.25, 5.0, 1.25, 5.0, 8192),
    -- OpenRouter
    ('openrouter', 'openrouter/auto', 'OpenRouter (Auto)', 'passthrough', 3.0, 15.0, 3.0, 15.0, 4096)
ON CONFLICT (provider, model_id) DO NOTHING;
