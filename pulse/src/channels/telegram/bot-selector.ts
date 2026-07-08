/**
 * Pure bot-selection logic for the multi-bot Telegram adapter.
 *
 * A tenant can connect a separate Telegram bot per agent (one channel_connections
 * row per bot, keyed by connection id). This picks which connection should
 * handle an outbound send (or an inbound webhook with no connectionId in the
 * URL) given the target agentProfileId, if any.
 *
 * Kept dependency-free (no grammY, no DB) so it can be unit-tested directly.
 */

export interface BotCandidate {
    /** channel_connections.id */
    id: string;
    agentProfileId?: string | null;
    /**
     * True for the tenant-wide "default" bot (connected via Settings →
     * Telegram), false for a bot connected to one specific agent. Derived
     * from channelConfig.scope !== "agent" by the caller.
     */
    isDefault: boolean;
}

/**
 * Resolve which connection id should be used.
 *
 * Priority:
 *  1. An agent-scoped bot whose agentProfileId matches exactly.
 *  2. The tenant-wide default bot, if one exists (covers messages sent before
 *     an agent is resolved, and agents with no dedicated bot).
 *  3. Any other connection matching agentProfileId (edge case: a "default"
 *     connection whose auto-linked agentProfileId happens to match).
 *  4. The first available connection, so a tenant with only per-agent bots
 *     and no default still gets *something* rather than a hard failure.
 *
 * Returns null only when there are no candidates at all.
 */
export function selectConnectionId(
    candidates: BotCandidate[],
    agentProfileId?: string | null
): string | null {
    if (candidates.length === 0) return null;

    if (agentProfileId) {
        const agentScopedMatch = candidates.find(
            (c) => !c.isDefault && c.agentProfileId === agentProfileId
        );
        if (agentScopedMatch) return agentScopedMatch.id;
    }

    const defaultConn = candidates.find((c) => c.isDefault);
    if (defaultConn) return defaultConn.id;

    if (agentProfileId) {
        const anyMatch = candidates.find((c) => c.agentProfileId === agentProfileId);
        if (anyMatch) return anyMatch.id;
    }

    return candidates[0].id;
}
