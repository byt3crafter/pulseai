/**
 * Temporal decay — recency weighting for memory search results.
 * score * exp(-lambda * ageDays)
 */

/**
 * Apply temporal decay to a score based on age.
 * @param score - The original relevance score
 * @param createdAt - When the memory was created
 * @param halfLifeDays - Half-life in days (default: 30)
 */
export function applyTemporalDecay(
    score: number,
    createdAt: Date,
    halfLifeDays = 30
): number {
    const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const lambda = Math.LN2 / halfLifeDays;
    return score * Math.exp(-lambda * ageDays);
}
