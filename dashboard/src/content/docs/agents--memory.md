"Memory" in Pulse is really three separate systems that happen to share a name. This page is honest about which is which, because they behave very differently.

## The three layers

| Layer | What it is | Where it lives | How far back it reaches |
|---|---|---|---|
| Conversation history | The raw back-and-forth of the current thread | `messages` table | Last **20 messages**, hard-capped (`runtime.ts` sliding window) — older turns simply drop off, they are not summarized |
| `MEMORY.md` | A curated file the agent writes about itself | Agent's workspace directory | Whatever fits — injected into every system prompt, subject to the same 20KB-per-file / 150KB-total budget covered in [Profile, Soul & Identity](/docs/agents--profile) |
| Long-term memory | Discrete, searchable memory entries with categories and importance scores | `memory_entries` table (Postgres + pgvector) | Retrieved by relevance, not recency — pulled back into context only when it scores as relevant to the current message |

Conversation history and `MEMORY.md` are simple: the first is a fixed-size window, the second is a file the agent (or you, via the dashboard) edits directly. The rest of this page is about the third layer, which is the one with real nuance.

## Long-term memory: how it's stored and retrieved

An agent stores a long-term memory either by calling the `memory_store` tool itself, or automatically via Auto-Memory (below). Each entry gets:

- `content` — the fact/preference/decision text
- `category` — `fact`, `preference`, `decision`, `task`, `relationship`, or `general`
- `importance` — 0.0–1.0, defaults to 0.5
- an embedding vector, if one could be generated (see next section)

Retrieval (`memoryService.search()`) is a **hybrid vector + full-text search**, weighted 70% vector similarity / 30% Postgres `ts_rank`, then re-ranked with temporal decay (older memories score lower, ~30-day half-life) and MMR (maximal marginal relevance, to avoid returning five near-duplicate memories). Before every LLM call, `runtime.ts` runs this search against the current message and injects up to 5 results into the system prompt as relevant context — this happens automatically, the agent doesn't have to call `memory_search` itself for background context to show up (though it can call it explicitly for a deliberate lookup).

## Embeddings require an OpenAI (or MiniMax/Voyage) key — verified in code

This is real, not a guess: `pulse/src/memory/embedding.ts` returns `null` if no embedding provider key is configured, and every caller treats a `null` embedding as "run in FTS-only mode" rather than failing.

- Default provider is OpenAI (`text-embedding-3-small`, 1536 dimensions), using the tenant's `openai_embeddings` provider key, falling back to the operator-level `OPENAI_API_KEY` env var if set.
- MiniMax (`embo-01`) and Voyage (`voyage-3-large`/`voyage-3-lite`) are also supported and configured the same way, as tenant provider keys.
- **With no key configured at all**, `hybridSearch()` skips the vector half entirely and runs pure Postgres full-text search (`ts_rank` / `plainto_tsquery`) over `memory_entries.content`. Search still works — it just matches on keywords rather than meaning, so paraphrased queries won't find semantically related memories the way they would with embeddings on.

The embedding provider is configured **tenant-wide**, under **Settings → Memory** — not per-agent. (Don't confuse this with the per-agent `MEMORY.md` file in the agent editor's Memory section — that's a different, non-vector layer.)

## Auto-Memory: capturing memories without a tool call

Besides the agent explicitly calling `memory_store`, Pulse can extract memories automatically from every conversation turn (`pulse/src/memory/auto-memory-service.ts`). After a reply, if Auto-Memory is enabled, it runs a small LLM extraction pass over the user/assistant exchange and stores up to a configured max (default 3) new memories — skipping ones that look like duplicates of what's already stored.

Auto-Memory is on by default (`enabled !== false`) and is skipped for heartbeat-triggered turns and silent replies. It's configured under **Settings → Memory** alongside the embedding provider: on/off, and max memories per turn.

## Viewing and managing memories

Each agent has a **Memory** page (Capabilities → Memory, or `/dashboard/agents/[id]/memory`) showing stats (total / facts / preferences / decisions) and a table of every stored entry — content, category, importance, use count, created date — with per-row delete and a bulk-delete-by-category action. If no memories exist yet, the page says plainly that the agent will create them via `memory_store`.

## The tenant_skills gotcha applies here too

`memory_store`, `memory_search`, and `memory_forget` are built-in tools like any other, which means they're subject to the same gate described in [Tools & Skills](/docs/agents--tools): a `tenant_skills` row must exist and be enabled for each tool name, or the agent won't have it available at all — regardless of what Auto-Memory or the embedding settings say. Auto-Memory's automatic capture doesn't go through the tool-call path, so it isn't affected by this gate; only the agent's own explicit use of `memory_store`/`memory_search`/`memory_forget` is.

## Related

- [Profile, Soul & Identity](/docs/agents--profile) — `MEMORY.md` and the rest of the workspace file stack.
- [Tools & Skills](/docs/agents--tools) — the registered-vs-enabled distinction that also gates the memory tools.
