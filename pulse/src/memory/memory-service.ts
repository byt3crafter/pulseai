/**
 * Memory Service — main entry point for agent memory operations.
 * Supports store, search (hybrid vector+FTS), forget, and context retrieval.
 */

import { db } from "../storage/db.js";
import { memoryEntries, tenantProviderKeys } from "../storage/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { generateEmbedding } from "./embedding.js";
import { hybridSearch, HybridResult } from "./hybrid-search.js";
import { applyTemporalDecay } from "./temporal-decay.js";
import { applyMMR } from "./mmr.js";
import { decrypt } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";

// Resolve a tenant's own OpenAI embeddings key (provider "openai_embeddings").
// Cached briefly to avoid a DB hit on every memory op. Falls back to the
// operator-level OPENAI_API_KEY inside generateEmbedding when this returns null.
const embKeyCache = new Map<string, { key: string | null; exp: number }>();
async function resolveEmbeddingKey(tenantId: string): Promise<string | null> {
    const cached = embKeyCache.get(tenantId);
    const now = Date.now();
    if (cached && cached.exp > now) return cached.key;
    let key: string | null = null;
    try {
        const [row] = await db
            .select({ enc: tenantProviderKeys.encryptedApiKey })
            .from(tenantProviderKeys)
            .where(and(
                eq(tenantProviderKeys.tenantId, tenantId),
                eq(tenantProviderKeys.provider, "openai_embeddings"),
                eq(tenantProviderKeys.isActive, true),
            ))
            .limit(1);
        if (row?.enc) key = decrypt(row.enc);
    } catch (err) {
        logger.error({ err, tenantId }, "Failed to resolve tenant embedding key");
    }
    embKeyCache.set(tenantId, { key, exp: now + 60_000 });
    return key;
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
        const embedding = await generateEmbedding(content, await resolveEmbeddingKey(tenantId));

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
        const queryEmbedding = await generateEmbedding(query, await resolveEmbeddingKey(tenantId));

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
