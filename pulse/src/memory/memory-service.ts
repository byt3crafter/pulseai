/**
 * Memory Service — main entry point for agent memory operations.
 * Supports store, search (hybrid vector+FTS), forget, and context retrieval.
 */

import { db } from "../storage/db.js";
import { memoryEntries, tenantProviderKeys, tenants } from "../storage/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { generateEmbedding, type EmbeddingConfig } from "./embedding.js";
import { hybridSearch, HybridResult } from "./hybrid-search.js";
import { applyTemporalDecay } from "./temporal-decay.js";
import { applyMMR } from "./mmr.js";
import { decrypt } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";

// Resolve a tenant's embedding provider config (provider + key + MiniMax groupId)
// from tenants.config.embedding. Cached briefly to avoid a DB hit per memory op.
// Default provider is OpenAI (key from the "openai_embeddings" provider row, or
// the operator OPENAI_API_KEY fallback inside generateEmbedding).
const embCfgCache = new Map<string, { cfg: EmbeddingConfig; exp: number }>();
async function resolveEmbeddingConfig(tenantId: string): Promise<EmbeddingConfig> {
    const cached = embCfgCache.get(tenantId);
    const now = Date.now();
    if (cached && cached.exp > now) return cached.cfg;

    let cfg: EmbeddingConfig = { provider: "openai", apiKey: null };
    try {
        const [t] = await db.select({ config: tenants.config }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        const emb = (t?.config as any)?.embedding || {};
        const provider: "openai" | "minimax" | "voyage" =
            emb.provider === "minimax" ? "minimax" : emb.provider === "voyage" ? "voyage" : "openai";

        const keyProvider = provider === "minimax" ? "minimax"
            : provider === "voyage" ? "voyage_embeddings"
            : "openai_embeddings";
        const [row] = await db
            .select({ enc: tenantProviderKeys.encryptedApiKey })
            .from(tenantProviderKeys)
            .where(and(
                eq(tenantProviderKeys.tenantId, tenantId),
                eq(tenantProviderKeys.provider, keyProvider),
                eq(tenantProviderKeys.isActive, true),
            ))
            .limit(1);
        const apiKey = row?.enc ? decrypt(row.enc) : null;
        cfg = provider === "minimax"
            ? { provider: "minimax", apiKey, groupId: emb.groupId || null }
            : provider === "voyage"
            ? { provider: "voyage", apiKey, model: emb.model || "voyage-3-large" }
            : { provider: "openai", apiKey };
    } catch (err) {
        logger.error({ err, tenantId }, "Failed to resolve tenant embedding config");
    }
    embCfgCache.set(tenantId, { cfg, exp: now + 60_000 });
    return cfg;
}

export interface MemoryResult {
    id: string;
    content: string;
    category: string | null;
    importance: number | null;
    score: number;
    createdAt: Date | null;
}

export class MemoryService {
    /**
     * Store a new memory entry.
     */
    async store(
        tenantId: string,
        agentId: string,
        content: string,
        opts?: {
            category?: string;
            importance?: number;
            metadata?: Record<string, any>;
        }
    ): Promise<string> {
        const embedding = await generateEmbedding(content, { ...(await resolveEmbeddingConfig(tenantId)), type: "db" });

        // The DB column is pgvector `vector(1536)`; cast the literal explicitly
        // so the insert works regardless of how the driver types the param.
        const embeddingSql = embedding
            ? sql`${`[${embedding.join(",")}]`}::vector`
            : sql`NULL`;

        const [entry] = await db
            .insert(memoryEntries)
            .values({
                tenantId,
                agentId,
                content,
                embedding: embeddingSql,
                category: opts?.category || "general",
                importance: opts?.importance?.toString() || "0.5",
                metadata: opts?.metadata || {},
            })
            .returning({ id: memoryEntries.id });

        logger.debug({ tenantId, agentId, memoryId: entry.id, hasEmbedding: !!embedding }, "Memory stored");
        return entry.id;
    }

    /**
     * Search memories using hybrid vector + FTS search.
     */
    async search(
        tenantId: string,
        agentId: string,
        query: string,
        opts?: {
            limit?: number;
            category?: string;
            minImportance?: number;
        }
    ): Promise<MemoryResult[]> {
        const limit = opts?.limit || 10;
        const queryEmbedding = await generateEmbedding(query, { ...(await resolveEmbeddingConfig(tenantId)), type: "query" });

        // Run hybrid search
        const results = await hybridSearch(agentId, queryEmbedding, query, {
            limit: limit * 2, // Fetch more for MMR filtering
            category: opts?.category,
            minImportance: opts?.minImportance,
        });

        // Apply temporal decay
        const decayed = results.map((r) => ({
            ...r,
            score: applyTemporalDecay(r.combinedScore, r.createdAt || new Date(), 30),
        }));

        // Apply MMR for diversity
        const diverse = applyMMR(
            decayed.map((r) => ({ ...r, id: r.id, embedding: r.embedding })),
            0.7,
            limit
        );

        // Update access counts
        for (const item of diverse) {
            db.execute(sql`
                UPDATE memory_entries
                SET access_count = access_count + 1, accessed_at = NOW()
                WHERE id = ${item.id}
            `).catch((err) => logger.error({ err }, "Failed to update memory access count"));
        }

        return diverse.map((r) => ({
            id: r.id,
            content: r.content,
            category: r.category,
            importance: r.importance,
            score: r.score,
            createdAt: r.createdAt,
        }));
    }

    /**
     * Delete a memory entry.
     */
    async forget(memoryId: string): Promise<void> {
        await db.delete(memoryEntries).where(eq(memoryEntries.id, memoryId));
    }

    /**
     * Get relevant memory context for injection into system prompt.
     * Called by runtime.ts before LLM call.
     */
    async getRelevantContext(
        tenantId: string,
        agentId: string,
        message: string,
        limit = 5
    ): Promise<string | null> {
        try {
            const results = await this.search(tenantId, agentId, message, { limit });
            if (results.length === 0) return null;

            const lines = results.map((r) => {
                const cat = r.category ? `[${r.category}]` : "";
                return `${cat} ${r.content}`;
            });

            return lines.join("\n\n");
        } catch (err) {
            logger.error({ err, tenantId, agentId }, "Failed to get relevant memory context");
            return null;
        }
    }
}

export const memoryService = new MemoryService();
