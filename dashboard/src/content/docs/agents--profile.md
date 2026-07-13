An agent's persona is not one field — it's a stack of plain-text files plus a handful of dashboard settings, assembled into a single system prompt on every message. This page traces exactly what each piece does and where it lands, straight from `workspace-service.ts` and `runtime.ts`.

## Where a persona actually lives

Every agent gets a workspace directory on disk: `{WORKSPACE_BASE_DIR}/{tenantId}/{agentId}/`. Inside it are up to eight markdown files:

| File | Purpose |
|---|---|
| `IDENTITY.md` | Name, "creature", vibe, emoji, avatar — who the agent is |
| `SOUL.md` | Personality and values — how the agent behaves |
| `MEMORY.md` | Curated long-term memory the agent writes about itself |
| `USER.md` | What the agent has learned about the human it's helping |
| `TOOLS.md` | Local notes on tool usage (SSH hosts, device nicknames, preferred voices — environment-specific cheat sheet) |
| `HEARTBEAT.md` | Tasks to check on a recurring heartbeat poll |
| `BOOTSTRAP.md` | First-run onboarding script, meant to be deleted once identity is set |
| `AGENTS.md` | The agent's own operating manual for its workspace |

An agent can edit these itself with the `workspace_update` tool if **Self-config** is enabled for that agent (`agentProfiles.selfConfigEnabled`) — the system prompt explicitly tells it so when the tool is present, because models otherwise assume they have no filesystem access and refuse.

> If no workspace exists yet (an older agent created before this system, or one that was never initialized), Pulse falls back to the legacy `agentProfiles.systemPrompt` database column. Writing to `SOUL.md` keeps that column in sync for backward compatibility.

## How the system prompt is assembled

`WorkspaceService.buildSystemPrompt()` (`pulse/src/agent/workspace/workspace-service.ts`) builds the prompt in this exact order, joined with `---` separators:

1. **`IDENTITY.md`** — injected first, as the authoritative source of the agent's name.
2. **An "IDENTITY OVERRIDE" block** — if a name was extracted from `IDENTITY.md` (regex match on `**Name**: <value>`, falling back to a `"You are <Name>"` pattern in `SOUL.md`), it's restated as a hard directive: *"Your name is X. Ignore any conflicting name references."* This exists because models otherwise drift back to a stale name from earlier in a long conversation.
3. **`SOUL.md`** — the personality file.
4. **A fixed "Response Guidelines" block** — hardcoded voice/formatting/autonomy rules (be genuinely helpful, format data as tables, don't over-introduce yourself, paginate automatically). This is not editable through any workspace file — it's baked into every agent.
5. **`AGENTS.md`** — the workspace operating manual.
6. **`BOOTSTRAP.md`** — only if it still exists; this is the "hello, world" onboarding script for a fresh agent.
7. **`MEMORY.md`** — wrapped in a "Persistent Memory" header. This is the curated file, not the vector/FTS memory store — see [Memory](/docs/agents--memory).
8. **`KNOWLEDGE_*.md` files** — any API reference templates attached to the agent (ERPNext, QuickBooks, Xero, Pastel, Python patterns, general REST).

Two more things get read separately and injected elsewhere in the prompt, not as part of this stack: `TOOLS.md` (tool usage guidance) and `USER.md` (user preferences).

> **Size limits are real and silent.** Each file is capped at 20KB; the whole assembled prompt (identity + soul + memory + agents + bootstrap + knowledge files combined) is capped at 150KB. Anything over the limit is truncated — kept as the first 70% + last 20% of the content, with a `[TRUNCATED]` marker in between. If an agent's `SOUL.md` or `MEMORY.md` grows large, older or middle content silently disappears from what the model sees.

## The Profile section

The **Profile** panel (General → Profile) is the dashboard-native part of identity — separate from the workspace files above:

| Field | Effect |
|---|---|
| Profile picture | PNG/JPEG/WEBP, up to 500KB (client-side compressed to fit). Shown in the dashboard and channel UIs; falls back to initials if unset. |
| Full name | `agentProfiles.name` |
| Role / title | `agentProfiles.title` — subtitle shown under the name |
| Thinking | Sets `agentProfiles.reasoningEffort` (`minimal`\|`low`\|`medium`\|`high`\|`xhigh`, or "Default" = unset). Only affects models that support a reasoning-effort parameter (e.g. Codex/GPT‑5.5) — on models that don't, it's silently ignored. |
| Progress updates | Sets `agentProfiles.progressVerbosity` (`progress` default, `verbose`, or `off`) — controls whether the agent shows a step-by-step trail while it works, adds its reasoning too, or stays silent until the final reply. |

## Model

A separate **Model** card sets `agentProfiles.modelId`. The dropdown only lists models from providers you've actually configured under **Settings → AI providers** — an agent can't be pointed at a provider with no key. Model lists are pulled live from each provider's `/models` endpoint where possible, so new releases show up without a dashboard update; it falls back to a static catalog if the live call fails.

## Revisions

Every write to a workspace file — whether from the dashboard editor or the agent's own `workspace_update` tool call — is recorded in `workspace_revisions` with an incrementing revision number and a change summary. The **Revisions** section lets you pick any of the eight workspace files and step back through its history, with a one-click restore that writes the old content back as a new revision (it doesn't rewrite history — restoring is itself a tracked change).

## Related

- [Memory](/docs/agents--memory) — the full picture of what an agent remembers, including `MEMORY.md` vs long-term vector/FTS memory.
- [Tools & Skills](/docs/agents--tools) — what `workspace_update` and other tools actually do.
