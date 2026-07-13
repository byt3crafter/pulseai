Departments let you model your company the way it actually works: a workspace (the company) split into departments, each with its own team of agents and people, instead of one human talking to one agent in a private DM. Configure the org chart at **Agents → Departments**.

## The model

**Company → Department → Group.** Your workspace *is* the company — there's no separate "company" object to create. Under it you create **departments** (e.g. Sales, Support), and optionally **groups/topics** nested one level under a department (e.g. an "EU Team" group under Sales).

A department or group is called a **channel** internally, and it carries **only a name and a description** — nothing else. There is deliberately no persona, prompt, or "soul" on a channel:

> The identity — system prompt, model, workspace, tools — lives entirely on the **agent** (`agentProfiles`), never on the channel. A channel is just an org container; the agents assigned to it bring their own personality.

Each department/group has:

- **Agents**, each with a **role** (`lead` or `member`) and a numeric **level** (seniority — informational today, see Roadmap below).
- **People**, each with **access**: `talk` (can post) or `observe` (read-only — sees the thread but can't post).
- **Mode**: `single_human` or `multi_human`, set when you create it.
- Optionally, **per-person agent restrictions** — by default a person can talk to every agent in the channel; assign specific agents to a person to restrict them to just those.

## How a message gets answered

When a human posts in a department or group, `resolveResponder` decides who replies:

1. **@mention wins.** If the message @mentions one or more of the channel's agents by name, the mentioned agent answers directly — this is how you address a specific "employee" instead of the department's default responder.
2. **Otherwise, the lead answers.** The channel's designated lead agent (or, if none is marked, the first `role: lead` agent) picks up unaddressed messages and decides whether to answer itself or delegate to a teammate agent in the same channel.
3. Access is enforced first — a person only reaches an agent they're allowed to `talk` to; `observe` access never resolves to a responder at all.

This pre-resolved responder **bypasses your tenant's normal [message routing](/docs/routing) rules entirely** — routing rules are for legacy single-agent conversations, not channel threads. See `runtime.ts`'s `inbound.channelId` check if you're tracing this in code.

## What's shipped vs. what isn't

Phases 1–3 are live: the schema, this Departments admin UI, the runtime path above (lead-answers-by-default, @mention, delegate to a teammate), and the desktop client's channel sidebar with multi-party thread bubbles.

**Not shipped yet** — don't expect these:

- **Cross-department routing.** A lead cannot hand a conversation off to a *different* department yet (a `route_to_channel` tool is planned but not built). Today a lead can only delegate within its own channel.
- **A hop budget / per-message cost cap.** Nothing currently limits how many agent-to-agent hops a single message can trigger — this matters once cross-department routing and agent-to-agent @mentions ship, to prevent runaway loops.
- **Nested departments beyond one level, and agent ranks that actually change behavior.** `level` is stored and shown in the UI but doesn't yet drive who can delegate to whom.
- **Multi-human presence details** — whether people in a multi-human room see each other's messages to agents is settled behaviorally (everyone sees the whole thread), but there's no dedicated presence UI.

None of this is silently broken — it's simply not built. The flat, single-department model above is fully functional; the org-chart depth (nested departments, ranks, cross-department handoffs) is intentionally deferred so the simpler model could ship and prove out first.

## Legacy DMs still work

Nothing here changes a private 1:1 conversation with an agent (a `channelId`-less conversation) — that path is untouched and still goes through normal [message routing](/docs/routing).
