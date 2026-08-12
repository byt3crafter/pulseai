/**
 * Tool usage scoring — an agent's "working set" of tools.
 *
 * Reads the tool-call history already recorded on agent_runs (tool_calls jsonb)
 * and produces a recency-weighted usage score per tool name. Tool Search uses
 * this to (1) keep an agent's most-used extension tools always loaded (a hot
 * cache, so frequent tools are instant) and (2) rank on-demand tool_search
 * results by real usage, not just text match. Cold/idle tools stay deferred and
 * are one search away. Cached briefly so it's not a per-turn DB hit. Fail-soft:
 * on any error it returns an empty map → behaviour falls back to plain search.
 */

import { db } from "../../storage/db.js";
import { agentRuns } from "../../storage/schema.js";
import { and, eq, desc, gte } from "drizzle-orm";

interface CacheEntry { at: number; scores: Map<string, number>; }
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;          // recompute at most every 5 min per agent
const HALF_LIFE_DAYS = 14;          // a call 14 days ago counts half as much
const LOOKBACK_MS = 60 * 86_400_000; // 60-day window
const MAX_RUNS = 400;

export async function getToolUsageScores(
    tenantId: string,
    agentProfileId: string | undefined,
): Promise<Map<string, number>> {
    if (!agentProfileId) return new Map();
    const key = `${tenantId}:${agentProfileId}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < TTL_MS) return cached.scores;

    const scores = new Map<string, number>();
    try {
        const since = new Date(Date.now() - LOOKBACK_MS);
        const rows = await db
            .select({ toolCalls: agentRuns.toolCalls, startedAt: agentRuns.startedAt })
            .from(agentRuns)
            .where(and(
                eq(agentRuns.tenantId, tenantId),
                eq(agentRuns.agentProfileId, agentProfileId),
                gte(agentRuns.startedAt, since),
            ))
            .orderBy(desc(agentRuns.startedAt))
            .limit(MAX_RUNS);

        const now = Date.now();
        for (const r of rows) {
            const ageDays = r.startedAt ? (now - new Date(r.startedAt).getTime()) / 86_400_000 : 30;
            const weight = Math.pow(0.5, Math.max(0, ageDays) / HALF_LIFE_DAYS);
            const calls = Array.isArray(r.toolCalls) ? (r.toolCalls as any[]) : [];
            for (const c of calls) {
                const name = c?.name;
                if (typeof name === "string" && name) {
                    scores.set(name, (scores.get(name) || 0) + weight);
                }
            }
        }
    } catch {
        /* fail-soft — no usage data → Tool Search behaves as before */
    }

    cache.set(key, { at: Date.now(), scores });
    return scores;
}

/**
 * The last N DISTINCT tools the agent used, most-recent first (pure recency, not
 * frequency). Keeps the agent's just-used tools loaded — "short-term memory" — so
 * a tool it reached for one message ago is still instantly available the next,
 * even if it's not a frequent one. Restricted to a candidate set (deferrable).
 */
export async function getRecentToolNames(
    tenantId: string,
    agentProfileId: string | undefined,
    n: number,
    candidates?: Set<string>,
): Promise<string[]> {
    if (!agentProfileId || n <= 0) return [];
    try {
        const rows = await db
            .select({ toolCalls: agentRuns.toolCalls })
            .from(agentRuns)
            .where(and(eq(agentRuns.tenantId, tenantId), eq(agentRuns.agentProfileId, agentProfileId)))
            .orderBy(desc(agentRuns.startedAt))
            .limit(40);
        const seen: string[] = [];
        for (const r of rows) {
            const calls = Array.isArray(r.toolCalls) ? (r.toolCalls as any[]) : [];
            for (const c of calls) {
                const name = c?.name;
                if (typeof name === "string" && name && !seen.includes(name) && (!candidates || candidates.has(name))) {
                    seen.push(name);
                    if (seen.length >= n) return seen;
                }
            }
        }
        return seen;
    } catch {
        return [];
    }
}

/** Top-N tool names by usage, restricted to a candidate set (e.g. deferrable tools). */
export function topToolsByUsage(
    scores: Map<string, number>,
    n: number,
    candidates?: Set<string>,
): string[] {
    return [...scores.entries()]
        .filter(([name, s]) => s > 0 && (!candidates || candidates.has(name)))
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.max(0, n))
        .map(([name]) => name);
}
