import { describe, it, expect } from "vitest";
import { ProviderManager } from "../../src/agent/providers/provider-manager.js";

describe("ProviderManager Billing & Failover", () => {

    it("Calculates Anthropic Claude 3.7 Cost Correctly", () => {
        const manager = new ProviderManager();
        const pricing = manager.getPricing("claude-3-7-sonnet-20250219", "anthropic");

        expect(pricing.input).toBe(3.0);
        expect(pricing.output).toBe(15.0);

        // Simulating 10,000 input tokens and 1,000 output tokens
        const costUsd = (10000 * pricing.input) / 1000000 + (1000 * pricing.output) / 1000000;
        expect(costUsd).toBe(0.045); // $0.03 + $0.015
    });

    it("Calculates OpenAI GPT-4o Fallback Cost Correctly", () => {
        const manager = new ProviderManager();
        const pricing = manager.getPricing("gpt-4o", "openai");

        expect(pricing.input).toBe(2.5);
        expect(pricing.output).toBe(10.0);

        // Simulating 10,000 input tokens and 1,000 output tokens
        const costUsd = (10000 * pricing.input) / 1000000 + (1000 * pricing.output) / 1000000;
        expect(costUsd).toBe(0.035); // $0.025 + $0.010
    });

    it("Safely Defaults Pricing for Unknown Models", () => {
        const manager = new ProviderManager();
        const pricing = manager.getPricing("unknown-model", "unknown-provider");

        // Should default to 3.0 / 15.0 safety net
        expect(pricing.input).toBe(3.0);
        expect(pricing.output).toBe(15.0);
    });
});
