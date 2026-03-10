/**
 * Lightweight model/provider definitions for the dashboard UI.
 * Mirrors pulse/src/agent/providers/model-registry.ts — keep in sync.
 */

export interface ModelInfo {
    id: string;
    provider: string;
    displayName: string;
    category: "flagship" | "fast" | "reasoning" | "passthrough";
}

export interface ProviderInfo {
    id: string;
    name: string;
    authMethods: ("api_key" | "oauth" | "setup_token")[];
    models: ModelInfo[];
}

export const PROVIDERS: ProviderInfo[] = [
    {
        id: "anthropic",
        name: "Anthropic",
        authMethods: ["api_key", "setup_token"],
        models: [
            { id: "claude-opus-4-6", provider: "anthropic", displayName: "Claude Opus 4.6", category: "flagship" },
            { id: "claude-sonnet-4-6", provider: "anthropic", displayName: "Claude Sonnet 4.6", category: "flagship" },
            { id: "claude-sonnet-4-20250514", provider: "anthropic", displayName: "Claude Sonnet 4", category: "flagship" },
            { id: "claude-haiku-4-5-20251001", provider: "anthropic", displayName: "Claude Haiku 4.5", category: "fast" },
            { id: "claude-3-5-sonnet-20241022", provider: "anthropic", displayName: "Claude 3.5 Sonnet", category: "fast" },
            { id: "claude-3-haiku-20240307", provider: "anthropic", displayName: "Claude 3 Haiku", category: "fast" },
        ],
    },
    {
        id: "openai",
        name: "OpenAI",
        authMethods: ["api_key", "oauth"],
        models: [
            { id: "gpt-4.1", provider: "openai", displayName: "GPT-4.1", category: "flagship" },
            { id: "gpt-4o", provider: "openai", displayName: "GPT-4o", category: "flagship" },
            { id: "gpt-4o-mini", provider: "openai", displayName: "GPT-4o Mini", category: "fast" },
            { id: "gpt-4-turbo", provider: "openai", displayName: "GPT-4 Turbo", category: "flagship" },
            { id: "o1", provider: "openai", displayName: "o1", category: "reasoning" },
        ],
    },
    {
        id: "google",
        name: "Google",
        authMethods: ["api_key"],
        models: [
            { id: "gemini-2.0-flash", provider: "google", displayName: "Gemini 2.0 Flash", category: "fast" },
            { id: "gemini-1.5-pro", provider: "google", displayName: "Gemini 1.5 Pro", category: "flagship" },
        ],
    },
    {
        id: "openrouter",
        name: "OpenRouter",
        authMethods: ["api_key"],
        models: [
            { id: "openrouter/auto", provider: "openrouter", displayName: "OpenRouter (Auto)", category: "passthrough" },
        ],
    },
    {
        id: "minimax",
        name: "MiniMax",
        authMethods: ["api_key"],
        models: [
            { id: "MiniMax-M2.5", provider: "minimax", displayName: "MiniMax M2.5", category: "flagship" },
            { id: "MiniMax-M2.5-highspeed", provider: "minimax", displayName: "MiniMax M2.5 Highspeed", category: "fast" },
        ],
    },
];

export const ALL_MODELS: ModelInfo[] = PROVIDERS.flatMap((p) => p.models);

export function getModelDisplayName(modelId: string): string {
    const model = ALL_MODELS.find((m) => m.id === modelId);
    return model?.displayName ?? modelId;
}

export function getProviderName(modelId: string): string {
    const model = ALL_MODELS.find((m) => m.id === modelId);
    if (!model) return "Unknown";
    const provider = PROVIDERS.find((p) => p.id === model.provider);
    return provider?.name ?? model.provider;
}

export const DEFAULT_MODEL_ID = "claude-sonnet-4-20250514";
