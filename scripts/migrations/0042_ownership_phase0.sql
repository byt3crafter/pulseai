-- Multi-user Phase 0: record ownership. Nothing becomes private yet.
--
-- Every user-facing table is scoped by tenant_id alone, so a workspace with two
-- people is a workspace where each can read the other's chats, notes and
-- expenses. This adds the two columns needed to express "mine" — and only that.
-- Defaults keep every row workspace-visible, so behaviour is unchanged until
-- Phase 2 flips defaults per entity.
--
-- owner_user_id is ON DELETE SET NULL, never CASCADE: removing a person must
-- convert their workspace rows to workspace-owned, not destroy company data.
-- (Google Drive's "My Drive by default" is the cautionary tale.)
--
-- See docs/MULTI_USER_PLAN.md.

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['conversations','contacts','notes','todos','bookmarks','expenses','documents']
    LOOP
        EXECUTE format(
            'ALTER TABLE %I
                 ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
                 ADD COLUMN IF NOT EXISTS visibility varchar(16) NOT NULL DEFAULT ''workspace''', t);
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_%s_owner ON %I (tenant_id, owner_user_id)', t, t);
    END LOOP;
END $$;

-- Backfill what can be known rather than guessed: a conversation is owned by the
-- human whose run wrote into it. Everything else stays NULL (workspace-owned)
-- until a person is identified — a wrong owner is worse than none, because
-- Phase 2 turns owner into the only key to your own history.
UPDATE conversations c
   SET owner_user_id = r.user_id
  FROM (
      SELECT DISTINCT ON (conversation_id) conversation_id, user_id
        FROM agent_runs
       WHERE conversation_id IS NOT NULL AND user_id IS NOT NULL
       ORDER BY conversation_id, started_at ASC
  ) r
 WHERE c.id = r.conversation_id
   AND c.owner_user_id IS NULL;

COMMENT ON COLUMN conversations.visibility IS
    'private | shared | workspace. Default workspace until Phase 2 — see docs/MULTI_USER_PLAN.md';

-- Second pass: agent_runs.conversation_id is NULL on almost every historic row
-- (it was never passed to startRun), so the first UPDATE matched nothing. The
-- channel contact id is the link that does exist — a run and the conversation it
-- wrote into share it.
UPDATE conversations c
   SET owner_user_id = r.user_id
  FROM (
      SELECT DISTINCT ON (tenant_id, channel_contact_id) tenant_id, channel_contact_id, user_id
        FROM agent_runs
       WHERE user_id IS NOT NULL AND channel_contact_id IS NOT NULL
       ORDER BY tenant_id, channel_contact_id, started_at ASC
  ) r
 WHERE c.tenant_id = r.tenant_id
   AND c.channel_contact_id = r.channel_contact_id
   AND c.owner_user_id IS NULL;

-- Rows that remain unowned stay workspace-visible for good. Phase 2 must only
-- flip rows that HAVE an owner: a conversation with no owner turned private is
-- a conversation nobody can open, including the person who wrote it.
