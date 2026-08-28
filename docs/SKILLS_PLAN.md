# Agent Skills for Pulse

**Status:** Phase 1 in progress. Decisions below are settled; phases are ordered
so each one ships on its own and is reversible.

## What this is

An **Agent Skill** is a folder containing `SKILL.md` — YAML frontmatter plus
markdown instructions that teach an agent *how to do a job*. It is the format
Anthropic's own skills use, and the format every one of the eight upstream
collections is written in (`anthropics/knowledge-work-plugins` ~108 entries,
`alirezarezvani/claude-skills` ~200, `anthropics/claude-for-legal` ~28,
`anthropics/financial-services` ~22, and others).

**A skill is instructions, not code.** It cannot execute anything. It tells the
agent how to use tools the agent *already has*. That distinction is the security
model — see "A skill can never grant a tool" below.

## The naming landmine, up front

Pulse already has a table called `tenant_skills`. **It is not this.** It is a
per-tenant on/off gate keyed by built-in *tool name* (`email_send`, `note_save`)
— what the dashboard calls the toolset. Nothing in it parses `SKILL.md`.

The new tables are therefore named `skill_packs` / `skill_definitions` /
`tenant_skill_grants` / `agent_skill_assignments`, and never just `skills`.
Phase 5 renames `tenant_skills` → `tenant_tools`, which is what it has always
meant; doing that first would be a large blast radius for no user-visible gain.

## The number that decided the architecture

Measured against the 52 skills vendored in `openclaw_ref/skills`:

| What we put in the prompt | Size |
|---|---|
| `name` + `description` only | 6,732 bytes ≈ **1,683 tokens** |
| Full `SKILL.md` bodies | 209,318 bytes ≈ **52,329 tokens** |

**31×.** At the ~100 skills a workspace would actually assign, that is roughly
3k tokens versus 100k *per request*. Loading bodies eagerly would cost more per
message than the entire conversation.

So: **progressive disclosure is mandatory.** The prompt carries a catalogue of
one line per skill. The agent calls `skill_read` to pull a body only when it has
decided a skill applies. This is the same lesson as the cron work, where an LLM
was used as a sensor and burned 49,431 input tokens to produce 15.

## Decisions

**Storage is the database, not the filesystem.** OpenClaw loads skills from
`~/.openclaw/skills` and `<workspace>/skills`, which suits one machine and one
user. Pulse is multi-tenant and containerised: agents have no durable per-agent
filesystem, and a container replacement would wipe anything written there. Rows
survive deploys and are tenant-scoped by the same rules as everything else.

**Gating mirrors the tool-policy chain**, because a second mental model for
"who can use what" is how a permission gets granted by accident:

```
admin approves a PACK  →  tenant grants a SKILL  →  agent is ASSIGNED it
   skill_packs             tenant_skill_grants       agent_skill_assignments
```

Everything is off by default at every level. An agent with no assignments gets
no catalogue and no `skill_read` tool — identical to today's behaviour.

**A skill can never grant a tool.** The catalogue is built from skills the agent
was assigned; the *tools* the agent may call come from the existing registry and
are unchanged by any skill. A skill that says "use the `exec` tool" on an agent
without `exec` simply fails. Without this rule an imported markdown file would
be a privilege-escalation path, which is precisely the risk of importing
instructions from a public repo.

**Packs are content-hashed and re-approved on change**, exactly like plugin
manifests. Skills are third-party text aimed at an LLM that holds tools — that
is prompt injection by construction. Pinning the hash means an upstream edit
cannot silently change what a customer's agent was told to do. (See
[[plugin-reapproval-gotcha]]: changing a manifest hash deactivates the pack, and
that is the intended, safe direction.)

**Import is config-driven.** An admin supplies a git URL; the gateway fetches
through the existing SSRF guard (`utils/ssrf.ts`), parses every `SKILL.md`, and
stores name, description, body and checksum. No repo is hardcoded — per
CLAUDE.md, a new source must have a dashboard path or it is not done.

## Phases

**Phase 1 — parse and store.** `skill_packs` + `skill_definitions`, a
frontmatter parser with tests, and an importer that reads a git repo or an
uploaded archive. No runtime change; nothing reaches an agent yet.

**Phase 2 — grant and assign.** `tenant_skill_grants` +
`agent_skill_assignments`, admin approval UI, tenant library page, and a Skills
tab on the agent editor. Still no runtime change.

**Phase 3 — the runtime.** Catalogue injection at the standing-orders point in
`runtime.ts` (3.887), plus the `skill_read` tool. This is the phase that changes
agent behaviour, and it ships last on purpose.

**Phase 4 — authoring.** Create and edit skills in the dashboard, so a customer
can write "how we quote a roofing job" without touching a repo. This is the one
that matters commercially: the upstream packs are generic, and the valuable
skills are the customer's own.

**Phase 5 — rename** `tenant_skills` → `tenant_tools`, removing the landmine.

## Risks

| Risk | Consequence | Mitigation |
|---|---|---|
| Prompt injection via imported skill | An agent follows hostile instructions | Admin approval per pack, content hash, re-approval on change |
| Catalogue bloat | Every request pays for skills nobody uses | Per-agent assignment; catalogue is names + descriptions only |
| Skill assumes tools the agent lacks | Confident-sounding failure | Requirements parsed from frontmatter and shown at assignment time |
| Confusion with `tenant_skills` | Wrong table wired up | Distinct names now, rename in Phase 5 |
| Upstream packs are macOS-only | Imported junk (`apple-notes`, `things-mac`) | Requirements recorded; unusable skills flagged, not hidden |
