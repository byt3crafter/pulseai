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
        vectorWeight?: number;
    } = {}
): Promise<HybridResult[]> {
    const {
        limit = 20,
        category,
        minImportance,
        vectorWeight = 0.7,
    } = opts;
    const ftsWeight = 1 - vectorWeight;

    try {
        // Build WHERE clauses
        const conditions: string[] = [`agent_id = '${agentId}'`];
        if (category) conditions.push(`category = '${category}'`);
        if (minImportance !== undefined) conditions.push(`importance >= ${minImportance}`);
        const whereClause = conditions.join(" AND ");

        if (queryEmbedding && queryEmbedding.length > 0) {
            // Full hybrid: vector + FTS
            const embeddingStr = `[${queryEmbedding.join(",")}]`;
            const result = await db.execute(sql.raw(`
                SELECT
                    id, content, category, importance, metadata,
                    created_at, accessed_at, access_count,
                    COALESCE(1 - (embedding <=> '${embeddingStr}'::vector), 0) AS vector_score,
                    COALESCE(ts_rank(to_tsvector('english', content), plainto_tsquery('english', '${queryText.replace(/'/g, "''")}')), 0) AS fts_score
                FROM memory_entries
                WHERE ${whereClause}
                ORDER BY (
                    ${vectorWeight} * COALESCE(1 - (embedding <=> '${embeddingStr}'::vector), 0) +
                    ${ftsWeight} * COALESCE(ts_rank(to_tsvector('english', content), plainto_tsquery('english', '${queryText.replace(/'/g, "''")}')), 0)
                ) DESC
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
                combinedScore: vectorWeight * (parseFloat(r.vector_score) || 0) + ftsWeight * (parseFloat(r.fts_score) || 0),
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
