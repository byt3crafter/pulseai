Departments let you model your company the way it actually works: a workspace split into departments, each with its own team of agents and people, instead of one person talking to one agent in a private message. Set up your org chart at **Agents → Departments**.

## The model

**Company → Department → Group.** Your workspace *is* the company — there's no separate company setup step. Under it you create **departments** (e.g. Sales, Support), and optionally **groups** nested one level under a department (e.g. an "EU Team" group under Sales).

A department or group carries only a name and a description — nothing else. There's deliberately no personality or instructions attached to it directly: that lives entirely on each **agent**. A department is an org container; the agents assigned to it bring their own personality and skills.

Each department or group has:

- **Agents**, each with a role — **Lead** (answers and routes by default) or member.
- **People**, each with access set to either **Can talk** (can post) or **Read-only** (sees the thread but can't post).
- A mode chosen when you create it — **Single person** or **Multiple people**.
- Optionally, **per-person agent assignment** — by default a person can talk to every agent in the department; assign specific agents to a person to limit them to just those.

## How a message gets answered

When someone posts in a department or group:

1. **An @mention wins.** If the message @mentions one of the department's agents by name, that agent answers directly — this is how you address a specific agent instead of the department's default responder.
2. **Otherwise, the lead answers.** The department's lead agent picks up unaddressed messages and decides whether to answer itself or hand it to another agent within the same department.
3. **Access is enforced first.** A person only reaches an agent they're allowed to talk to; someone set to read-only never gets a response at all.

This overrides your workspace's normal [message routing](/dashboard/docs/routing) rules — routing rules are for private conversations outside a department, not department threads.

## What's available today

The flat, single-department model described above is fully working: departments and groups, a lead agent that answers and routes, @mentions, talk-vs-read-only access, and per-person agent assignment.

> **Not available yet:** a department's lead cannot currently hand a conversation off to a *different* department — it can only route within its own department or group. Nested departments beyond one level of groups, and agent seniority that actually changes who can delegate to whom, are also not available yet. If your workflow depends on either of these, talk to your Pulse administrator about your options in the meantime.

## Private conversations still work as before

Nothing here changes a private one-to-one conversation with an agent outside of a department — that keeps working exactly as it did, through normal [message routing](/dashboard/docs/routing).
