import { AnthropicProvider, ProviderResponse } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { logger } from "../../utils/logger.js";

/**
 * Provider Manager - Handles LLM provider selection and fallback
 *
 * Strategy:
 * 1. Try Anthropic (primary provider)
 * 2. On failure, fallback to OpenAI
 * 3. Log all provider switches for monitoring
 */
export class ProviderManager {
    private primary = new AnthropicProvider();
    private fallback = new OpenAIProvider();

    async chat(params: {
        model: string;
        systemPrompt: string;
        messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
        tenantApiKey?: string;
        tools?: Array<{
            name: string;
            description: string;
            input_schema: any;
        }>;
    }): Promise<ProviderResponse & { provider: string }> {
        try {
            logger.debug("Attempting primary provider (Anthropic)");
            const response = await this.primary.chat(params);
            return {
                ...response,
                provider: this.primary.name,
            };
        } catch (err: any) {
            logger.warn(
                {
                    err: {
                        message: err.message,
                        status: err.status,
                        type: err.type,
                    },
                },
                "Primary provider (Anthropic) failed, falling back to OpenAI"
            );

            try {
                // Map Anthropic model to OpenAI equivalent
                const openAIModel = this.mapModelToOpenAI(params.model);

                logger.info(
                    { originalModel: params.model, fallbackModel: openAIModel },
                    "Using OpenAI fallback provider"
                );

                const response = await this.fallback.chat({
                    ...params,
                    model: openAIModel,
                });

                return {
                    ...response,
                    provider: this.fallback.name,
                };
            } catch (fallbackErr: any) {
                logger.error(
                    {
                        primaryErr: err.message,
                        fallbackErr: fallbackErr.message,
                    },
                    "Both primary and fallback providers failed"
                );
                throw new Error(
                    `All LLM providers failed. Primary: ${err.message}, Fallback: ${fallbackErr.message}`
                );
            }
        }
    }

    /**
     * Map Anthropic models to OpenAI equivalents
     * Ensures comparable quality when falling back
     */
    private mapModelToOpenAI(anthropicModel: string): string {
        const mapping: Record<string, string> = {
            "claude-3-7-sonnet-20250219": "gpt-4o",
            "claude-3-5-sonnet-20241022": "gpt-4o",
            "claude-3-opus-20240229": "gpt-4o",
            "claude-3-haiku-20240307": "gpt-4o-mini",
        };

        return mapping[anthropicModel] || "gpt-4o";
    }

    /**
     * Get pricing for cost tracking
     * Returns pricing in USD per million tokens
     */
    getPricing(model: string, provider: string): { input: number; output: number } {
        if (provider === "anthropic") {
            const anthropicPricing: Record<string, { input: number; output: number }> = {
                "claude-3-7-sonnet-20250219": { input: 3.0, output: 15.0 },
                "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
                "claude-3-opus-20240229": { input: 15.0, output: 75.0 },
                "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
            };
            return anthropicPricing[model] || { input: 3.0, output: 15.0 };
        } else if (provider === "openai") {
            const openAIPricing: Record<string, { input: number; output: number }> = {
                "gpt-4o": { input: 2.5, output: 10.0 },
                "gpt-4o-mini": { input: 0.15, output: 0.6 },
                "gpt-4-turbo": { input: 10.0, output: 30.0 },
            };
            return openAIPricing[model] || { input: 2.5, output: 10.0 };
        }

        // Default fallback pricing
        return { input: 3.0, output: 15.0 };
    }
}
