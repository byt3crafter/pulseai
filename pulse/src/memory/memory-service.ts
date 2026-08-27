/**
 * Memory Service — main entry point for agent memory operations.
 * Supports store, search (hybrid vector+FTS), forget, and context retrieval.
 */

import { db } from "../storage/db.js";
import { memoryEntries, tenantProviderKeys, tenants } from "../storage/schema.js";
import { eq, and, sql, desc } from "drizzle-orm";
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
            /**
             * The person this memory belongs to. Omitted for automation runs,
             * which produce workspace memory readable by everyone.
             */
            ownerUserId?: string | null;
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
                ownerUserId: opts?.ownerUserId ?? null,
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
            /** The person asking — recall returns their memories plus the workspace's. */
            ownerUserId?: string | null;
            category?: string;
            minImportance?: number;
        }
    ): Promise<MemoryResult[]> {
        const limit = opts?.limit || 10;
        const queryEmbedding = await generateEmbedding(query, { ...(await resolveEmbeddingConfig(tenantId)), type: "query" });

        // Run hybrid search
        const results = await hybridSearch(agentId, queryEmbedding, query, {
            ownerUserId: opts?.ownerUserId ?? null,
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
     *
     * Bounded on two axes so memory can never blow up the prompt or stall a turn:
     *  - TIMEOUT: retrieval (which includes an embedding round-trip) is raced
     *    against a hard deadline; if it's slow, we skip memory rather than make
     *    the user wait.
     *  - CHARACTER BUDGET: the joined context is capped, so a pile of long
     *    memories can't crowd out the conversation or run up tokens.
     */
    async getRelevantContext(
        tenantId: string,
        agentId: string,
        message: string,
        limit = 5,
        opts?: { maxChars?: number; timeoutMs?: number; ownerUserId?: string | null }
    ): Promise<string | null> {
        const maxChars = opts?.maxChars ?? 1500;
        const timeoutMs = opts?.timeoutMs ?? 4000;
        try {
            const results = await withTimeout(
                this.search(tenantId, agentId, message, { limit, ownerUserId: opts?.ownerUserId ?? null }),
                timeoutMs,
                [] as MemoryResult[]
            );
            // The always-on persona profile is injected separately by the runtime;
            // don't also surface it here as a "relevant" hit (avoids duplication).
            const atoms = results.filter((r) => r.category !== PERSONA_CATEGORY);
            if (atoms.length === 0) return null;

            const out: string[] = [];
            let used = 0;
            for (const r of atoms) {
                const cat = r.category ? `[${r.category}]` : "";
                const line = `${cat} ${r.content}`.trim();
                if (used + line.length > maxChars && out.length > 0) break;
                out.push(line);
                used += line.length + 2;
            }
            return out.length ? out.join("\n\n") : null;
        } catch (err) {
            logger.error({ err, tenantId, agentId }, "Failed to get relevant memory context");
            return null;
        }
    }

    /**
     * L3 persona/profile — the single distilled long-term profile for an agent
     * (stable preferences, constraints, recurring context). Injected on EVERY
     * turn so the agent always carries who it's working with, independent of
     * whether a search happened to match. Returns null if none has been rolled
     * up yet. `maxChars` keeps it compact in the prompt.
     */
    async getPersona(tenantId: string, agentId: string, maxChars = 900): Promise<string | null> {
        try {
            const [row] = await db
                .select({ content: memoryEntries.content })
                .from(memoryEntries)
                .where(and(
                    eq(memoryEntries.tenantId, tenantId),
                    eq(memoryEntries.agentId, agentId),
                    eq(memoryEntries.category, PERSONA_CATEGORY),
                ))
                .orderBy(desc(memoryEntries.createdAt))
                .limit(1);
            if (!row?.content) return null;
            return row.content.length > maxChars ? row.content.slice(0, maxChars) : row.content;
        } catch (err) {
            logger.warn({ err, tenantId, agentId }, "Failed to load persona");
            return null;
        }
    }

    /** Metadata about the current persona (for cooldown decisions). */
    async getPersonaMeta(tenantId: string, agentId: string): Promise<{ createdAt: Date | null } | null> {
        try {
            const [row] = await db
                .select({ createdAt: memoryEntries.createdAt })
                .from(memoryEntries)
                .where(and(
                    eq(memoryEntries.tenantId, tenantId),
                    eq(memoryEntries.agentId, agentId),
                    eq(memoryEntries.category, PERSONA_CATEGORY),
                ))
                .orderBy(desc(memoryEntries.createdAt))
                .limit(1);
            return row ? { createdAt: row.createdAt } : null;
        } catch {
            return null;
        }
    }

    /** Replace the agent's persona profile with a freshly distilled one. */
    async upsertPersona(tenantId: string, agentId: string, content: string): Promise<void> {
        await db.delete(memoryEntries).where(and(
            eq(memoryEntries.tenantId, tenantId),
            eq(memoryEntries.agentId, agentId),
            eq(memoryEntries.category, PERSONA_CATEGORY),
        ));
        await this.store(tenantId, agentId, content, {
            category: PERSONA_CATEGORY,
            importance: 0.9,
            metadata: { source: "persona_rollup", layer: "persona" },
        });
    }

    /** Recent atom-level memories (excludes the persona) for rollup input. */
    async getRecentAtoms(tenantId: string, agentId: string, limit = 40): Promise<{ content: string; category: string | null }[]> {
        try {
            const rows = await db
                .select({ content: memoryEntries.content, category: memoryEntries.category })
                .from(memoryEntries)
                .where(and(
                    eq(memoryEntries.tenantId, tenantId),
                    eq(memoryEntries.agentId, agentId),
                    sql`${memoryEntries.category} <> ${PERSONA_CATEGORY}`,
                ))
                .orderBy(desc(memoryEntries.createdAt))
                .limit(limit);
            return rows;
        } catch (err) {
            logger.warn({ err, tenantId, agentId }, "Failed to load recent atoms");
            return [];
        }
    }
}

/** Category tag for the L3 persona/profile memory (one per agent). */
export const PERSONA_CATEGORY = "persona";

/** Resolve `p`, but if it takes longer than `ms`, resolve `fallback` instead. */
async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
}

export const memoryService = new MemoryService();
