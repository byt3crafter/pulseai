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

// ─── Registry ────────────────────────────────────────────────────────────────

const ALL_PROVIDERS: ProviderDefinition[] = [
    anthropicProvider,
    openaiProvider,
    googleProvider,
    openrouterProvider,
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
    if (!model) return undefined;
    return PROVIDER_MAP.get(model.provider);
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
