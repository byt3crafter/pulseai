Every agent needs a model to think with. Pulse doesn't ship its own model — it routes each agent's replies to a provider you connect (Anthropic, OpenAI, Google, Groq, OpenRouter, or MiniMax) using a key you supply. This page covers where that key goes, how the model list is built, and which providers are ready for real use versus experimental.

## Connect a provider

Go to **Settings → AI Providers**. Pick a provider from the "Add a provider" dropdown, paste an API key, and save.

| Provider | Auth | Free tier | Notes |
|---|---|---|---|
| Anthropic | API key | No | Claude Opus / Sonnet / Haiku family |
| OpenAI | API key, or "Sign in with ChatGPT" | No | GPT-4.1, GPT-4o, o1 |
| Google | API key | Yes | Gemini 2.0 Flash / 1.5 Pro — good for testing |
| Groq | API key | Yes, generous | Llama 3.x — genuinely free, no card |
| OpenRouter | API key | No | Pass-through to whatever model you route to |
| MiniMax | API key | No | MiniMax M2/M3 family |

The key is encrypted before it's stored and is only ever decrypted for the moment it's needed to call the provider. Nobody can read it back out in plain text once it's saved.

Once a provider is connected, every agent's **Model** dropdown offers that provider's models.

> Removing a key (the "Remove" action on a connected provider's card) deletes it outright — it isn't a soft pause. Any agent still set to that provider's model will fail its next reply until you either reconnect the key or switch the agent to a different model.

### OpenAI's two sign-in options — don't confuse them

The OpenAI card offers **"Sign in with ChatGPT,"** which connects your own ChatGPT subscription with no API key needed. This is separate from the "Codex" option covered below — same underlying vendor, different setup, and only one of them is meant for everyday use today.

## The model list updates itself, for some providers

The model dropdown doesn't always show a fixed list. For **OpenAI, Groq, OpenRouter, and MiniMax**, once you've connected an API key, the dropdown reflects that provider's own current model catalog — so a new model release shows up without waiting on a Pulse update. **Anthropic and Google show a curated list that Pulse maintains** and updates as new models become available.

The Anthropic list is also the platform default: if an agent has no model set, it falls back to a current Claude Sonnet model.

## Which key gets used

For every reply, Pulse looks for a usable key in this order:

1. **Your own key** — the one you saved in Settings → AI Providers for this workspace.
2. **A workspace-wide key**, if your Pulse administrator has configured one for that provider.
3. Otherwise, the call fails and the agent shows a "Setup required" message pointing back at this page.

> In practice, plan on connecting your own key for whichever provider you use. Workspace-wide fallback keys, where they exist, vary by provider — for Groq in particular, connecting your own key is the only path that works, which is fine since Groq's free tier makes that a two-minute step.

## Automatic fallback on failure

If the primary provider call fails — a rate limit, an outage, an invalid key — Pulse retries once against a comparable model on a different provider (for example, a Claude model falls back to a GPT model, and vice versa). This only works if you also have a key connected for that fallback provider; if you don't, the original error is what reaches the agent.

## Codex (ChatGPT subscription) — not ready for general use

You'll see a **"Codex (ChatGPT subscription)"** option in the provider list. Don't offer this to your team yet:

> Connecting anything in the AI Providers card for Codex has no effect today — there's no working sign-in path for it from the dashboard. Stick to the other providers above; if you specifically need this option, contact your Pulse administrator.

## Pricing

Each model carries a cost that Pulse uses for your own usage tracking. This is Pulse's internal cost figure and doesn't change what a provider actually bills you on your own account with them. If you believe the figure for a model needs updating, contact your Pulse administrator.

## Related

- [Profile, Soul & Identity](/dashboard/docs/agents/profile) — where an agent's model is set.
- [Tools & Skills](/dashboard/docs/agents/tools) — what an agent can do once it has a model to think with.
