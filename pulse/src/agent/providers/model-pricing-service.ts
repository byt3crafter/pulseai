/**
 * Model Pricing Service — DB-backed pricing with hardcoded fallback.
 *
 * Pricing resolution:
 *   1. Check model_pricing table in DB
 *   2. Fall back to hardcoded model-registry.ts
 *   3. Last resort: generic $3/$15 per million
 */

import { db } from "../../storage/db.js";
import { modelPricing } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { getModelById } from "./model-registry.js";
import { logger } from "../../utils/logger.js";

export interface ResolvedPricing {
    baseInput: number;      // Real provider cost per 1M input tokens
    baseOutput: number;     // Real provider cost per 1M output tokens
    customerInput: number;  // What we charge per 1M input tokens
    customerOutput: number; // What we charge per 1M output tokens
}

// In-memory cache to avoid DB hits on every message
let pricingCache: Map<string, ResolvedPricing> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getModelPricing(modelId: string): Promise<ResolvedPricing> {
    // Try cache first
    if (pricingCache && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
        const cached = pricingCache.get(modelId);
        if (cached) return cached;
    }

    // Try DB
    try {
        const row = await db.query.modelPricing.findFirst({
            where: and(
                eq(modelPricing.modelId, modelId),
                eq(modelPricing.isActive, true),
            ),
        });

        if (row) {
            const pricing: ResolvedPricing = {
                baseInput: parseFloat(row.baseInputPerMillion as string),
                baseOutput: parseFloat(row.baseOutputPerMillion as string),
                customerInput: parseFloat(row.customerInputPerMillion as string),
                customerOutput: parseFloat(row.customerOutputPerMillion as string),
            };
            // Warm cache entry
            if (!pricingCache) pricingCache = new Map();
            pricingCache.set(modelId, pricing);
            return pricing;
        }
    } catch (err) {
        logger.warn({ err, modelId }, "Failed to query model_pricing table, using fallback");
    }

    // Fall back to hardcoded registry
    const registryModel = getModelById(modelId);
    if (registryModel) {
        return {
            baseInput: registryModel.pricing.inputPerMillion,
            baseOutput: registryModel.pricing.outputPerMillion,
            customerInput: registryModel.pricing.inputPerMillion,
            customerOutput: registryModel.pricing.outputPerMillion,
        };
    }

    // Last resort
    return { baseInput: 3.0, baseOutput: 15.0, customerInput: 3.0, customerOutput: 15.0 };
}

/** Invalidate pricing cache (called after admin updates pricing) */
export function invalidatePricingCache(): void {
    pricingCache = null;
    cacheTimestamp = 0;
}

/** Reload full pricing cache from DB */
export async function warmPricingCache(): Promise<void> {
    try {
        const rows = await db.select().from(modelPricing).where(eq(modelPricing.isActive, true));
        const cache = new Map<string, ResolvedPricing>();
        for (const row of rows) {
            cache.set(row.modelId, {
                baseInput: parseFloat(row.baseInputPerMillion as string),
                baseOutput: parseFloat(row.baseOutputPerMillion as string),
                customerInput: parseFloat(row.customerInputPerMillion as string),
                customerOutput: parseFloat(row.customerOutputPerMillion as string),
            });
        }
        pricingCache = cache;
        cacheTimestamp = Date.now();
        logger.info({ modelCount: rows.length }, "Model pricing cache warmed");
    } catch (err) {
        logger.warn({ err }, "Failed to warm pricing cache");
    }
}

/** Get all active model pricing entries for admin UI */
export async function getAllModelPricing(): Promise<Array<{
    id: string;
    provider: string;
    modelId: string;
    displayName: string;
    category: string;
    baseInputPerMillion: number;
    baseOutputPerMillion: number;
    customerInputPerMillion: number;
    customerOutputPerMillion: number;
    maxTokens: number;
    isActive: boolean;
}>> {
    const rows = await db.select().from(modelPricing);
    return rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        modelId: r.modelId,
        displayName: r.displayName,
        category: r.category,
        baseInputPerMillion: parseFloat(r.baseInputPerMillion as string),
        baseOutputPerMillion: parseFloat(r.baseOutputPerMillion as string),
        customerInputPerMillion: parseFloat(r.customerInputPerMillion as string),
        customerOutputPerMillion: parseFloat(r.customerOutputPerMillion as string),
        maxTokens: r.maxTokens,
        isActive: r.isActive,
    }));
}
