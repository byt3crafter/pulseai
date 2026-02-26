/**
 * Agent Router — routes messages to the correct agent based on tenant configuration.
 * Supports direct routing (explicit agentProfileId) and future keyword-based routing.
 */

import { db } from "../../storage/db.js";
import { agentProfiles } from "../../storage/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";

/**
 * Resolve which agent should handle a message.
 * Priority:
 * 1. Explicit agentProfileId on the inbound message (from channel connection)
 * 2. First agent in the tenant (fallback)
 */
export async function resolveAgent(tenantId: string, agentProfileId?: string): Promise<string | null> {
    if (agentProfileId) {
        return agentProfileId;
    }

    // Fallback: get tenant's first agent
    const fallback = await db.query.agentProfiles.findFirst({
        where: eq(agentProfiles.tenantId, tenantId),
    });

    if (fallback) {
        logger.debug({ tenantId, agentId: fallback.id }, "Using fallback agent");
        return fallback.id;
    }

    logger.warn({ tenantId }, "No agent found for tenant");
    return null;
}
