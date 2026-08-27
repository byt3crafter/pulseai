-- Phase 5: memory belongs to the person, as it does in ChatGPT and Claude.
--
-- memory_entries was scoped by tenant and agent only, so anything an agent
-- learned from one person's conversation could surface in another person's
-- answer. In a one-person workspace that is a feature; on a team it is a leak,
-- and the kind nobody notices until an agent repeats something private back to
-- the wrong colleague.
--
-- NULL owner means workspace memory — written by a scheduled job or an API call
-- with no human asker, or predating this migration. Those stay readable by
-- everyone, deliberately: they were written under shared assumptions, and
-- assigning them to a person would be a guess that silently breaks recall for
-- everybody else.
--
-- See docs/MULTI_USER_PLAN.md.

ALTER TABLE memory_entries
    ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- Retrieval filters on (tenant, agent, owner) — this is the index that keeps
-- that cheap as memory grows.
CREATE INDEX IF NOT EXISTS idx_memory_entries_owner
    ON memory_entries (tenant_id, agent_id, owner_user_id);

COMMENT ON COLUMN memory_entries.owner_user_id IS
    'The person this memory is about/for. NULL = workspace memory (automation, or pre-dates per-user memory).';
