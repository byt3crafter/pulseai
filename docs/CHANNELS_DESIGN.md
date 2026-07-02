# Channels & Org Model — Design Doc

Status: **APPROVED — building Phase 1** · Owner: platform · Supersedes the 1-human⟷1-agent DM model

## 0. Locked decisions

- **Company = the deployment.** One client per Pulse instance (data sovereignty). The
  **tenant IS the company** — no separate company node. `tenants.name` = company name.
- **Fixed hierarchy: Company → Department → Group.** Under the tenant we have
  **departments**, and optionally **groups/topics** under a department. Modeled as one
  `channels` table with `kind ∈ {department, group}` and `parentId` (a group's parent is
  its department). Depts can be single or multiple.
- **Soul on the agent, never on the channel.** Channels carry name + description only.
- **Reply:** lead answers + routes by default; @mention addresses a specific agent.
- **Per-user access inside a group** (see §4): a human is either `talk` or `observe`
  (read-only "just look, no talk"), and can be assigned only specific agents.

---

## 1. Goal

Turn Pulse from **one human ⟷ one agent (private DM)** into a **company org chart made
of AI**: departments that contain ranked agents (employees up to a manager) plus
human members. A human talks to a department; the **manager/lead agent** answers and
**routes** the work to the right agent — inside the department or across to another
department.

This is Slack/Discord-for-agents, but the "members" are a mix of **humans and multiple
AI agents**, organized like a company.

---

## 2. Vocabulary (locked with the user)

| Term | Meaning |
|------|---------|
| **Channel** (a.k.a. group / topic / department) | Org container. **Name + description only.** No soul, no persona, no prompt. |
| **Soul** | Persona / systemPrompt / background / workspace / model. **Lives on the agent, never on the channel.** |
| **Lead (management) agent** | The agent that answers a human by default and **routes** work. One per channel (can be a rank, not just a flag). |
| **Member (employee) agent** | Does the work the lead routes to it. Responds directly only when @mentioned. |
| **Level / rank** | A department has levels: normal employee → management. The lead is the top level. |
| **Human member** | A user in the channel. A channel is single-human or multi-human. |
| **Operator** | A human who configures a channel (adds/removes members + agents, sets the lead). |
| **Subagent** | A short-lived agent an agent spawns for a job. **Already exists** (`delegate_to_agent`). |

---

## 3. What already exists (reused, not rebuilt)

- **Agents are rich identities** — `agentProfiles` already carry `systemPrompt`,
  `modelId`, `workspacePath`, `toolPolicy`, `delegationConfig`. The "soul per agent" is done.
- **Delegation / subagents** — `delegate_to_agent` tool + `agent-delegation.ts` +
  `agent-registry.ts`. Agents can already hand jobs to other agents. This is the
  substrate for "manager routes to employee" and "agent spawns subagent."
- **Conversations + messages** — a thread per `channelContactId`, resolving **one**
  agent via routing rules. This is the piece we extend.

**The gap:** no channel layer, no multi-agent-in-one-thread, no lead/route behavior,
no ranks.

---

## 4. Data model (new)

### `channels`  (a department, or a group/topic under a department)
```
id            uuid pk
tenantId      uuid → tenants                             -- = the company
kind          varchar  'department' | 'group'            -- fixed Company→Dept→Group
parentId      uuid → channels (nullable)                 -- a group's parent = its department
name          varchar
description    text
mode          varchar  'single_human' | 'multi_human'   default 'single_human'
leadAgentId   uuid → agent_profiles (nullable)          -- the manager that answers+routes
settings      jsonb  default {}                          -- future knobs
status        varchar  default 'active'
createdAt / updatedAt
unique(tenantId, parentId, name)
-- constraint: kind='department' ⇒ parentId null; kind='group' ⇒ parentId is a department
```

### `channel_agents`  (which agents are in a department, and their rank)
```
id             uuid pk
channelId      uuid → channels
agentProfileId uuid → agent_profiles
role           varchar  'lead' | 'member'   default 'member'
level          integer  default 0            -- seniority; higher = more senior
respondsWhen   varchar  'mentioned'          -- members respond only when @mentioned;
                                             -- lead also answers unaddressed messages
createdAt
unique(channelId, agentProfileId)
```

### `channel_members`  (humans in a channel + their access)
```
id         uuid pk
channelId  uuid → channels
userId     uuid → users
role       varchar  'operator' | 'member'   default 'member'
access     varchar  'talk' | 'observe'      default 'talk'   -- observe = read-only, "just look no talk"
createdAt
unique(channelId, userId)
```

### `channel_member_agents`  (which agents a specific human may talk to in a channel)
```
id             uuid pk
channelId      uuid → channels
userId         uuid → users
agentProfileId uuid → agent_profiles
createdAt
unique(channelId, userId, agentProfileId)
-- if a user has NO rows here, they may talk to all channel agents (default);
-- if they have rows, they are restricted to just those agents ("own agent assigned").
```

### `messages` — additive columns (backward compatible)
```
channelId    uuid → channels (nullable)   -- null = legacy DM/conversation, still works
senderType   varchar  'human' | 'agent'   -- who spoke in a shared thread
senderUserId  uuid (nullable)              -- which human
senderAgentId uuid (nullable)              -- which agent
mentions     jsonb  default []             -- agent ids @mentioned in this message
```

> **Backward compatibility:** existing DMs keep working (`channelId` null, single-agent
> path unchanged). Channels are a parallel, opt-in path. No destructive migration.

---

## 5. Reply & routing model (the core behavior)

When a **human** posts in a channel:

1. **Parse @mentions** in the text.
2. **If one or more agents are @mentioned** → each addressed agent runs and replies
   directly. (This is how you talk to a specific employee, or talk to another dept's agent.)
3. **If nothing is addressed** → the channel's **lead agent** runs. Its job (via an
   augmented system prompt + tools) is to either **answer directly** or **route**:
   - delegate to a **member agent** in the same channel (`delegate_to_agent`, exists), or
   - hand off to **another channel/department** (new `route_to_channel` tool — later phase).
4. **Agents can @mention each other** → triggers that agent to join. Guarded by a
   **hop budget** (e.g. max 3 agent→agent hops per human message) to prevent loops.
5. **Agents spawn subagents** for background jobs (existing delegation, unchanged).

Everyone in the channel **sees the whole thread** (humans + agents). Unaddressed
messages are still **context** every agent "hears," even if only the lead answers.

### Lead-agent prompt augmentation
At runtime, when the lead runs, we inject: *"You are the lead of the **{channel.name}**
department. Your team: {member agents — name + description + level}. Other departments
you can route to: {sibling/child channels}. Answer if it's yours; otherwise delegate to
the right teammate or route to the right department."*

---

## 6. Hierarchy / levels ("account can have multiple levels") — **flagged complex**

Two independent axes, both optional and **deferred to a later phase**:

- **Nested departments** — `channels.parentId` lets Accounting contain sub-teams
  (Payables, Receivables). Routing can go down into a child channel.
- **Agent ranks** — `channel_agents.level` orders agents within a department
  (junior → senior → management). The lead is the top rank. A mid-level agent could
  itself delegate downward.

**Risk:** deep hierarchies + cross-department routing + agent-to-agent mentions can
create loops, ambiguous ownership, and runaway cost. Mitigations: hop budget, a single
lead per channel, explicit `route_to_channel` (no implicit cross-dept chatter), and a
per-message agent-run cap. **We build flat channels first; add nesting only once flat
works.**

---

## 7. Surfaces to change

- **DB / schema** — new tables + message columns, in **both** `pulse/` and `dashboard/`
  schema copies + a migration.
- **Runtime** (`agent/runtime.ts` + a new resolver) — channel-aware path: mention
  parsing, "who runs" resolution, lead prompt augmentation, hop budget. The single-agent
  DM path stays for legacy.
- **App API** (`gateway/routes/app-api.ts`) — channel list, channel history, post to
  channel (with mentions).
- **Dashboard** — a "Departments" (channels) admin UI: create/edit, add human members,
  add agents + set rank + set lead.
- **Desktop app** — Slack-style channel sidebar, multi-party thread bubbles (show
  sender name/avatar), @mention autocomplete.

---

## 8. Phased plan

| Phase | Scope | Ships |
|-------|-------|-------|
| **1** ✅ | Schema + migration + dashboard "Departments" CRUD (create channel, add humans, add agents, set lead + rank). **No behavior change.** | You can model the org. |
| **2** ✅ | Runtime channel path: **flat** channel, lead-answers-default + @mention direct + delegate to members. App API endpoints. | A department actually works: talk → lead answers/routes. |
| **3** ✅ | Desktop UI: channel sidebar, agent-labeled bubbles, @mention, read-only bar. | Humans use it in the app. |
| **4** | Cross-department routing (`route_to_channel`) + multi-human presence + operator controls + hop budget/cost cap. | Departments hand off to each other; team rooms. |
| **5** | Nested departments + agent ranks (hierarchy). **The complex bit, last.** | Full org chart. |

> **Shipped:** Phases 1–3 on `main` (v0.10.23 line), migration `0012` applied to staging.
> **Next-up refinement:** wire a channel's member agents into the lead's delegatable set
> so "route to the proper agent" is automatic (today the lead delegates only per its own
> `delegationConfig`). Then Phase 4.

Each phase is independently shippable and backward compatible.

---

## 9. Open questions for the user

1. **Multi-human channels** — do humans in a room see *each other's* messages to the
   agents, or is it more like a shared inbox? (Affects presence UI.)
2. **Cross-department routing** — should the lead route silently, or tell the human
   "handing this to Sales"? (I'd recommend visible handoffs.)
3. **One lead per channel** to start — OK? (Multiple co-leads = more loop risk.)
4. **Cost guardrails** — a per-message cap on total agent runs (e.g. 5) — acceptable default?

---

## 10. Recommendation

Approve Phases **1–3** as the first milestone (model the org + make one department work
end-to-end in the desktop app). Defer cross-dept routing and hierarchy (Phases 4–5)
until the flat model proves out. This keeps the complex parts last and every step shippable.
