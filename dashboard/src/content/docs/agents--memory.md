"Memory" covers three different things in Pulse that happen to share a name. They behave differently, so it's worth knowing which one you're looking at.

## The three layers

| Layer | What it is | How far back it reaches |
|---|---|---|
| Conversation history | The raw back-and-forth of the current chat | The last 20 messages. Older turns simply drop off — they aren't summarized, they're gone from what the agent sees. |
| Memory note | A short, curated note the agent keeps about itself, editable on the agent's Memory tab | Whatever fits in the note — see the size limits in [Profile, Soul & Identity](/dashboard/docs/agents/profile). |
| Long-term memory | Individually stored facts, preferences, and decisions, retrieved by relevance | Not time-limited — pulled back in whenever something in it looks relevant to the current message, regardless of when it was saved. |

Conversation history and the Memory note are simple: one is a fixed window, the other is a note you or the agent edits directly. The rest of this page is about long-term memory, which has more moving parts.

## How long-term memory works

An agent saves a long-term memory either by deciding to on its own, or automatically through Auto-Memory (below). Each entry has:

- The fact, preference, or decision itself
- A category: fact, preference, decision, task, relationship, or general
- An importance score, which affects how likely it is to surface later
- A meaning-based fingerprint, if one could be generated (see the next section)

Before every reply, Pulse automatically checks long-term memory for anything relevant to the current message and quietly includes up to five matches in what the agent sees — you don't have to ask the agent to "remember" for this to kick in. Older memories are weighted down over time, and near-duplicate matches are trimmed so you don't get five versions of the same fact.

## Meaning-based search needs an embedding key

Recall works two ways: matching by meaning, so a paraphrased question can still find a related memory, and matching by keyword. Meaning-based matching only works once an embedding provider key is connected for your workspace, under **Settings → Memory**. Without one, long-term memory still works — it just matches on the words you actually typed rather than the idea behind them.

## Auto-Memory

Beyond an agent explicitly saving something, Pulse can pull memories out of every conversation automatically. After a reply, it looks at what was just said and saves a few new memories on its own, skipping anything that looks like a duplicate of what's already stored. It's on by default, and it sits out heartbeat runs and silent replies. Turn it off, or change how many it saves per turn, under **Settings → Memory**.

## Viewing and managing memories

Each agent has its own Memory page showing totals (facts, preferences, decisions) and a table of everything stored — content, category, importance, how often it's been used, when it was created — with delete on each row and a bulk delete by category. If nothing's been stored yet, the page says so plainly.

> Built-in memory tools are provisioned for your workspace like any other built-in tool — there's no self-serve toggle for them specifically. If an agent can't store or search memories at all, ask your Pulse administrator. This doesn't affect Auto-Memory, which captures memories in the background regardless.

## Related

- [Profile, Soul & Identity](/dashboard/docs/agents/profile) — the Memory note and the rest of an agent's editable notes.
- [Tools & Skills](/dashboard/docs/agents/tools) — built-in tool availability in general.
