import { AnthropicProvider, ProviderResponse, StreamCallbacks } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { providerKeyService } from "./provider-key-service.js";
import { getModelById, getProviderByModel, getFallbackModelId, getDefaultModel } from "./model-registry.js";
import { getModelPricing, ResolvedPricing } from "./model-pricing-service.js";
import { logger } from "../../utils/logger.js";

/**
 * Provider Manager - Dynamic LLM provider selection and fallback
 *
 * Strategy:
 * 1. Route to correct provider based on model ID
 * 2. Resolve API key via ProviderKeyService (tenant BYOK -> global -> env)
 * 3. On failure, fallback to alternative provider
 */
export class ProviderManager {
    private anthropic = new AnthropicProvider();
    private openai = new OpenAIProvider();

    async chat(params: {
        model: string;
        tenantId: string;
        systemPrompt: string;
        messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
        tools?: Array<{
            name: string;
            description: string;
            input_schema: any;
        }>;
        stream?: StreamCallbacks;
    }): Promise<ProviderResponse & { provider: string; canonicalModel: string; wasFallback: boolean }> {
        const modelDef = getModelById(params.model);
        const providerDef = getProviderByModel(params.model);
        const providerId = providerDef?.id ?? "anthropic";

        // Resolve API key for the primary provider
        const resolved = await providerKeyService.resolveKey(params.tenantId, providerId);
        const apiKey = resolved?.key;
        const authMethod = resolved?.authMethod;

        logger.debug(
            {
                provider: providerId,
                model: params.model,
                hasKey: !!apiKey,
                authMethod,
                keyPrefix: apiKey ? apiKey.substring(0, 8) + "..." : "none",
            },
            "Provider key resolved for primary"
        );

        const primaryProvider = this.getProviderInstance(providerId);

        try {
            logger.debug({ provider: providerId, model: params.model }, "Attempting primary provider");
            const response = await primaryProvider.chat({
                model: params.model,
                systemPrompt: params.systemPrompt,
                messages: params.messages,
                tenantApiKey: apiKey,
                authMethod,
                tools: params.tools,
                stream: params.stream,
            });
            return {
                ...response,
                provider: primaryProvider.name,
                canonicalModel: params.model,
                wasFallback: false,
            };
        } catch (err: any) {
            logger.warn(
                {
                    err: { message: err.message, status: err.status, type: err.type, code: err.code },
                    provider: providerId,
                    model: params.model,
                    authMethod,
                },
                "Primary provider failed, attempting fallback"
            );

            // Try fallback provider
            const fallbackModelId = getFallbackModelId(params.model);
            if (!fallbackModelId) {
                throw new Error(`Primary provider (${providerId}) failed and no fallback available: ${err.message}`);
            }

            const fallbackProvider = getProviderByModel(fallbackModelId);
            if (!fallbackProvider || fallbackProvider.id === providerId) {
                throw new Error(`Primary provider (${providerId}) failed: ${err.message}`);
            }

            const fallbackResolved = await providerKeyService.resolveKey(params.tenantId, fallbackProvider.id);
            const fallbackInstance = this.getProviderInstance(fallbackProvider.id);

            logger.debug(
                {
                    fallbackProvider: fallbackProvider.id,
                    fallbackModel: fallbackModelId,
                    hasKey: !!fallbackResolved?.key,
                    authMethod: fallbackResolved?.authMethod,
                },
                "Fallback provider key resolved"
            );

            try {
                logger.info(
                    { originalModel: params.model, fallbackModel: fallbackModelId, fallbackProvider: fallbackProvider.id },
                    "Using fallback provider"
                );

                const response = await fallbackInstance.chat({
                    ...params,
                    model: fallbackModelId,
                    tenantApiKey: fallbackResolved?.key,
                    authMethod: fallbackResolved?.authMethod,
                });

                return {
                    ...response,
                    provider: fallbackInstance.name,
                    canonicalModel: fallbackModelId,
                    wasFallback: true,
                };
            } catch (fallbackErr: any) {
                logger.error(
                    { primaryErr: err.message, fallbackErr: fallbackErr.message },
                    "Both primary and fallback providers failed"
                );
                throw new Error(
                    `All LLM providers failed. Primary (${providerId}): ${err.message}, Fallback (${fallbackProvider.id}): ${fallbackErr.message}`
                );
            }
        }
    }

    private getProviderInstance(providerId: string): AnthropicProvider | OpenAIProvider {
        switch (providerId) {
            case "openai":
                return this.openai;
            case "anthropic":
            default:
                return this.anthropic;
        }
    }

    /**
     * Get pricing from DB (with hardcoded fallback) for cost tracking.
     * Returns both base (real) and customer (markup) pricing.
     */
    async getPricing(model: string, provider: string): Promise<ResolvedPricing> {
        return getModelPricing(model);
    }
}
