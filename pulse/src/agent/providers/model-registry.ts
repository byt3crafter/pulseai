/**
 * Model & Provider Registry — Single source of truth for all supported LLM providers and models.
 * No database needed to add/remove providers — just edit this file.
 */

export interface ModelPricing {
    inputPerMillion: number;  // USD per 1M input tokens
    outputPerMillion: number; // USD per 1M output tokens
}

export interface ModelDefinition {
    id: string;
    provider: string;
    displayName: string;
    category: "flagship" | "fast" | "reasoning" | "passthrough";
    pricing: ModelPricing;
    maxTokens: number;
}

export type AuthMethod = "api_key" | "oauth" | "setup_token";

export interface ProviderDefinition {
    id: string;
    name: string;
    authMethods: AuthMethod[];
    models: ModelDefinition[];
    envKeyName?: string; // Env var name for global fallback key
}

// ─── Provider Definitions ────────────────────────────────────────────────────

const anthropicProvider: ProviderDefinition = {
    id: "anthropic",
    name: "Anthropic",
    authMethods: ["api_key", "setup_token"],
    envKeyName: "ANTHROPIC_API_KEY",
    models: [
        {
            id: "claude-opus-4-6",
            provider: "anthropic",
            displayName: "Claude Opus 4.6",
            category: "flagship",
            pricing: { inputPerMillion: 15.0, outputPerMillion: 75.0 },
            maxTokens: 32768,
        },
        {
            id: "claude-sonnet-4-6",
            provider: "anthropic",
            displayName: "Claude Sonnet 4.6",
            category: "flagship",
            pricing: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
            maxTokens: 16384,
        },
        {
            id: "claude-sonnet-4-20250514",
            provider: "anthropic",
            displayName: "Claude Sonnet 4",
            category: "flagship",
            pricing: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
            maxTokens: 8192,
        },
        {
            id: "claude-haiku-4-5-20251001",
            provider: "anthropic",
            displayName: "Claude Haiku 4.5",
            category: "fast",
            pricing: { inputPerMillion: 0.8, outputPerMillion: 4.0 },
            maxTokens: 8192,
        },
        {
            id: "claude-3-5-sonnet-20241022",
            provider: "anthropic",
            displayName: "Claude 3.5 Sonnet",
            category: "fast",
            pricing: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
            maxTokens: 8192,
        },
        {
            id: "claude-3-haiku-20240307",
            provider: "anthropic",
            displayName: "Claude 3 Haiku",
            category: "fast",
            pricing: { inputPerMillion: 0.25, outputPerMillion: 1.25 },
            maxTokens: 4096,
        },
    ],
};

const openaiProvider: ProviderDefinition = {
    id: "openai",
    name: "OpenAI",
    authMethods: ["api_key", "oauth"],
    envKeyName: "OPENAI_API_KEY",
    models: [
        {
            id: "gpt-4.1",
            provider: "openai",
            displayName: "GPT-4.1",
            category: "flagship",
            pricing: { inputPerMillion: 2.0, outputPerMillion: 8.0 },
            maxTokens: 32768,
        },
        {
            id: "gpt-4o",
            provider: "openai",
            displayName: "GPT-4o",
            category: "flagship",
            pricing: { inputPerMillion: 2.5, outputPerMillion: 10.0 },
            maxTokens: 16384,
        },
        {
            id: "gpt-4o-mini",
            provider: "openai",
            displayName: "GPT-4o Mini",
            category: "fast",
            pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
            maxTokens: 16384,
        },
        {
            id: "gpt-4-turbo",
            provider: "openai",
            displayName: "GPT-4 Turbo",
            category: "flagship",
            pricing: { inputPerMillion: 10.0, outputPerMillion: 30.0 },
            maxTokens: 4096,
        },
        {
            id: "o1",
            provider: "openai",
            displayName: "o1",
            category: "reasoning",
            pricing: { inputPerMillion: 15.0, outputPerMillion: 60.0 },
            maxTokens: 32768,
        },
    ],
};
// NOTE: left the OpenAI catalog above as-is. Renaming these ids (e.g. to
// GPT-5.x) is not "trivial" — gpt-4.1/gpt-4o/gpt-4-turbo/o1 are referenced by
// id across pulse/src/agent/providers/model-discovery.ts, the fallback map
// below, dashboard/src/utils/models.ts, dashboard admin settings, and
// multiple test suites. Renaming here without touching all of those would
// silently break fallback routing and dashboard model pickers. Out of scope
// for the codex provider task — flagging for a dedicated follow-up instead.

/**
 * Codex App-Server provider — routes to `CodexAppServerProvider`, which
 * drives `codex app-server` as a subprocess on the *host machine's* ChatGPT/
 * Codex subscription login (no API key). See codex-app-server.ts for the
 * important multi-tenancy caveat: this is a shared host-level credential,
 * not per-tenant BYOK. Model ids mirror the real Codex/ChatGPT-subscription
 * catalog as of codex-cli 0.142.1 (confirmed live: `~/.codex/config.toml`
 * on this host defaults to `model = "gpt-5.5"`).
 */
const codexProvider: ProviderDefinition = {
    id: "codex",
    name: "Codex (ChatGPT subscription)",
    authMethods: ["oauth"],
    models: [
        {
            id: "gpt-5.5",
            provider: "codex",
            displayName: "GPT-5.5 (Codex)",
            category: "flagship",
            pricing: { inputPerMillion: 0, outputPerMillion: 0 },
            maxTokens: 32768,
        },
        {
            id: "gpt-5.5-pro",
            provider: "codex",
            displayName: "GPT-5.5 Pro (Codex)",
            category: "reasoning",
            pricing: { inputPerMillion: 0, outputPerMillion: 0 },
            maxTokens: 32768,
        },
        {
            id: "gpt-5.4",
            provider: "codex",
            displayName: "GPT-5.4 (Codex)",
            category: "flagship",
            pricing: { inputPerMillion: 0, outputPerMillion: 0 },
            maxTokens: 32768,
        },
        {
            id: "gpt-5.4-codex",
            provider: "codex",
            displayName: "GPT-5.4 Codex",
            category: "reasoning",
            pricing: { inputPerMillion: 0, outputPerMillion: 0 },
            maxTokens: 32768,
        },
        {
            id: "gpt-5.4-mini",
            provider: "codex",
            displayName: "GPT-5.4 Mini (Codex)",
            category: "fast",
            pricing: { inputPerMillion: 0, outputPerMillion: 0 },
            maxTokens: 16384,
        },
    ],
};

const googleProvider: ProviderDefinition = {
    id: "google",
    name: "Google",
    authMethods: ["api_key"],
    envKeyName: "GOOGLE_API_KEY",
    models: [
        {
            id: "gemini-2.0-flash",
            provider: "google",
            displayName: "Gemini 2.0 Flash",
            category: "fast",
            pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 },
            maxTokens: 8192,
        },
        {
            id: "gemini-1.5-pro",
            provider: "google",
            displayName: "Gemini 1.5 Pro",
            category: "flagship",
            pricing: { inputPerMillion: 1.25, outputPerMillion: 5.0 },
            maxTokens: 8192,
        },
    ],
};

const openrouterProvider: ProviderDefinition = {
    id: "openrouter",
    name: "OpenRouter",
    authMethods: ["api_key"],
    envKeyName: "OPENROUTER_API_KEY",
    models: [
        {
            id: "openrouter/auto",
            provider: "openrouter",
            displayName: "OpenRouter (Auto)",
            category: "passthrough",
            pricing: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
            maxTokens: 4096,
        },
    ],
};

const minimaxProvider: ProviderDefinition = {
    id: "minimax",
    name: "MiniMax",
    authMethods: ["api_key"],
    envKeyName: "MINIMAX_API_KEY",
    models: [
        {
            id: "MiniMax-M3",
            provider: "minimax",
            displayName: "MiniMax M3",
            category: "flagship",
            pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
            maxTokens: 8192,
        },
        {
            id: "MiniMax-M2.7",
            provider: "minimax",
            displayName: "MiniMax M2.7",
            category: "flagship",
            pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
            maxTokens: 8192,
        },
        {
            id: "MiniMax-M2.7-highspeed",
            provider: "minimax",
            displayName: "MiniMax M2.7 Highspeed",
            category: "fast",
            pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
            maxTokens: 8192,
        },
        {
            id: "MiniMax-M2.5",
            provider: "minimax",
            displayName: "MiniMax M2.5",
            category: "flagship",
            pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
            maxTokens: 8192,
        },
        {
            id: "MiniMax-M2.5-highspeed",
            provider: "minimax",
            displayName: "MiniMax M2.5 Highspeed",
            category: "fast",
            pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
            maxTokens: 8192,
        },
        {
            id: "MiniMax-M2.1",
            provider: "minimax",
            displayName: "MiniMax M2.1",
            category: "flagship",
            pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
            maxTokens: 8192,
        },
        {
            id: "MiniMax-M2.1-lightning",
            provider: "minimax",
            displayName: "MiniMax M2.1 Lightning",
            category: "fast",
            pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
            maxTokens: 8192,
        },
        {
            id: "MiniMax-M2",
            provider: "minimax",
            displayName: "MiniMax M2",
            category: "flagship",
            pricing: { inputPerMillion: 0.2, outputPerMillion: 0.8 },
            maxTokens: 8192,
        },
    ],
};

// Groq — genuinely free tier (no card, generous limits, works globally). Great for testing.
const groqProvider: ProviderDefinition = {
    id: "groq",
    name: "Groq",
    authMethods: ["api_key"],
    envKeyName: "GROQ_API_KEY",
    models: [
        {
            id: "llama-3.3-70b-versatile",
            provider: "groq",
            displayName: "Llama 3.3 70B (Groq, free)",
            category: "flagship",
            pricing: { inputPerMillion: 0, outputPerMillion: 0 },
            maxTokens: 8192,
        },
        {
            id: "llama-3.1-8b-instant",
            provider: "groq",
            displayName: "Llama 3.1 8B Instant (Groq, free)",
            category: "fast",
            pricing: { inputPerMillion: 0, outputPerMillion: 0 },
            maxTokens: 8192,
        },
    ],
};

// ─── Registry ────────────────────────────────────────────────────────────────

const ALL_PROVIDERS: ProviderDefinition[] = [
    anthropicProvider,
    openaiProvider,
    codexProvider,
    googleProvider,
    groqProvider,
    openrouterProvider,
    minimaxProvider,
];

const MODEL_MAP = new Map<string, ModelDefinition>();
const PROVIDER_MAP = new Map<string, ProviderDefinition>();

for (const provider of ALL_PROVIDERS) {
    PROVIDER_MAP.set(provider.id, provider);
    for (const model of provider.models) {
        MODEL_MAP.set(model.id, model);
    }
}

// ─── Exported Helpers ────────────────────────────────────────────────────────

export function getModelById(modelId: string): ModelDefinition | undefined {
    return MODEL_MAP.get(modelId);
}

export function getDefaultModel(): ModelDefinition {
    return anthropicProvider.models[2]; // claude-sonnet-4-20250514
}

export function getProviderByModel(modelId: string): ProviderDefinition | undefined {
    const model = MODEL_MAP.get(modelId);
    if (model) return PROVIDER_MAP.get(model.provider);
    // Not in the static catalog (e.g. a live-fetched model like a brand-new
    // MiniMax release) — infer the provider from the model id so ANY model a
    // connected provider offers still routes correctly, no code change needed.
    const inferred = inferProviderId(modelId);
    return inferred ? PROVIDER_MAP.get(inferred) : undefined;
}

/** Best-effort provider id from a model id, for models not in the static catalog. */
export function inferProviderId(modelId: string): string | undefined {
    const id = (modelId || "").toLowerCase();
    if (id.startsWith("claude")) return "anthropic";
    if (id.startsWith("minimax") || id.startsWith("abab")) return "minimax";
    if (id.startsWith("gemini") || id.startsWith("models/gemini")) return "google";
    if (id.startsWith("gpt") || id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4")
        || id.startsWith("chatgpt") || id.startsWith("text-embedding") || id.startsWith("davinci")) return "openai";
    if (id.includes("/")) return "openrouter"; // vendor/model slugs, e.g. "meta-llama/llama-3.3-70b"
    if (id.startsWith("llama") || id.startsWith("mixtral") || id.startsWith("gemma")
        || id.startsWith("deepseek") || id.startsWith("qwen") || id.startsWith("moonshot")
        || id.startsWith("kimi") || id.startsWith("whisper")) return "groq";
    return undefined;
}

export function getProviderById(providerId: string): ProviderDefinition | undefined {
    return PROVIDER_MAP.get(providerId);
}

export function getAllProviders(): ProviderDefinition[] {
    return ALL_PROVIDERS;
}

export function getAllModels(): ModelDefinition[] {
    return Array.from(MODEL_MAP.values());
}

/** Cross-provider model mapping for fallback scenarios */
export function getFallbackModelId(modelId: string): string | undefined {
    const model = MODEL_MAP.get(modelId);
    if (!model) return undefined;

    const fallbackMap: Record<string, string> = {
        // Anthropic -> OpenAI fallbacks
        "claude-opus-4-6": "gpt-4.1",
        "claude-sonnet-4-6": "gpt-4.1",
        "claude-sonnet-4-20250514": "gpt-4o",
        "claude-haiku-4-5-20251001": "gpt-4o-mini",
        "claude-3-5-sonnet-20241022": "gpt-4o",
        "claude-3-haiku-20240307": "gpt-4o-mini",
        // OpenAI -> Anthropic fallbacks
        "gpt-4.1": "claude-sonnet-4-6",
        "gpt-4o": "claude-sonnet-4-20250514",
        "gpt-4o-mini": "claude-haiku-4-5-20251001",
        "gpt-4-turbo": "claude-sonnet-4-20250514",
        "o1": "claude-sonnet-4-6",
    };

    return fallbackMap[modelId];
}
