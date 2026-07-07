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
    createdAt: Date | string | number | null | undefined,
    halfLifeDays = 30
): number {
    // createdAt may arrive as a string/number from the DB driver — coerce safely.
    const created = createdAt instanceof Date ? createdAt : new Date(createdAt ?? Date.now());
    const createdMs = created.getTime();
    if (Number.isNaN(createdMs)) return score; // unknown age → no decay
    const ageDays = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
    const lambda = Math.LN2 / halfLifeDays;
    return score * Math.exp(-lambda * ageDays);
}
