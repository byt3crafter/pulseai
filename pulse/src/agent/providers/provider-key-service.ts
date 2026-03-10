/**
 * Provider Key Service — Manages BYOK keys with 3-tier hierarchy:
 *  1. Tenant-specific BYOK key (encrypted in DB)
 *  2. Global admin-configured key (from global_settings)
 *  3. Environment variable fallback
 */

import { db } from "../../storage/db.js";
import { tenantProviderKeys, globalSettings } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "../../utils/crypto.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";
import { getProviderById } from "./model-registry.js";

export interface KeyMetadata {
    provider: string;
    authMethod: string;
    keyAlias: string | null;
    isActive: boolean | null;
    lastValidatedAt: Date | null;
}

export class ProviderKeyService {
    /**
     * Resolve the API key for a provider using 3-tier hierarchy:
     * 1. Tenant BYOK -> 2. Global admin DB key -> 3. Env var
     * Returns both the key and its auth method for proper header selection.
     */
    async resolveKey(tenantId: string, provider: string): Promise<{ key: string; authMethod: string } | undefined> {
        // Tier 1: Tenant-specific BYOK key
        const tenantKey = await db.query.tenantProviderKeys.findFirst({
            where: and(
                eq(tenantProviderKeys.tenantId, tenantId),
                eq(tenantProviderKeys.provider, provider),
                eq(tenantProviderKeys.isActive, true)
            ),
        });

        if (tenantKey?.encryptedApiKey) {
            try {
                const decrypted = decrypt(tenantKey.encryptedApiKey);
                if (decrypted) {
                    logger.debug({ tenantId, provider }, "Using tenant BYOK key");
                    return { key: decrypted, authMethod: tenantKey.authMethod };
                }
            } catch (err) {
                logger.warn({ tenantId, provider, err }, "Failed to decrypt tenant BYOK key");
            }
        }

        // Tier 2: Global admin-configured key from global_settings
        const rootSettings = await db.query.globalSettings.findFirst({
            where: eq(globalSettings.id, "root"),
        });

        if (rootSettings) {
            const providerConfig = (rootSettings as any).config ?? {};
            const globalKeyMap: Record<string, string | null | undefined> = {
                anthropic: rootSettings.anthropicApiKeyHash,
                openai: rootSettings.openaiApiKeyHash,
                google: providerConfig.googleApiKey,
                openrouter: providerConfig.openrouterApiKey,
                minimax: providerConfig.minimaxApiKey,
            };
            const globalKey = globalKeyMap[provider];
            if (globalKey) {
                logger.debug({ tenantId, provider }, "Using global admin DB key");
                return { key: globalKey, authMethod: "api_key" };
            }
        }

        // Tier 3: Environment variable fallback
        const providerDef = getProviderById(provider);
        if (providerDef?.envKeyName) {
            const envKey = (config as any)[providerDef.envKeyName];
            if (envKey) {
                logger.debug({ tenantId, provider }, "Using environment variable key");
                return { key: envKey, authMethod: "api_key" };
            }
        }

        logger.warn({ tenantId, provider }, "No API key found in any tier");
        return undefined;
    }

    /**
     * Upsert a BYOK key for a tenant + provider
     */
    async upsertKey(
        tenantId: string,
        provider: string,
        authMethod: "api_key" | "oauth" | "setup_token",
        credentials: { apiKey?: string; alias?: string }
    ): Promise<void> {
        const encryptedApiKey = credentials.apiKey ? encrypt(credentials.apiKey) : undefined;

        const existing = await db.query.tenantProviderKeys.findFirst({
            where: and(
                eq(tenantProviderKeys.tenantId, tenantId),
                eq(tenantProviderKeys.provider, provider)
            ),
        });

        if (existing) {
            await db.update(tenantProviderKeys)
                .set({
                    authMethod,
                    encryptedApiKey: encryptedApiKey ?? existing.encryptedApiKey,
                    keyAlias: credentials.alias ?? existing.keyAlias,
                    isActive: true,
                    updatedAt: new Date(),
                })
                .where(eq(tenantProviderKeys.id, existing.id));
        } else {
            await db.insert(tenantProviderKeys).values({
                tenantId,
                provider,
                authMethod,
                encryptedApiKey,
                keyAlias: credentials.alias ?? null,
                isActive: true,
            });
        }

        logger.info({ tenantId, provider, authMethod }, "Provider key upserted");
    }

    /**
     * Remove (deactivate) a provider key for a tenant
     */
    async removeKey(tenantId: string, provider: string): Promise<void> {
        await db.delete(tenantProviderKeys)
            .where(
                and(
                    eq(tenantProviderKeys.tenantId, tenantId),
                    eq(tenantProviderKeys.provider, provider)
                )
            );

        logger.info({ tenantId, provider }, "Provider key removed");
    }

    /**
     * Get metadata about all provider keys for a tenant (never returns raw keys)
     */
    async getKeyMetadata(tenantId: string): Promise<KeyMetadata[]> {
        const keys = await db.select({
            provider: tenantProviderKeys.provider,
            authMethod: tenantProviderKeys.authMethod,
            keyAlias: tenantProviderKeys.keyAlias,
            isActive: tenantProviderKeys.isActive,
            lastValidatedAt: tenantProviderKeys.lastValidatedAt,
        })
            .from(tenantProviderKeys)
            .where(eq(tenantProviderKeys.tenantId, tenantId));

        return keys;
    }

    /**
     * Lightweight validation — attempts a minimal API call to verify the key works
     */
    async validateKey(provider: string, apiKey: string, authMethod: string = "api_key"): Promise<{ valid: boolean; error?: string }> {
        try {
            switch (provider) {
                case "anthropic": {
                    const headers: Record<string, string> = {
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    };
                    if (authMethod === "setup_token") {
                        headers["Authorization"] = `Bearer ${apiKey}`;
                    } else {
                        headers["x-api-key"] = apiKey;
                    }
                    const res = await fetch("https://api.anthropic.com/v1/messages", {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            model: "claude-sonnet-4-20250514",
                            max_tokens: 1,
                            messages: [{ role: "user", content: "hi" }],
                        }),
                    });
                    if (res.status === 401) {
                        return { valid: false, error: authMethod === "setup_token" ? "Invalid setup token" : "Invalid API key" };
                    }
                    if (res.status === 403) {
                        if (authMethod === "setup_token") {
                            return { valid: false, error: "Token authenticated but access denied. Your subscription may not cover this model." };
                        }
                        return { valid: false, error: "Invalid API key" };
                    }
                    // 200 or 400 (bad request) means the key itself is valid
                    return { valid: true };
                }
                case "openai": {
                    const res = await fetch("https://api.openai.com/v1/models", {
                        headers: { Authorization: `Bearer ${apiKey}` },
                    });
                    if (res.status === 401) {
                        return { valid: false, error: "Invalid API key" };
                    }
                    return { valid: true };
                }
                case "google": {
                    const res = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
                    );
                    if (res.status === 400 || res.status === 403) {
                        return { valid: false, error: "Invalid API key" };
                    }
                    return { valid: true };
                }
                case "openrouter": {
                    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
                        headers: { Authorization: `Bearer ${apiKey}` },
                    });
                    if (res.status === 401) {
                        return { valid: false, error: "Invalid API key" };
                    }
                    return { valid: true };
                }
                case "minimax": {
                    const res = await fetch("https://api.minimax.io/v1/models", {
                        headers: { Authorization: `Bearer ${apiKey}` },
                    });
                    if (res.status === 401 || res.status === 403) {
                        return { valid: false, error: "Invalid API key" };
                    }
                    return { valid: true };
                }
                default:
                    return { valid: false, error: `Unknown provider: ${provider}` };
            }
        } catch (err: any) {
            return { valid: false, error: err.message || "Validation request failed" };
        }
    }
}

export const providerKeyService = new ProviderKeyService();
