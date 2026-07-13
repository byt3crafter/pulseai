Every agent needs a model to think with. Pulse doesn't ship its own LLM — it routes each agent's turns to a provider you connect (Anthropic, OpenAI, Google, Groq, OpenRouter, or MiniMax) using a key you supply. This page covers where that key lives, how the model list is built, and which providers are actually production-ready versus experimental.

## Connect a provider

Go to **Settings → AI Providers**. Pick a provider from the "Add a provider" dropdown, paste an API key, and save.

| Provider | Auth | Free tier | Notes |
|---|---|---|---|
| Anthropic | API key | No | Claude Opus/Sonnet/Haiku family |
| OpenAI | API key, or "Sign in with ChatGPT" (OAuth) | No | GPT-4.1, GPT-4o, o1 |
| Google | API key | Yes | Gemini 2.0 Flash / 1.5 Pro — good for testing |
| Groq | API key | Yes, generous | Llama 3.x — genuinely free, no card |
| OpenRouter | API key | No | Pass-through to whatever model you route to |
| MiniMax | API key | No | MiniMax M2/M3 family |

The key is encrypted with AES-256-GCM before it touches the database (`tenantProviderKeys.encryptedApiKey`) and is only decrypted in-memory, per request, to call the provider. Nobody — including a database dump — can read it back out in plaintext.

Once a provider is connected, every agent's **Model** dropdown (Agent Profiles → an agent) offers that provider's models.

> Removing a key (the "Remove" action on a connected provider's card) deletes the row outright — it isn't a soft-disable. Any agent still set to that provider's model will fail its next turn until you either reconnect the key or switch the agent to a different model.

### OpenAI's two auth paths — don't confuse them

OpenAI has a real per-tenant OAuth path in the AI Providers card: "Sign in with ChatGPT" runs a PKCE flow and stores a working per-tenant OAuth token, no API key needed. This is separate from the "Codex" provider covered below — same underlying vendor, different plumbing.

## The model list is live, for some providers

The model dropdown doesn't always show a hardcoded list. For **OpenAI, Groq, OpenRouter, and MiniMax**, once you've saved an API-key-based connection, the dropdown calls that provider's own `GET /v1/models` endpoint and shows whatever it actually returns — so a brand-new model release shows up without a Pulse code change or redeploy. **Anthropic and Google keep a curated, hardcoded list** — their `/v1/models` isn't queried live from the dashboard.

The Anthropic list in particular is the runtime's default: if an agent has no model set, it falls back to `claude-sonnet-4-20250514`.

## Key resolution order (BYOK, then fallback)

For every LLM call, Pulse resolves which API key to use in this order:

1. **Tenant key** — the one you saved in Settings → AI Providers for this workspace.
2. **Global admin key** — a key the platform operator (not you) configured system-wide, if any.
3. **Environment variable** on the server process, named after the provider (e.g. `ANTHROPIC_API_KEY`).

In practice, only rely on tier 1. Two real gaps make tiers 2 and 3 unreliable for anything except Anthropic and OpenAI:

> **Tier 3 only works for two providers.** The gateway's env schema (`pulse/src/config.ts`) only declares `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`. Setting `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `MINIMAX_API_KEY`, or `GROQ_API_KEY` on the host has **no effect** — those variables aren't in the validated schema, so Zod strips them before the rest of the app ever sees `config`, and the key resolver's env-var lookup for those four providers always comes back empty.
>
> **Tier 2 has no entry for Groq at all.** The global-admin key lookup covers Anthropic, OpenAI, Google, OpenRouter, and MiniMax, but not Groq — there's no code path for a platform-wide Groq key.
>
> Net effect: for Google, OpenRouter, and MiniMax, only tenant BYOK (tier 1) and a global admin key (tier 2) can supply a key. For **Groq, tenant BYOK is the only tier that works at all** — which is fine in practice since Groq's free tier makes BYOK trivial, but don't expect a platform-wide fallback to save you if you forget to connect it.

## Automatic fallback on failure

If the primary provider call fails (rate limit, outage, invalid key), Pulse retries once against a mapped fallback model on a different provider — e.g. Claude Sonnet falls back to GPT-4o, and vice versa. This only works if you also have a key connected for the fallback provider; if you don't, the original error is what reaches the agent.

## Codex (ChatGPT subscription) — experimental, not multi-tenant safe

The model list includes a "Codex (ChatGPT subscription)" provider with models like `gpt-5.5`. Before you offer this to a customer, understand what it actually is:

> **This is a shared, host-level credential — not BYOK.** It runs `codex app-server` as a subprocess directly on the machine hosting Pulse, authenticated via whatever `codex login` session exists on *that host's* filesystem (`~/.codex/auth.json`). Every tenant that selects a `codex` model shares that one login. There is no per-tenant key, no OAuth flow in the dashboard for it, and no isolation between tenants who both pick it.
>
> Connecting anything in the AI Providers card for "Codex" has no effect — the provider code never reads a tenant-stored key for this path. The only way to make it work is to run `codex login` on the server itself.

Treat this as an internal/ops feature for now, not something to hand a customer a "Connect" button for.

## Pricing

Each model carries an input/output cost per million tokens, used for usage tracking and billing. Pricing for known models is hardcoded as a fallback (`pulse/src/agent/providers/model-registry.ts` and `model-discovery.ts`); an admin can override it from the database if a provider changes list price. This doesn't affect what a provider actually bills you — it's Pulse's own cost-tracking figure.

## Related

- [Profile, Soul & Identity](/docs/agents--profile) — where an agent's model, reasoning effort, and progress verbosity are set.
- [Tools & Skills](/docs/agents--tools) — what an agent can do once it has a model to think with.
