/**
 * Embedding pipeline — generates vector embeddings for memory search.
 * Supports OpenAI (text-embedding-3-small) and MiniMax (embo-01) — both 1536-dim.
 * Returns null if no provider is configured (FTS-only mode).
 */

import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const OPENAI_MODEL = "text-embedding-3-small";
const MINIMAX_MODEL = "embo-01";
const EMBEDDING_DIMENSIONS = 1536; // both OpenAI small and MiniMax embo-01

export { EMBEDDING_DIMENSIONS };

export interface EmbeddingConfig {
    provider: "openai" | "minimax" | "voyage";
    apiKey?: string | null;
    groupId?: string | null;   // MiniMax only
    model?: string | null;      // Voyage: voyage-3-large | voyage-3-lite
    type?: "db" | "query";      // 'db' = stored doc, 'query' = search
}

// Output vector dimension per provider (the memory column is resized to match
// when the active provider changes). Voyage is forced to 1024 for both models.
export const VOYAGE_DIMENSION = 1024;
export function dimensionForProvider(provider: string): number {
    return provider === "voyage" ? VOYAGE_DIMENSION : 1536;
}

/**
 * Generate an embedding vector for the given text.
 * `cfg` selects the provider + credentials; passing a bare string is treated as
 * an OpenAI key (back-compat). Returns null if not configured / on failure
 * (caller then runs in FTS-only mode).
 */
export async function generateEmbedding(
    text: string,
    cfg?: EmbeddingConfig | string | null,
): Promise<number[] | null> {
    const c: EmbeddingConfig = (typeof cfg === "string" || cfg == null)
        ? { provider: "openai", apiKey: typeof cfg === "string" ? cfg : null }
        : cfg;

    const input = (text || "").substring(0, 8000);

    try {
        if (c.provider === "minimax") {
            if (!c.apiKey || !c.groupId) {
                logger.debug("MiniMax embedding not configured (key/groupId) — FTS-only mode");
                return null;
            }
            const r = await fetch(
                `https://api.minimax.io/v1/embeddings?GroupId=${encodeURIComponent(c.groupId)}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
                    body: JSON.stringify({ model: MINIMAX_MODEL, texts: [input], type: c.type || "db" }),
                },
            );
            const j = await r.json().catch(() => null);
            const code = j?.base_resp?.status_code;
            if (code !== 0 || !Array.isArray(j?.vectors?.[0])) {
                logger.error({ httpStatus: r.status, code, msg: j?.base_resp?.status_msg }, "MiniMax embedding failed");
                return null;
            }
            return j.vectors[0] as number[];
        }

        if (c.provider === "voyage") {
            if (!c.apiKey) {
                logger.debug("Voyage embedding not configured (key) — FTS-only mode");
                return null;
            }
            const r = await fetch("https://api.voyageai.com/v1/embeddings", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
                body: JSON.stringify({
                    model: c.model || "voyage-3-large",
                    input: [input],
                    input_type: c.type === "query" ? "query" : "document",
                    output_dimension: VOYAGE_DIMENSION,
                }),
            });
            if (!r.ok) {
                logger.error({ status: r.status, err: await r.text() }, "Voyage embedding API error");
                return null;
            }
            const j = await r.json();
            const vec = j?.data?.[0]?.embedding;
            return Array.isArray(vec) ? (vec as number[]) : null;
        }

        // Default: OpenAI-compatible embeddings
        const apiKey = c.apiKey || config.OPENAI_API_KEY;
        if (!apiKey) {
            logger.debug("No embedding key configured — using FTS-only memory mode");
            return null;
        }
        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: OPENAI_MODEL, input }),
        });
        if (!response.ok) {
            const err = await response.text();
            logger.error({ status: response.status, err }, "OpenAI embedding API error");
            return null;
        }
        const data = await response.json();
        return data.data[0].embedding as number[];
    } catch (err) {
        logger.error({ err, provider: c.provider }, "Failed to generate embedding");
        return null;
    }
}
