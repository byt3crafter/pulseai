/**
 * Embedding pipeline — generates vector embeddings for memory search.
 * Uses OpenAI text-embedding-3-small (1536 dimensions).
 * Falls back to null if no OpenAI key is configured (FTS-only mode).
 */

import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

export { EMBEDDING_DIMENSIONS };

/**
 * Generate an embedding vector for the given text.
 * Returns null if OpenAI is not configured (FTS-only mode).
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
    const apiKey = config.OPENAI_API_KEY;
    if (!apiKey) {
        logger.debug("No OPENAI_API_KEY configured — using FTS-only memory mode");
        return null;
    }

    try {
        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: EMBEDDING_MODEL,
                input: text.substring(0, 8000), // Truncate to stay within token limits
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            logger.error({ status: response.status, err }, "OpenAI embedding API error");
            return null;
        }

        const data = await response.json();
        return data.data[0].embedding as number[];
    } catch (err) {
        logger.error({ err }, "Failed to generate embedding");
        return null;
    }
}
