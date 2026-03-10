/**
 * Admin Models API — CRUD for model pricing + provider model discovery.
 *
 * POST /api/admin/models/discover  — Pull models from provider API
 * GET  /api/admin/models/pricing   — List all model pricing entries
 * POST /api/admin/models/pricing   — Upsert model pricing
 * POST /api/admin/models/pricing/delete — Delete a model pricing entry
 */

import { FastifyPluginAsync } from "fastify";
import { db } from "../../storage/db.js";
import { modelPricing } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { discoverModels, DiscoveredModel } from "../../agent/providers/model-discovery.js";
import { invalidatePricingCache, getAllModelPricing } from "../../agent/providers/model-pricing-service.js";
import { providerKeyService } from "../../agent/providers/provider-key-service.js";
import { logger } from "../../utils/logger.js";

export const adminModelsRoutes: FastifyPluginAsync = async (fastify) => {
    // Simple auth check (reuse existing pattern)
    const adminAuth = async (request: any, reply: any) => {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            reply.code(401).send({ error: "Authentication required" });
            return;
        }
    };

    // GET /api/admin/models/pricing — list all
    fastify.get("/api/admin/models/pricing", { preHandler: adminAuth }, async (request, reply) => {
        const models = await getAllModelPricing();
        return reply.send({ models });
    });

    // POST /api/admin/models/discover — auto-pull models from provider API
    fastify.post("/api/admin/models/discover", { preHandler: adminAuth }, async (request, reply) => {
        const { provider, apiKey } = request.body as { provider: string; apiKey?: string };

        if (!provider) {
            return reply.code(400).send({ error: "provider is required" });
        }

        // Use provided key or try to resolve from global/env
        let key = apiKey;
        if (!key) {
            // Use a dummy tenant ID to resolve global key
            const resolved = await providerKeyService.resolveKey("00000000-0000-0000-0000-000000000000", provider);
            key = resolved?.key;
        }

        if (!key) {
            return reply.code(400).send({ error: `No API key available for ${provider}. Provide one or configure a global key.` });
        }

        const discovered = await discoverModels(provider, key);

        if (discovered.length === 0) {
            return reply.send({ models: [], message: "No models discovered. Check API key and provider." });
        }

        // Upsert discovered models into DB (preserve existing customer pricing if set)
        let inserted = 0;
        let updated = 0;

        for (const model of discovered) {
            const existing = await db.query.modelPricing.findFirst({
                where: and(
                    eq(modelPricing.provider, model.provider),
                    eq(modelPricing.modelId, model.modelId),
                ),
            });

            if (existing) {
                // Update base pricing but preserve customer pricing
                await db.update(modelPricing)
                    .set({
                        displayName: model.displayName,
                        category: model.category,
                        baseInputPerMillion: model.baseInputPerMillion.toString(),
                        baseOutputPerMillion: model.baseOutputPerMillion.toString(),
                        maxTokens: model.maxTokens,
                        updatedAt: new Date(),
                    })
                    .where(eq(modelPricing.id, existing.id));
                updated++;
            } else {
                await db.insert(modelPricing).values({
                    provider: model.provider,
                    modelId: model.modelId,
                    displayName: model.displayName,
                    category: model.category,
                    baseInputPerMillion: model.baseInputPerMillion.toString(),
                    baseOutputPerMillion: model.baseOutputPerMillion.toString(),
                    customerInputPerMillion: model.baseInputPerMillion.toString(),
                    customerOutputPerMillion: model.baseOutputPerMillion.toString(),
                    maxTokens: model.maxTokens,
                });
                inserted++;
            }
        }

        invalidatePricingCache();

        logger.info({ provider, discovered: discovered.length, inserted, updated }, "Model discovery completed");

        return reply.send({
            models: discovered,
            inserted,
            updated,
            message: `Discovered ${discovered.length} models. ${inserted} new, ${updated} updated.`,
        });
    });

    // POST /api/admin/models/pricing — upsert single model pricing
    fastify.post("/api/admin/models/pricing", { preHandler: adminAuth }, async (request, reply) => {
        const body = request.body as {
            provider: string;
            modelId: string;
            displayName: string;
            category?: string;
            baseInputPerMillion: number;
            baseOutputPerMillion: number;
            customerInputPerMillion: number;
            customerOutputPerMillion: number;
            maxTokens?: number;
            isActive?: boolean;
        };

        if (!body.provider || !body.modelId || !body.displayName) {
            return reply.code(400).send({ error: "provider, modelId, and displayName are required" });
        }

        await db.insert(modelPricing)
            .values({
                provider: body.provider,
                modelId: body.modelId,
                displayName: body.displayName,
                category: body.category || "flagship",
                baseInputPerMillion: body.baseInputPerMillion.toString(),
                baseOutputPerMillion: body.baseOutputPerMillion.toString(),
                customerInputPerMillion: body.customerInputPerMillion.toString(),
                customerOutputPerMillion: body.customerOutputPerMillion.toString(),
                maxTokens: body.maxTokens || 8192,
                isActive: body.isActive ?? true,
            })
            .onConflictDoUpdate({
                target: [modelPricing.provider, modelPricing.modelId],
                set: {
                    displayName: body.displayName,
                    category: body.category || "flagship",
                    baseInputPerMillion: body.baseInputPerMillion.toString(),
                    baseOutputPerMillion: body.baseOutputPerMillion.toString(),
                    customerInputPerMillion: body.customerInputPerMillion.toString(),
                    customerOutputPerMillion: body.customerOutputPerMillion.toString(),
                    maxTokens: body.maxTokens || 8192,
                    isActive: body.isActive ?? true,
                    updatedAt: new Date(),
                },
            });

        invalidatePricingCache();

        return reply.send({ success: true });
    });

    // POST /api/admin/models/pricing/delete — delete a model
    fastify.post("/api/admin/models/pricing/delete", { preHandler: adminAuth }, async (request, reply) => {
        const { id } = request.body as { id: string };
        if (!id) return reply.code(400).send({ error: "id is required" });

        await db.delete(modelPricing).where(eq(modelPricing.id, id));
        invalidatePricingCache();

        return reply.send({ success: true });
    });
};
