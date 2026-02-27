/**
 * Provider Fallback Tests
 *
 * Verifies the LLM provider fallback chain so both providers failing
 * is caught gracefully instead of silently swallowing errors.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies
vi.mock("../../src/agent/providers/provider-key-service.js", () => ({
    providerKeyService: {
        resolveKey: vi.fn(),
    },
}));

vi.mock("../../src/utils/logger.js", () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock the provider classes using real classes so `new` works
const mockAnthropicChat = vi.fn();
const mockOpenAIChat = vi.fn();

vi.mock("../../src/agent/providers/anthropic.js", () => {
    class MockAnthropicProvider {
        name = "anthropic";
        chat = mockAnthropicChat;
    }
    return { AnthropicProvider: MockAnthropicProvider };
});

vi.mock("../../src/agent/providers/openai.js", () => {
    class MockOpenAIProvider {
        name = "openai";
        chat = mockOpenAIChat;
    }
    return { OpenAIProvider: MockOpenAIProvider };
});

import { ProviderManager } from "../agent/providers/provider-manager.js";
import { providerKeyService } from "../agent/providers/provider-key-service.js";

const BASE_PARAMS = {
    model: "claude-sonnet-4-20250514",
    tenantId: "tenant-1",
    systemPrompt: "You are helpful.",
    messages: [{ role: "user" as const, content: "Hello" }],
};

describe("Provider Fallback Chain", () => {
    let manager: ProviderManager;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new ProviderManager();
        (providerKeyService.resolveKey as any).mockResolvedValue({ key: "sk-test-key", authMethod: "api_key" });
    });

    it("should use primary provider when it succeeds", async () => {
        mockAnthropicChat.mockResolvedValue({
            content: "Hello!",
            usage: { inputTokens: 10, outputTokens: 5 },
        });

        const result = await manager.chat(BASE_PARAMS);

        expect(result.provider).toBe("anthropic");
        expect(result.wasFallback).toBe(false);
        expect(result.content).toBe("Hello!");
        expect(mockOpenAIChat).not.toHaveBeenCalled();
    });

    it("should fallback to OpenAI when Anthropic fails", async () => {
        mockAnthropicChat.mockRejectedValue(new Error("API rate limited"));
        mockOpenAIChat.mockResolvedValue({
            content: "Fallback response",
            usage: { inputTokens: 10, outputTokens: 5 },
        });

        const result = await manager.chat(BASE_PARAMS);

        expect(result.provider).toBe("openai");
        expect(result.wasFallback).toBe(true);
        expect(result.content).toBe("Fallback response");
    });

    it("should throw when both providers fail", async () => {
        mockAnthropicChat.mockRejectedValue(new Error("Anthropic down"));
        mockOpenAIChat.mockRejectedValue(new Error("OpenAI down"));

        await expect(manager.chat(BASE_PARAMS)).rejects.toThrow("All LLM providers failed");
    });

    it("should include both error messages when both fail", async () => {
        mockAnthropicChat.mockRejectedValue(new Error("Anthropic error"));
        mockOpenAIChat.mockRejectedValue(new Error("OpenAI error"));

        try {
            await manager.chat(BASE_PARAMS);
            expect.fail("Should have thrown");
        } catch (err: any) {
            expect(err.message).toContain("Anthropic error");
            expect(err.message).toContain("OpenAI error");
        }
    });

    it("should throw when primary fails and no fallback exists (Google model)", async () => {
        // Google models have no fallback mapping
        const googleParams = { ...BASE_PARAMS, model: "gemini-2.0-flash" };

        // Mock resolveKey for google provider too
        (providerKeyService.resolveKey as any).mockResolvedValue({ key: "google-key", authMethod: "api_key" });

        // The primary provider instance will be anthropic (default fallback)
        // but getProviderByModel for gemini-2.0-flash returns google which falls through to default anthropic
        mockAnthropicChat.mockRejectedValue(new Error("No google support"));

        await expect(manager.chat(googleParams)).rejects.toThrow("no fallback available");
    });

    it("should pass correct model to fallback provider", async () => {
        mockAnthropicChat.mockRejectedValue(new Error("Failed"));
        mockOpenAIChat.mockResolvedValue({
            content: "OK",
            usage: { inputTokens: 10, outputTokens: 5 },
        });

        const result = await manager.chat(BASE_PARAMS);

        // claude-sonnet-4-20250514 should fallback to gpt-4o
        expect(result.canonicalModel).toBe("gpt-4o");
    });

    it("should return correct pricing for known models", () => {
        const pricing = manager.getPricing("claude-sonnet-4-20250514", "anthropic");
        expect(pricing.input).toBe(3.0);
        expect(pricing.output).toBe(15.0);
    });
});
