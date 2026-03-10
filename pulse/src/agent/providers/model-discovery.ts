/**
 * Model Discovery — Auto-pull available models from provider APIs.
 *
 * Supports:
 *   - Anthropic: GET /v1/models
 *   - OpenAI: GET /v1/models
 *   - OpenRouter: GET /api/v1/models (includes pricing)
 *
 * Pricing is NOT available from most provider APIs, so we use known defaults
 * and let the admin override in the DB.
 */

import { logger } from "../../utils/logger.js";

export interface DiscoveredModel {
    modelId: string;
    displayName: string;
    provider: string;
    category: "flagship" | "fast" | "reasoning" | "passthrough";
    baseInputPerMillion: number;
    baseOutputPerMillion: number;
    maxTokens: number;
}

// Known pricing for common models (real provider costs as of 2026-03)
const KNOWN_PRICING: Record<string, { input: number; output: number; maxTokens?: number; category?: string }> = {
    // Anthropic
    "claude-opus-4-6": { input: 15.0, output: 75.0, maxTokens: 32768 },
    "claude-sonnet-4-6": { input: 3.0, output: 15.0, maxTokens: 16384 },
    "claude-sonnet-4-20250514": { input: 3.0, output: 15.0, maxTokens: 8192 },
    "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0, maxTokens: 8192, category: "fast" },
    "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0, maxTokens: 8192, category: "fast" },
    "claude-3-haiku-20240307": { input: 0.25, output: 1.25, maxTokens: 4096, category: "fast" },
    // OpenAI
    "gpt-4.1": { input: 2.0, output: 8.0, maxTokens: 32768 },
    "gpt-4.1-mini": { input: 0.4, output: 1.6, maxTokens: 32768, category: "fast" },
    "gpt-4.1-nano": { input: 0.1, output: 0.4, maxTokens: 32768, category: "fast" },
    "gpt-4o": { input: 2.5, output: 10.0, maxTokens: 16384 },
    "gpt-4o-mini": { input: 0.15, output: 0.6, maxTokens: 16384, category: "fast" },
    "gpt-4-turbo": { input: 10.0, output: 30.0, maxTokens: 4096 },
    "o1": { input: 15.0, output: 60.0, maxTokens: 32768, category: "reasoning" },
    "o1-mini": { input: 1.1, output: 4.4, maxTokens: 16384, category: "reasoning" },
    "o3": { input: 10.0, output: 40.0, maxTokens: 32768, category: "reasoning" },
    "o3-mini": { input: 1.1, output: 4.4, maxTokens: 16384, category: "reasoning" },
    "o4-mini": { input: 1.1, output: 4.4, maxTokens: 16384, category: "reasoning" },
    // Google
    "gemini-2.0-flash": { input: 0.1, output: 0.4, maxTokens: 8192, category: "fast" },
    "gemini-2.5-flash-preview-05-20": { input: 0.15, output: 0.6, maxTokens: 8192, category: "fast" },
    "gemini-2.5-pro-preview-05-06": { input: 1.25, output: 10.0, maxTokens: 8192 },
    "gemini-1.5-pro": { input: 1.25, output: 5.0, maxTokens: 8192 },
};

function prettifyModelId(modelId: string): string {
    return modelId
        .replace(/^models\//, "")
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
        .replace(/(\d) (\d)/g, "$1.$2"); // "4 1" -> "4.1"
}

function categorize(modelId: string): "flagship" | "fast" | "reasoning" | "passthrough" {
    const known = KNOWN_PRICING[modelId];
    if (known?.category) return known.category as any;
    if (/haiku|mini|nano|flash/i.test(modelId)) return "fast";
    if (/o1|o3|o4|reasoning/i.test(modelId)) return "reasoning";
    return "flagship";
}

export async function discoverModels(provider: string, apiKey: string): Promise<DiscoveredModel[]> {
    switch (provider) {
        case "anthropic":
            return discoverAnthropic(apiKey);
        case "openai":
            return discoverOpenAI(apiKey);
        case "openrouter":
            return discoverOpenRouter(apiKey);
        default:
            logger.warn({ provider }, "Model discovery not supported for this provider");
            return [];
    }
}

async function discoverAnthropic(apiKey: string): Promise<DiscoveredModel[]> {
    try {
        const res = await fetch("https://api.anthropic.com/v1/models", {
            headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
        });

        if (!res.ok) {
            logger.warn({ status: res.status }, "Anthropic models API failed");
            return [];
        }

        const data = await res.json();
        const models: DiscoveredModel[] = [];

        for (const m of data.data || []) {
            const id = m.id;
            // Skip deprecated / embed models
            if (/embed|instant/i.test(id)) continue;

            const known = KNOWN_PRICING[id];
            models.push({
                modelId: id,
                displayName: m.display_name || prettifyModelId(id),
                provider: "anthropic",
                category: categorize(id),
                baseInputPerMillion: known?.input ?? 3.0,
                baseOutputPerMillion: known?.output ?? 15.0,
                maxTokens: known?.maxTokens ?? 8192,
            });
        }

        logger.info({ count: models.length }, "Discovered Anthropic models");
        return models;
    } catch (err) {
        logger.error({ err }, "Failed to discover Anthropic models");
        return [];
    }
}

async function discoverOpenAI(apiKey: string): Promise<DiscoveredModel[]> {
    try {
        const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!res.ok) {
            logger.warn({ status: res.status }, "OpenAI models API failed");
            return [];
        }

        const data = await res.json();
        const models: DiscoveredModel[] = [];

        // Filter to chat-capable models only
        const chatModelPatterns = /^(gpt-4|gpt-3\.5|o1|o3|o4|chatgpt)/;
        const skipPatterns = /audio|realtime|tts|dall-e|whisper|embed|davinci|babbage|moderation|search/i;

        for (const m of data.data || []) {
            const id = m.id;
            if (!chatModelPatterns.test(id) || skipPatterns.test(id)) continue;

            const known = KNOWN_PRICING[id];
            models.push({
                modelId: id,
                displayName: prettifyModelId(id),
                provider: "openai",
                category: categorize(id),
                baseInputPerMillion: known?.input ?? 2.0,
                baseOutputPerMillion: known?.output ?? 8.0,
                maxTokens: known?.maxTokens ?? 16384,
            });
        }

        logger.info({ count: models.length }, "Discovered OpenAI models");
        return models;
    } catch (err) {
        logger.error({ err }, "Failed to discover OpenAI models");
        return [];
    }
}

async function discoverOpenRouter(apiKey: string): Promise<DiscoveredModel[]> {
    try {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!res.ok) {
            logger.warn({ status: res.status }, "OpenRouter models API failed");
            return [];
        }

        const data = await res.json();
        const models: DiscoveredModel[] = [];

        // OpenRouter includes pricing in its API response
        for (const m of data.data || []) {
            const id = m.id;
            // OpenRouter pricing is per-token, convert to per-million
            const inputPrice = parseFloat(m.pricing?.prompt || "0") * 1_000_000;
            const outputPrice = parseFloat(m.pricing?.completion || "0") * 1_000_000;

            // Only include popular/useful models (skip > 500 obscure ones)
            if (inputPrice === 0 && outputPrice === 0) continue;

            models.push({
                modelId: id,
                displayName: m.name || prettifyModelId(id),
                provider: "openrouter",
                category: categorize(id),
                baseInputPerMillion: inputPrice,
                baseOutputPerMillion: outputPrice,
                maxTokens: m.context_length ? Math.min(m.context_length, 32768) : 8192,
            });
        }

        logger.info({ count: models.length }, "Discovered OpenRouter models");
        return models;
    } catch (err) {
        logger.error({ err }, "Failed to discover OpenRouter models");
        return [];
    }
}
