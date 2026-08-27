# Multi-user workspaces: ownership, visibility and agent identity

**Status:** Phases 0–5 shipped (v0.20.28 → v0.20.33). Notes below record what was
actually built, including where it differs from the plan.
**Written:** 2026-08-27

---

## 1. Where we actually are

Every user-facing table is scoped by `tenantId` and nothing else. Verified
against `pulse/src/storage/schema.ts`:

```
contacts · notes · todos · expenses · documents · bookmarks
conversations · agent_profiles · tasks · credentials · memory_entries
        → tenant-wide, no user column anywhere
```

In plain terms: **in the `runstate` workspace, Thierry can read every chat Dovik
has had, every note, every to-do and every expense.** Not a bug — the data model
has no way to express "mine".

Two consequences are worse than the visibility itself:

- **`memory_entries` is tenant-scoped.** Anything an agent remembers from one
  person's conversation can surface in another person's answer.
- **`resolveEmailConfig(tenantId, agentProfileId)`** resolves agent-level then
  tenant-level config. There is no user in that signature, so when a second
  person asks an agent to "check my email", it opens the *workspace's* mailbox.
  That is a correctness bug, not a preference.

### What we already have to build on

| Piece | Where | Use |
|---|---|---|
| Plane + granular roles | `dashboard/src/utils/permissions.ts` — `Plane`, `AccessRole` (`owner`/`member`/`viewer`), `hasPermission()` | authorisation verbs |
| A membership precedent | `channel_members` — `userId` + `role` + `access` (`talk`/`observe`) | shape to copy for sharing |
| Run→human attribution | `agent_runs.user_id` | partial ownership backfill |
| Per-user chat routing | `chat-bus` is already user-scoped | proof the runtime can carry a user |

---

## 2. The finding that decides the timing

```
messages          3071
agent_runs        1006   (12 carry a user_id)
conversations       23
contacts             7
notes / todos / documents / bookmarks   0
```

**The data is effectively empty.** Twenty-three conversations. Seven contacts.
Zero notes.

This is the cheapest this change will ever be. The same migration against a year
of a real customer's data is a different project with a different risk profile —
backfilling ownership for thousands of rows nobody can attribute, and a flip that
hides people's own history if the backfill is wrong.

Doing it before Metcheck puts a team on this is worth more than any feature we
could ship in the same time.

---

## 3. The design

### 3.1 Not "everyone sees their own"

A blanket rule is wrong in both directions. What a thing *is* decides its default:

| Entity | Default | Why |
|---|---|---|
| Chats, notes, to-dos, bookmarks | **private** | A conversation with an agent is like your own ChatGPT history. Nobody expects a colleague to read it. |
| Contacts | **workspace** | A shared address book *is* the value. Per-person contacts is a worse Outlook. |
| Documents, expenses | **workspace, owned** | The company must see them; they still need an owner for "my expenses" and audit. |
| Agents | **workspace** | Infrastructure. Expensive to configure, meant to be used by the team. |
| Credentials, servers, plugins | **workspace, admin-gated** | Already correct today. |

### 3.2 Three levels, not two

```
private  →  shared with specific people  →  workspace
```

Two levels forces all-or-nothing and people over-share to get work done. This is
the Notion/Figma/Slack model: private pages → teamspaces → workspace; drafts →
project files; DMs → private channels → public channels.

### 3.3 Ownership is separate from visibility

Every row gets an owner **even when it is workspace-visible**. Ownership answers
"whose expense is this", "who do I ask about this document", and "what happens
when this person leaves" — which visibility alone cannot.

Google Drive's "My Drive by default" is the cautionary tale: files owned by
individuals become inaccessible when the person leaves. So: **owner is a person,
but the workspace retains rights over workspace-visible rows.** Deleting a user
must never delete workspace data.

### 3.4 Shape

Two columns on each entity, plus one shared table:

```sql
owner_user_id  uuid REFERENCES users(id) ON DELETE SET NULL   -- NULL = workspace-owned/legacy
visibility     varchar(16) NOT NULL DEFAULT 'workspace'       -- private | shared | workspace

CREATE TABLE resource_shares (               -- mirrors channel_members
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  resource_type  varchar(32) NOT NULL,       -- 'conversation' | 'note' | ...
  resource_id    uuid NOT NULL,
  user_id        uuid NOT NULL,
  access         varchar(16) NOT NULL DEFAULT 'read',   -- read | write
  UNIQUE (resource_type, resource_id, user_id)
);
```

`ON DELETE SET NULL` on the owner is deliberate: removing a person converts their
workspace-visible rows to workspace-owned rather than destroying them.

### 3.5 One choke point

The single biggest risk is re-implementing the visibility rule in twenty query
sites and getting one wrong — that is how leaks happen, and a leak here is a
customer's private conversation.

So: **one helper, used everywhere**, and a test that fails when a query for a
scoped entity does not go through it.

```ts
// dashboard/src/utils/visibility.ts
visibleTo(userId, accessRole, entity) → SQL predicate
canRead / canWrite / canShare(userId, row)
```

---

## 4. The steps

Each phase is independently shippable, independently reversible, and leaves the
product working. Nothing user-visible changes until Phase 3.

### Phase 0 — Record ownership (invisible)

- Migration: add `owner_user_id` + `visibility` to `conversations`, `notes`,
  `todos`, `bookmarks`, `contacts`, `documents`, `expenses`. Default
  `visibility='workspace'`, owner NULL.
- Backfill: `conversations.owner_user_id` from `agent_runs.user_id` where the run
  points at the conversation; the rest by hand — there are 23.
- Write the owner on every new row from the session user.
- **Nothing changes for anyone.** Everything is still workspace-visible.
- Exit check: every row created after deploy has an owner.

### Phase 1 — Enforcement layer (still permissive)

- Build `visibility.ts` with the helper and predicates.
- Route every read for those entities through it — while the default is
  `workspace`, the predicate is a no-op, so behaviour is unchanged.
- Add the guard test: a scoped entity queried without the helper fails CI.
- Exit check: suite green, no behaviour change observable.

### Phase 2 — Flip defaults, one entity at a time

Order chosen so the least damaging goes first:

1. `bookmarks` → private (0 rows, zero risk — proves the path)
2. `notes`, `todos` → private (0 rows)
3. `conversations` → private (23 rows, owners backfilled in Phase 0)
4. `contacts`, `documents`, `expenses` → stay workspace, keep owner

Each is one migration changing a default plus a smoke test. Reversible by
flipping the default back.

- **Gate:** do not start until Phase 0's backfill is verified. A conversation
  with no owner that flips to private becomes invisible to everybody.

### Phase 3 — Sharing (first visible change) — SHIPPED v0.20.33

- `resource_shares` table (migration 0046), mirroring `channel_members` — the
  sharing shape this codebase already uses.
- `visibleTo()` resolves `shared` through an `EXISTS` on that table. EXISTS
  rather than a join: a join multiplies rows when something is shared with
  several people, and the caller silently gets duplicates in a list it thought
  was distinct.
- **Omitting the resource type narrows what you see rather than widening it.**
  Every call site passes one, but the failure when someone forgets must be
  "I cannot see a chat shared with me", never "I can see everyone's".
- One `share-actions.ts` for every shareable type, not one per feature. Sharing
  is the operation whose bug hands one person's private work to a colleague, and
  five copies of an owner check means five chances to get it subtly wrong.
- One `ShareDialog` for the same reason: if the chat sheet said "anyone in the
  workspace" and the notes sheet said "public", people would eventually click
  the wrong one.
- Visibility and the share rows are kept consistent in both directions — sharing
  flips `private` → `shared` (a share row against a still-private row is
  invisible to the person it was shared with), and removing the last share puts
  it back to `private` (a row left `shared` with nobody on it reads as "still
  shared" in every badge).
- UI: share control on History and Notes rows you own; a "shared by" label on
  rows you received.
- **Not built:** per-share `write` access is stored but nothing grants it yet —
  every share is read today. Left deliberately: write-sharing needs an answer for
  what happens when two people edit the same note, and that is a bigger question
  than sharing.

### Phase 4 — Email identity (the correctness fix) — SHIPPED v0.20.31

Two layers, decided:

1. **Each agent has its own mailbox.** That is the agent's identity — Natalie
   writes from Natalie's address. This already exists (`agentProfiles.emailConfig`).
2. **Any user can add their own mailbox**, so an agent can read and write mail
   *on that person's behalf*. New.

Which one is used depends on whose behalf the agent is acting:

| Situation | Mailbox |
|---|---|
| Agent acting as itself (scheduled job, its own follow-up) | the agent's |
| Agent doing something *for* a person who has connected mail | that person's |
| Agent doing something for a person who has **not** connected mail | the agent's, and it says so |

- `InboundMessage` already carries `actorUserId`. Thread it into
  `resolveEmailConfig(tenantId, agentProfileId, actorUserId)`.
- New `user_email_accounts` table: per-user IMAP/SMTP, encrypted with the same
  AES-256-GCM path as every other credential.
- **It must never fall back silently.** Sending from the wrong account is worse
  than not sending: if a person asked and has no mailbox connected, the agent
  says which address it is about to use.

### Phase 5 — Memory, per user — SHIPPED v0.20.32

Decided: **memory belongs to the person, the way it does in ChatGPT and Claude.**
Simpler than the split I first proposed, and it matches what people already
expect from an assistant — what it remembers about you is yours.

- `memory_entries` gains `owner_user_id`.
- Writes record the asking user; retrieval filters to that user.
- Entries written by a scheduled job or an API call (no human asker) stay
  workspace-owned — an automation's memory is the workspace's, not a person's.
- Backfill: existing entries → workspace-owned. They were written under shared
  assumptions, and assigning them to a person would be a guess that silently
  breaks recall for everyone else.

---

## 5. Risks, and what each one costs

| Risk | Consequence | Mitigation |
|---|---|---|
| A query misses the helper | One person reads another's chat | Choke-point helper + CI guard (Phase 1, before any flip) |
| Backfill wrong, then flip | People lose their own history | Phase 0 verified before Phase 2; 23 rows to check by hand |
| Owner deleted with user | Workspace data disappears | `ON DELETE SET NULL`, never CASCADE |
| Over-privacy | Team cannot find shared work | Contacts/documents/agents stay workspace; sharing ships in Phase 3, not later |
| Agent uses wrong mailbox | Mail sent from the wrong account | Phase 4 fails loudly instead of falling back silently |

---

## 6. What this is not

- Not a permissions rewrite. `permissions.ts` keeps doing verbs
  (`can this role delete an agent`); this adds *scope* (`which rows can this
  person see`). They are different questions and should stay separate.
- Not per-user billing or quotas.
- Not cross-tenant sharing.

---

## 7. Recommendation

Do Phases 0 and 1 now, while there are 23 conversations and no notes. They are
invisible to users, fully reversible, and they are the part that becomes
genuinely expensive once a customer team has been using this for months.

Phase 4 is the one with a live bug behind it, so it should not wait long after.
