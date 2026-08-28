-- Agent Skills (SKILL.md) — storage + the three-step gating chain.
--
-- NOT to be confused with `tenant_skills`, which despite the name is a
-- per-tenant on/off gate keyed by built-in TOOL name (email_send, note_save).
-- Nothing in that table parses SKILL.md. See docs/SKILLS_PLAN.md; a later
-- phase renames it to tenant_tools, which is what it has always meant.
--
-- Gating deliberately mirrors the tool-policy chain, because a second mental
-- model for "who can use what" is how a permission gets granted by accident:
--
--   admin approves a PACK -> tenant grants a SKILL -> agent is ASSIGNED it
--
-- Everything is off at every level by default. An agent with no assignments
-- gets no catalogue and no skill tool — identical to today's behaviour.

-- A pack is an imported source: a git repo, an upload, or something bundled.
CREATE TABLE IF NOT EXISTS skill_packs (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name               varchar(120) NOT NULL,
    slug               varchar(120) NOT NULL UNIQUE,
    source_type        varchar(16)  NOT NULL DEFAULT 'git',   -- git | upload | builtin
    source_url         text,
    source_ref         varchar(120),

    -- Content hash over every skill in the pack. `approved_checksum` is what an
    -- admin actually signed off. They differ after an upstream edit, which
    -- deactivates the pack until someone looks again — these are third-party
    -- instructions aimed at an LLM holding tools, so a silent change is the
    -- thing to prevent.
    pack_checksum      varchar(64),
    approved_checksum  varchar(64),
    approved_by        uuid REFERENCES users(id) ON DELETE SET NULL,
    approved_at        timestamptz,

    skill_count        integer NOT NULL DEFAULT 0,
    skipped_count      integer NOT NULL DEFAULT 0,
    last_import_at     timestamptz,
    last_import_error  text,
    -- What could not be imported, with reasons — visible rather than missing.
    skipped            jsonb NOT NULL DEFAULT '[]',

    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- One row per SKILL.md.
CREATE TABLE IF NOT EXISTS skill_definitions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id        uuid REFERENCES skill_packs(id) ON DELETE CASCADE,
    -- Set when a tenant authored the skill itself rather than importing it.
    -- CASCADE: a workspace's own skill has no meaning without the workspace.
    tenant_id      uuid REFERENCES tenants(id) ON DELETE CASCADE,

    name           varchar(96)  NOT NULL,
    -- The plugin/department inside the pack. Part of the identity:
    -- claude-for-legal ships twelve different skills named `customize`.
    plugin         varchar(120),
    qualified_name varchar(220) NOT NULL,

    description    text NOT NULL,   -- the ONE line every request carries
    body           text NOT NULL,   -- fetched on demand, never in the catalogue
    requires_bins  jsonb NOT NULL DEFAULT '[]',
    source_path    text,
    checksum       varchar(64) NOT NULL,

    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Unique within a pack, and separately within a tenant's own authored set.
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_def_pack
    ON skill_definitions (pack_id, qualified_name) WHERE pack_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_def_tenant
    ON skill_definitions (tenant_id, qualified_name) WHERE tenant_id IS NOT NULL;

-- Step 2: the tenant admits a skill into its library.
CREATE TABLE IF NOT EXISTS tenant_skill_grants (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    skill_id   uuid NOT NULL REFERENCES skill_definitions(id) ON DELETE CASCADE,
    enabled    boolean NOT NULL DEFAULT true,
    granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, skill_id)
);

-- Step 3: this agent actually carries it. Keeps the catalogue small — 802
-- skills across three packs would be ~64k tokens on every single request.
CREATE TABLE IF NOT EXISTS agent_skill_assignments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_profile_id uuid NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
    skill_id         uuid NOT NULL REFERENCES skill_definitions(id) ON DELETE CASCADE,
    assigned_by      uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (agent_profile_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_def_pack_id   ON skill_definitions (pack_id);
CREATE INDEX IF NOT EXISTS idx_tenant_skill_grants ON tenant_skill_grants (tenant_id, enabled);
CREATE INDEX IF NOT EXISTS idx_agent_skill_assign  ON agent_skill_assignments (agent_profile_id);
