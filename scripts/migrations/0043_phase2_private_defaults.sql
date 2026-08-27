-- Multi-user Phase 2: the personal things become private.
--
-- Two separate acts, and the distinction is the whole safety of this migration:
--
--   1. the column DEFAULT changes, so everything created from now on is private
--   2. EXISTING rows flip only where they have an owner
--
-- A row with no owner that turns private is a row nobody can open — including
-- whoever wrote it. Phase 0 could only attribute 7 of 23 conversations, so the
-- other 16 must stay workspace-visible for good. That is a deliberate outcome,
-- not an oversight: better a handful of old threads remain shared than any
-- person loses their own history.
--
-- Entities that stay workspace: contacts, documents, expenses. A shared address
-- book is the value of an address book, and the company must see its documents
-- and spend. They keep their owner column for "mine" filters and for audit.
--
-- Reversible: set the default back to 'workspace' and run the inverse UPDATE.
-- See docs/MULTI_USER_PLAN.md.

-- Step 1 — bookmarks (0 rows: proves the path costs nothing)
ALTER TABLE bookmarks ALTER COLUMN visibility SET DEFAULT 'private';
UPDATE bookmarks SET visibility = 'private' WHERE owner_user_id IS NOT NULL;

-- Step 2 — notes and to-dos (0 rows)
ALTER TABLE notes ALTER COLUMN visibility SET DEFAULT 'private';
UPDATE notes SET visibility = 'private' WHERE owner_user_id IS NOT NULL;

ALTER TABLE todos ALTER COLUMN visibility SET DEFAULT 'private';
UPDATE todos SET visibility = 'private' WHERE owner_user_id IS NOT NULL;

-- Step 3 — conversations (23 rows, 7 attributable)
ALTER TABLE conversations ALTER COLUMN visibility SET DEFAULT 'private';
UPDATE conversations SET visibility = 'private' WHERE owner_user_id IS NOT NULL;

-- Nothing here touches contacts, documents or expenses. They stay workspace.
