-- 0012_channels_org_model.sql
-- Channels / org model: Company (= tenant) -> Department -> Group/Topic.
-- Channels carry name + description only; the agent carries the "soul".
-- Adds channels + membership tables and makes messages channel-aware.
-- Fully backward compatible: existing 1:1 DM conversations keep working
-- (messages.channel_id stays NULL for them).

-- Departments and groups (one tree per tenant/company)
CREATE TABLE IF NOT EXISTS channels (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    kind          VARCHAR(20) NOT NULL DEFAULT 'department',   -- 'department' | 'group'
    parent_id     UUID REFERENCES channels(id),               -- a group's parent = its department
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    mode          VARCHAR(20) NOT NULL DEFAULT 'single_human', -- 'single_human' | 'multi_human'
    lead_agent_id UUID REFERENCES agent_profiles(id),          -- the manager that answers + routes
    settings      JSONB NOT NULL DEFAULT '{}',
    status        VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channels_tenant ON channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_channels_parent ON channels(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_channel_name ON channels(tenant_id, parent_id, name);

-- Which agents are in a channel + their rank
CREATE TABLE IF NOT EXISTS channel_agents (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id       UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    agent_profile_id UUID NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
    role             VARCHAR(20) NOT NULL DEFAULT 'member',      -- 'lead' | 'member'
    level            INTEGER NOT NULL DEFAULT 0,                 -- seniority; higher = senior
    responds_when    VARCHAR(20) NOT NULL DEFAULT 'mentioned',   -- 'mentioned' | 'lead'
    created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channel_agents_channel ON channel_agents(channel_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_channel_agent ON channel_agents(channel_id, agent_profile_id);

-- Which humans are in a channel + their access (talk vs read-only observe)
CREATE TABLE IF NOT EXISTS channel_members (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       VARCHAR(20) NOT NULL DEFAULT 'member',   -- 'operator' | 'member'
    access     VARCHAR(20) NOT NULL DEFAULT 'talk',     -- 'talk' | 'observe' (read-only)
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_channel_member ON channel_members(channel_id, user_id);

-- Per-user agent assignment inside a channel.
-- No rows for a user = they may talk to ALL channel agents (default).
-- Any rows = that user is restricted to just those agents ("own agent assigned").
CREATE TABLE IF NOT EXISTS channel_member_agents (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id       UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_profile_id UUID NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channel_member_agents_lookup ON channel_member_agents(channel_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_channel_member_agent ON channel_member_agents(channel_id, user_id, agent_profile_id);

-- Make messages channel-aware (nullable = legacy DM message, unchanged)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_id      UUID REFERENCES channels(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_type     VARCHAR(10);  -- 'human' | 'agent'
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_user_id  UUID REFERENCES users(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_agent_id UUID REFERENCES agent_profiles(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS mentions        JSONB DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
