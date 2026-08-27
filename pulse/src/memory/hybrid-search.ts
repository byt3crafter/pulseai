/**
 * Hybrid search — combines vector similarity (pgvector) with full-text search (tsvector).
 * Merges results from both sources with configurable weighting.
 */

import { db } from "../storage/db.js";
import { sql } from "drizzle-orm";
import { logger } from "../utils/logger.js";

export interface HybridResult {
    id: string;
    content: string;
    category: string | null;
    importance: number | null;
    metadata: any;
    createdAt: Date | null;
    accessedAt: Date | null;
    accessCount: number | null;
    embedding: number[] | null;
    vectorScore: number;
    ftsScore: number;
    combinedScore: number;
}

/**
 * Run hybrid search combining vector similarity and full-text search.
 * @param agentId - Agent ID to scope search
 * @param queryEmbedding - Query embedding vector (null for FTS-only)
 * @param queryText - Raw query text for FTS
 * @param opts - Search options
 */
export async function hybridSearch(
    agentId: string,
    queryEmbedding: number[] | null,
    queryText: string,
    opts: {
        limit?: number;
        category?: string;
        minImportance?: number;
        /**
         * Restrict recall to this person's memories plus workspace ones.
         *
         * Omitted means no restriction, which is what automation and the
         * pre-per-user callers get. Passing it is what stops one person's
         * private context surfacing in another person's answer.
         */
        ownerUserId?: string | null;
        vectorWeight?: number;
    } = {}
): Promise<HybridResult[]> {
    const {
        limit = 20,
        category,
        minImportance,
    } = opts;
    // vectorWeight in opts is accepted for backward compatibility but no longer
    // used — retrieval now fuses by rank (RRF), not by weighted score.

    try {
        // Build WHERE clauses
        const conditions: string[] = [`agent_id = '${agentId}'`];
        if (opts.ownerUserId) {
            // Mine, or the workspace's. A uuid is validated by the cast — a
            // malformed value fails the query rather than widening it.
            conditions.push(`(owner_user_id = '${opts.ownerUserId}'::uuid OR owner_user_id IS NULL)`);
        }
        if (category) conditions.push(`category = '${category}'`);
        if (minImportance !== undefined) conditions.push(`importance >= ${minImportance}`);
        const whereClause = conditions.join(" AND ");

        if (queryEmbedding && queryEmbedding.length > 0) {
            // Full hybrid: vector + FTS fused with RECIPROCAL RANK FUSION (RRF).
            //
            // The old approach was `w·cosine + (1-w)·ts_rank`, but cosine (0..1) and
            // ts_rank (unbounded, usually ≪0.1) live on completely different scales,
            // so a fixed-weight blend is dominated by whichever metric happens to be
            // larger — not by actual relevance. RRF ranks each list independently and
            // fuses by rank position (`Σ 1/(k+rank)`), which is scale-immune and the
            // standard way to combine lexical + semantic retrieval. `k` damps the
            // influence of any single high rank (60 is the canonical default).
            const K = 60;
            const pool = Math.max(limit * 4, 50); // candidates per list before fusing
            const embeddingStr = `[${queryEmbedding.join(",")}]`;
            const q = queryText.replace(/'/g, "''");
            const tsExpr = `to_tsvector('english', content)`;
            const tsQuery = `plainto_tsquery('english', '${q}')`;
            const result = await db.execute(sql.raw(`
                WITH vec AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> '${embeddingStr}'::vector) AS rnk
                    FROM memory_entries
                    WHERE ${whereClause} AND embedding IS NOT NULL
                    ORDER BY embedding <=> '${embeddingStr}'::vector
                    LIMIT ${pool}
                ),
                fts AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank(${tsExpr}, ${tsQuery}) DESC) AS rnk
                    FROM memory_entries
                    WHERE ${whereClause} AND ${tsExpr} @@ ${tsQuery}
                    ORDER BY ts_rank(${tsExpr}, ${tsQuery}) DESC
                    LIMIT ${pool}
                )
                SELECT
                    m.id, m.content, m.category, m.importance, m.metadata,
                    m.created_at, m.accessed_at, m.access_count,
                    COALESCE(1 - (m.embedding <=> '${embeddingStr}'::vector), 0) AS vector_score,
                    COALESCE(ts_rank(${tsExpr.replace("content", "m.content")}, ${tsQuery}), 0) AS fts_score,
                    COALESCE(1.0 / (${K} + vec.rnk), 0) + COALESCE(1.0 / (${K} + fts.rnk), 0) AS rrf_score
                FROM memory_entries m
                LEFT JOIN vec ON vec.id = m.id
                LEFT JOIN fts ON fts.id = m.id
                WHERE vec.id IS NOT NULL OR fts.id IS NOT NULL
                ORDER BY rrf_score DESC
                LIMIT ${limit}
            `));

            return (result as any[]).map((r) => ({
                id: r.id,
                content: r.content,
                category: r.category,
                importance: r.importance ? parseFloat(r.importance) : null,
                metadata: r.metadata,
                createdAt: r.created_at,
                accessedAt: r.accessed_at,
                accessCount: r.access_count,
                embedding: null, // Don't return full embedding
                vectorScore: parseFloat(r.vector_score) || 0,
                ftsScore: parseFloat(r.fts_score) || 0,
                combinedScore: parseFloat(r.rrf_score) || 0,
            }));
        } else {
            // FTS-only mode (no OpenAI key)
            const result = await db.execute(sql.raw(`
                SELECT
                    id, content, category, importance, metadata,
                    created_at, accessed_at, access_count,
                    ts_rank(to_tsvector('english', content), plainto_tsquery('english', '${queryText.replace(/'/g, "''")}')) AS fts_score
                FROM memory_entries
                WHERE ${whereClause}
                    AND to_tsvector('english', content) @@ plainto_tsquery('english', '${queryText.replace(/'/g, "''")}')
                ORDER BY fts_score DESC
                LIMIT ${limit}
            `));

            return (result as any[]).map((r) => ({
                id: r.id,
                content: r.content,
                category: r.category,
                importance: r.importance ? parseFloat(r.importance) : null,
                metadata: r.metadata,
                createdAt: r.created_at,
                accessedAt: r.accessed_at,
                accessCount: r.access_count,
                embedding: null,
                vectorScore: 0,
                ftsScore: parseFloat(r.fts_score) || 0,
                combinedScore: parseFloat(r.fts_score) || 0,
            }));
        }
    } catch (err) {
        logger.error({ err, agentId }, "Hybrid search failed");
        return [];
    }
}
