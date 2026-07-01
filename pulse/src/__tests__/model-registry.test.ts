/**
 * Model Registry Tests
 *
 * Verifies that the model/provider registry returns correct data for known
 * models and handles unknown inputs gracefully.
 */
import { describe, it, expect } from "vitest";
import {
    getModelById,
    getDefaultModel,
    getProviderByModel,
    getProviderById,
    getAllProviders,
    getAllModels,
    getFallbackModelId,
} from "../agent/providers/model-registry.js";

// ─── getModelById ─────────────────────────────────────────────────────────────

describe("getModelById", () => {
    it("returns the correct model definition for a known Anthropic model", () => {
        const model = getModelById("claude-sonnet-4-20250514");
        expect(model).toBeDefined();
        expect(model!.id).toBe("claude-sonnet-4-20250514");
        expect(model!.provider).toBe("anthropic");
        expect(model!.displayName).toBeTruthy();
    });

    it("returns the correct model definition for a known OpenAI model", () => {
        const model = getModelById("gpt-4o");
        expect(model).toBeDefined();
        expect(model!.id).toBe("gpt-4o");
        expect(model!.provider).toBe("openai");
    });

    it("returns the correct model definition for a Google model", () => {
        const model = getModelById("gemini-2.0-flash");
        expect(model).toBeDefined();
        expect(model!.provider).toBe("google");
    });

    it("returns the correct model definition for a MiniMax model", () => {
        const model = getModelById("MiniMax-M2.5");
        expect(model).toBeDefined();
        expect(model!.provider).toBe("minimax");
    });

    it("returns undefined for an unknown model id", () => {
        expect(getModelById("gpt-99-ultra")).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
        expect(getModelById("")).toBeUndefined();
    });

    it("every model has required fields: id, provider, displayName, category, pricing, maxTokens", () => {
        for (const model of getAllModels()) {
            expect(model.id, "missing id").toBeTruthy();
            expect(model.provider, `${model.id} missing provider`).toBeTruthy();
            expect(model.displayName, `${model.id} missing displayName`).toBeTruthy();
            expect(["flagship", "fast", "reasoning", "passthrough"]).toContain(model.category);
            expect(model.pricing.inputPerMillion).toBeGreaterThanOrEqual(0);
            expect(model.pricing.outputPerMillion).toBeGreaterThanOrEqual(0);
            expect(model.maxTokens).toBeGreaterThan(0);
        }
    });
});

// ─── getDefaultModel ──────────────────────────────────────────────────────────

describe("getDefaultModel", () => {
    it("returns a valid model definition", () => {
        const model = getDefaultModel();
        expect(model).toBeDefined();
        expect(model.id).toBeTruthy();
        expect(model.provider).toBeTruthy();
    });

    it("returns claude-sonnet-4-20250514 as the default", () => {
        expect(getDefaultModel().id).toBe("claude-sonnet-4-20250514");
    });

    it("default model belongs to the anthropic provider", () => {
        expect(getDefaultModel().provider).toBe("anthropic");
    });

    it("default model is consistent across multiple calls", () => {
        expect(getDefaultModel().id).toBe(getDefaultModel().id);
    });
});

// ─── getProviderByModel ───────────────────────────────────────────────────────

describe("getProviderByModel", () => {
    it("returns anthropic provider for a Claude model", () => {
        const provider = getProviderByModel("claude-opus-4-6");
        expect(provider).toBeDefined();
        expect(provider!.id).toBe("anthropic");
        expect(provider!.name).toBe("Anthropic");
    });

    it("returns openai provider for a GPT model", () => {
        const provider = getProviderByModel("gpt-4o");
        expect(provider).toBeDefined();
        expect(provider!.id).toBe("openai");
    });

    it("returns google provider for a Gemini model", () => {
        const provider = getProviderByModel("gemini-1.5-pro");
        expect(provider).toBeDefined();
        expect(provider!.id).toBe("google");
    });

    it("returns openrouter provider for the OpenRouter auto model", () => {
        const provider = getProviderByModel("openrouter/auto");
        expect(provider).toBeDefined();
        expect(provider!.id).toBe("openrouter");
    });

    it("returns minimax provider for a MiniMax model", () => {
        const provider = getProviderByModel("MiniMax-M2.5");
        expect(provider).toBeDefined();
        expect(provider!.id).toBe("minimax");
    });

    it("returns undefined for an unknown model id", () => {
        expect(getProviderByModel("unknown-model-xyz")).toBeUndefined();
    });
});

// ─── getProviderById ──────────────────────────────────────────────────────────

describe("getProviderById", () => {
    it("returns the anthropic provider", () => {
        const p = getProviderById("anthropic");
        expect(p).toBeDefined();
        expect(p!.id).toBe("anthropic");
        expect(Array.isArray(p!.models)).toBe(true);
        expect(p!.models.length).toBeGreaterThan(0);
    });

    it("returns the openai provider", () => {
        expect(getProviderById("openai")).toBeDefined();
    });

    it("returns the google provider", () => {
        expect(getProviderById("google")).toBeDefined();
    });

    it("returns the openrouter provider", () => {
        expect(getProviderById("openrouter")).toBeDefined();
    });

    it("returns the minimax provider", () => {
        expect(getProviderById("minimax")).toBeDefined();
    });

    it("returns undefined for an unknown provider id", () => {
        expect(getProviderById("notareal-provider")).toBeUndefined();
    });
});

// ─── getAllProviders ──────────────────────────────────────────────────────────

describe("getAllProviders", () => {
    it("returns at least 5 providers", () => {
        expect(getAllProviders().length).toBeGreaterThanOrEqual(5);
    });

    it("includes anthropic, openai, google, openrouter, minimax", () => {
        const ids = getAllProviders().map((p) => p.id);
        expect(ids).toContain("anthropic");
        expect(ids).toContain("openai");
        expect(ids).toContain("google");
        expect(ids).toContain("openrouter");
        expect(ids).toContain("minimax");
    });

    it("each provider has a non-empty name and id", () => {
        for (const p of getAllProviders()) {
            expect(p.id).toBeTruthy();
            expect(p.name).toBeTruthy();
        }
    });

    it("each provider has at least one model", () => {
        for (const p of getAllProviders()) {
            expect(p.models.length, `${p.id} has no models`).toBeGreaterThan(0);
        }
    });

    it("provider IDs are unique", () => {
        const ids = getAllProviders().map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

// ─── getAllModels ─────────────────────────────────────────────────────────────

describe("getAllModels", () => {
    it("returns at least 15 models", () => {
        expect(getAllModels().length).toBeGreaterThanOrEqual(15);
    });

    it("model IDs are unique across all providers", () => {
        const ids = getAllModels().map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

// ─── getFallbackModelId ───────────────────────────────────────────────────────

describe("getFallbackModelId", () => {
    it("returns an OpenAI fallback for claude-opus-4-6", () => {
        expect(getFallbackModelId("claude-opus-4-6")).toBe("gpt-4.1");
    });

    it("returns gpt-4o as fallback for claude-sonnet-4-20250514", () => {
        expect(getFallbackModelId("claude-sonnet-4-20250514")).toBe("gpt-4o");
    });

    it("returns gpt-4o-mini as fallback for claude-haiku models", () => {
        expect(getFallbackModelId("claude-haiku-4-5-20251001")).toBe("gpt-4o-mini");
        expect(getFallbackModelId("claude-3-haiku-20240307")).toBe("gpt-4o-mini");
    });

    it("returns an Anthropic fallback for gpt-4o", () => {
        expect(getFallbackModelId("gpt-4o")).toBe("claude-sonnet-4-20250514");
    });

    it("returns an Anthropic fallback for gpt-4o-mini", () => {
        expect(getFallbackModelId("gpt-4o-mini")).toBe("claude-haiku-4-5-20251001");
    });

    it("returns an Anthropic fallback for gpt-4-turbo", () => {
        expect(getFallbackModelId("gpt-4-turbo")).toBe("claude-sonnet-4-20250514");
    });

    it("returns an Anthropic fallback for o1", () => {
        expect(getFallbackModelId("o1")).toBe("claude-sonnet-4-6");
    });

    it("returns undefined for a model with no fallback mapping (e.g. gemini-2.0-flash)", () => {
        // Google models are not in the fallback map
        expect(getFallbackModelId("gemini-2.0-flash")).toBeUndefined();
    });

    it("returns undefined for an unknown model id", () => {
        expect(getFallbackModelId("totally-unknown-model")).toBeUndefined();
    });

    it("fallback model IDs resolve to known models in the registry", () => {
        const knownIds = new Set(getAllModels().map((m) => m.id));

        for (const model of getAllModels()) {
            const fallback = getFallbackModelId(model.id);
            if (fallback !== undefined) {
                expect(knownIds.has(fallback), `fallback '${fallback}' for '${model.id}' not found`).toBe(true);
            }
        }
    });
});
