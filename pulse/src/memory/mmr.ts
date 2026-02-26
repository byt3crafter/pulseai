/**
 * Maximal Marginal Relevance (MMR) — promotes diversity in search results.
 * Balances relevance with novelty to avoid returning near-duplicate memories.
 */

export interface ScoredItem {
    id: string;
    score: number;
    embedding?: number[] | null;
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

/**
 * Apply MMR re-ranking to select diverse results.
 * @param items - Scored items with embeddings
 * @param lambda - Balance between relevance (1.0) and diversity (0.0). Default: 0.7
 * @param limit - Max items to return
 */
export function applyMMR<T extends ScoredItem>(
    items: T[],
    lambda = 0.7,
    limit = 5
): T[] {
    if (items.length <= 1) return items.slice(0, limit);

    // Items without embeddings can't be diversified — just sort by score
    const withEmbeddings = items.filter((i) => i.embedding && i.embedding.length > 0);
    const withoutEmbeddings = items.filter((i) => !i.embedding || i.embedding.length === 0);

    if (withEmbeddings.length === 0) {
        return items.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    const selected: T[] = [];
    const remaining = new Set(withEmbeddings.map((_, i) => i));

    // Pick the highest-scoring item first
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (const idx of remaining) {
        if (withEmbeddings[idx].score > bestScore) {
            bestScore = withEmbeddings[idx].score;
            bestIdx = idx;
        }
    }
    selected.push(withEmbeddings[bestIdx]);
    remaining.delete(bestIdx);

    // Greedily pick remaining items by MMR score
    while (selected.length < limit && remaining.size > 0) {
        let bestMMR = -Infinity;
        let bestMMRIdx = -1;

        for (const idx of remaining) {
            const relevance = withEmbeddings[idx].score;

            // Max similarity to any already-selected item
            let maxSim = 0;
            for (const sel of selected) {
                if (sel.embedding && withEmbeddings[idx].embedding) {
                    const sim = cosineSimilarity(sel.embedding!, withEmbeddings[idx].embedding!);
                    if (sim > maxSim) maxSim = sim;
                }
            }

            const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
            if (mmrScore > bestMMR) {
                bestMMR = mmrScore;
                bestMMRIdx = idx;
            }
        }

        if (bestMMRIdx >= 0) {
            selected.push(withEmbeddings[bestMMRIdx]);
            remaining.delete(bestMMRIdx);
        } else {
            break;
        }
    }

    // Append any non-embedding items at the end
    const result = [...selected, ...withoutEmbeddings.sort((a, b) => b.score - a.score)];
    return result.slice(0, limit);
}
