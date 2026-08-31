# Model Groups

A named, ordered set of models an agent auto-picks from, with a strategy the
customer chooses. Replaces two hardcoded things: the model→model fallback map
in `model-registry.ts`, and smart routing's two fixed slots.

**Zero hardcoding** — the models and the strategy are config (a `model_groups`
row), edited in the app at `/dashboard/agents/model-groups`. An agent points at
a group via `agent_profiles.model_group_id`; NULL = its single model, as before.

## Strategies (selectable per group)
- **failover** — use the first model; on error/rate-limit fall through in order.
- **cost** — cheapest model (front of the list) for a simple, tool-free turn;
  capable (back) for anything with a question, tools, attachments, code or URL.
- **both** — pick by cost, and still fail over the whole group.

Every strategy returns the FULL ordered list, so failover is never lost — a
cheap guess that errors still falls through.

## Flow
`runtime.ts` resolves the group, orders the models for the turn
(`model-group-service.orderModelsForTurn`), runs the lead, and passes the whole
ordered list as `fallbackChain` to `provider-manager.chat`, which walks it on
failure. The `fallbackChain` REPLACES the hardcoded map when present; absent, the
old single-fallback behaviour is unchanged.

## Not built yet
- Per-tenant default group (today it's per-agent only).
- Health/latency-aware pick (cost uses a text heuristic, not live metrics).
