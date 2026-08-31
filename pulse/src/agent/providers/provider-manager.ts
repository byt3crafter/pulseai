import { AnthropicProvider, ProviderResponse, StreamCallbacks, ProviderAttachment } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { CodexAppServerProvider } from "./codex-app-server.js";
import { providerKeyService } from "./provider-key-service.js";
import { getModelById, getProviderByModel, getProviderById, getFallbackModelId, getDefaultModel } from "./model-registry.js";
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
    private codex = new CodexAppServerProvider();

    async chat(params: {
        model: string;
        tenantId: string;
        agentProfileId?: string;
        conversationId?: string;
        onProgress?: (text: string) => void;
        progressVerbosity?: string;
        systemPrompt: string;
        messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
        tools?: Array<{
            name: string;
            description: string;
            input_schema: any;
        }>;
        stream?: StreamCallbacks;
        /** Images attached to the current inbound message (e.g. a Telegram photo). */
        attachments?: ProviderAttachment[];
        /** Per-agent reasoning effort override (e.g. Codex/GPT-5.5). Undefined = provider default. */
        reasoningEffort?: string;
        /**
         * An explicit, ordered list of model ids to fall through on failure —
         * a model GROUP resolved for this turn. When present it REPLACES the
         * hardcoded model->model fallback map: the models tried are exactly what
         * the customer configured, nothing hardcoded. `params.model` is the lead
         * (chain[0]); the rest are the fallbacks.
         */
        fallbackChain?: string[];
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
        const baseURL = this.getBaseURL(providerId);

        const attemptPrimary = () => primaryProvider.chat({
            model: params.model,
            tenantId: params.tenantId,
            agentProfileId: params.agentProfileId,
            conversationId: params.conversationId,
            onProgress: params.onProgress,
            progressVerbosity: params.progressVerbosity,
            systemPrompt: params.systemPrompt,
            messages: params.messages,
            tenantApiKey: apiKey,
            authMethod,
            tools: params.tools,
            stream: params.stream,
            baseURL,
            attachments: params.attachments,
            reasoningEffort: params.reasoningEffort,
        });
        const primaryResult = (response: any) => ({ ...response, provider: primaryProvider.name, canonicalModel: params.model, wasFallback: false });

        try {
            logger.debug({ provider: providerId, model: params.model }, "Attempting primary provider");
            return primaryResult(await attemptPrimary());
        } catch (err: any) {
            // Retry the SAME provider once on a transient/malformed-response failure
            // before falling back — MiniMax (and others) occasionally return
            // truncated or invalid JSON on large tool turns, which usually
            // succeeds on a second attempt. Auth/quota errors skip the retry.
            const tmsg = String(err?.message || "").toLowerCase();
            const retryable = /json|unterminated|unexpected token|unexpected end|malformed|\bparse\b|econnreset|etimedout|timeout|fetch failed|socket hang|502|503|504|overloaded/.test(tmsg);
            if (retryable) {
                try {
                    logger.warn({ err: err.message, provider: providerId, model: params.model }, "Primary provider transient failure — retrying once");
                    return primaryResult(await attemptPrimary());
                } catch (retryErr: any) {
                    err = retryErr;
                }
            }
            logger.warn(
                {
                    err: { message: err.message, status: err.status, type: err.type, code: err.code },
                    provider: providerId,
                    model: params.model,
                    authMethod,
                },
                "Primary provider failed, attempting fallback"
            );

            /*
             * Fallback candidates, in order.
             *
             * A configured group (`fallbackChain`) is authoritative and replaces
             * the hardcoded model->model map: the fallbacks are exactly the
             * models the customer put in the group, after the one that just
             * failed. With no group we keep the old single hardcoded fallback,
             * so existing agents behave exactly as before.
             */
            const chain = (params.fallbackChain && params.fallbackChain.length > 0)
                ? params.fallbackChain.filter((m) => m && m !== params.model)
                : (getFallbackModelId(params.model) ? [getFallbackModelId(params.model)!] : []);

            if (chain.length === 0) {
                throw new Error(`Primary provider (${providerId}) failed and no fallback available: ${err.message}`);
            }

            const failures: string[] = [`${params.model}: ${err.message}`];
            for (const candidateModel of chain) {
                const candProvider = getProviderByModel(candidateModel);
                if (!candProvider) continue;
                try {
                    const resolved = await providerKeyService.resolveKey(params.tenantId, candProvider.id);
                    const instance = this.getProviderInstance(candProvider.id);
                    logger.info(
                        { originalModel: params.model, fallbackModel: candidateModel, fallbackProvider: candProvider.id },
                        "Using fallback model from group/chain"
                    );
                    const response = await instance.chat({
                        ...params,
                        model: candidateModel,
                        tenantApiKey: resolved?.key,
                        authMethod: resolved?.authMethod,
                        baseURL: this.getBaseURL(candProvider.id),
                    });
                    return { ...response, provider: instance.name, canonicalModel: candidateModel, wasFallback: true };
                } catch (fallbackErr: any) {
                    failures.push(`${candidateModel}: ${fallbackErr.message}`);
                    // keep walking the chain — the next model may be up
                }
            }

            logger.error({ failures }, "Every model in the group failed");
            throw new Error(`All models failed. ${failures.join(" | ")}`);
        }
    }

    private getProviderInstance(providerId: string): AnthropicProvider | OpenAIProvider | CodexAppServerProvider {
        switch (providerId) {
            case "openai":
            case "openrouter":
            case "minimax": // MiniMax and OpenRouter use OpenAI-compatible APIs
            case "google":  // Gemini via its OpenAI-compatible endpoint
            case "groq":    // Groq (free) via its OpenAI-compatible endpoint
                return this.openai;
            case "codex":
                // Runs on the host machine's ChatGPT/Codex subscription login
                // (no API key) via a local `codex app-server` subprocess.
                return this.codex;
            case "anthropic":
            default:
                return this.anthropic;
        }
    }

    /**
     * The API endpoint for an OpenAI-compatible provider.
     *
     * No hardcoded switch: the default comes from the provider registry
     * (single source of truth), and a deployment can override it per provider
     * with `${ENVKEY_PREFIX}_BASE_URL` — e.g. MINIMAX_BASE_URL — so MiniMax can
     * be pointed at another region without touching code. Anthropic and any
     * provider with no apiBase return undefined and use their SDK default.
     */
    private getBaseURL(providerId: string): string | undefined {
        const def = getProviderById(providerId);
        // Env override keys off the provider's own env-key prefix (MINIMAX_API_KEY
        // -> MINIMAX_BASE_URL), so it stays consistent with how keys are named.
        const prefix = (def?.envKeyName || `${providerId.toUpperCase()}_API_KEY`).replace(/_API_KEY$/, "");
        const override = process.env[`${prefix}_BASE_URL`];
        if (override && override.trim()) return override.trim();
        return def?.apiBase;
    }

    /**
     * Get pricing from DB (with hardcoded fallback) for cost tracking.
     * Returns both base (real) and customer (markup) pricing.
     */
    async getPricing(model: string, provider: string): Promise<ResolvedPricing> {
        return getModelPricing(model);
    }
}
