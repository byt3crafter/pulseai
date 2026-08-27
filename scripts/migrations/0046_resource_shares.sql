-- Phase 3: share a private thing with a named person.
--
-- Phase 2 made chats, notes, to-dos and bookmarks private. Without a way to
-- share one, the only way to show a colleague a conversation is to make it
-- workspace-visible to everybody — which is how people end up over-sharing to
-- get work done, and why two visibility levels are not enough.
--
-- Mirrors channel_members, the sharing shape this codebase already uses:
-- a row per (thing, person) with an access level.
--
-- See docs/MULTI_USER_PLAN.md.

CREATE TABLE IF NOT EXISTS resource_shares (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Polymorphic rather than a table per type: the alternative is seven
    -- near-identical join tables and seven places to forget a check.
    resource_type  varchar(32) NOT NULL,   -- conversation | note | todo | bookmark | document
    resource_id    uuid NOT NULL,

    -- Who it is shared WITH. CASCADE: a share has no meaning once the person is
    -- gone, unlike the thing itself, which belongs to its owner.
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Who shared it, for the audit trail and for "shared by" in the UI.
    shared_by      uuid REFERENCES users(id) ON DELETE SET NULL,

    access         varchar(16) NOT NULL DEFAULT 'read',   -- read | write
    created_at     timestamptz NOT NULL DEFAULT now(),

    UNIQUE (resource_type, resource_id, user_id)
);

-- The lookup every scoped read performs: "what is shared with me".
CREATE INDEX IF NOT EXISTS idx_resource_shares_user
    ON resource_shares (user_id, resource_type, resource_id);

COMMENT ON TABLE resource_shares IS
    'Explicit per-person sharing of a private resource. visibility=shared on the resource plus a row here.';
