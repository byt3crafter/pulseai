/**
 * Agent Registry — runtime registry of active agents and their capabilities.
 * Used for delegation routing and agent discovery.
 */

import { db } from "../../storage/db.js";
import { agentProfiles } from "../../storage/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";

export interface AgentInfo {
    id: string;
    name: string;
    tenantId: string;
    modelId: string;
    specialization: string;
    canDelegate: boolean;
    acceptsDelegation: boolean;
}

export interface DelegationConfig {
    canDelegate?: boolean;
    acceptsDelegation?: boolean;
    delegateTo?: string[];
    maxDepth?: number;
    specialization?: string;
}

/**
 * Get all agents in a tenant that accept delegation.
 */
export async function getDelegatableAgents(tenantId: string, excludeAgentId?: string): Promise<AgentInfo[]> {
    const profiles = await db.query.agentProfiles.findMany({
        where: eq(agentProfiles.tenantId, tenantId),
    });

    const result: AgentInfo[] = [];
    for (const p of profiles) {
        if (excludeAgentId && p.id === excludeAgentId) continue;

        const delConfig = (p.delegationConfig as DelegationConfig) || {};
        if (!delConfig.acceptsDelegation) continue;

        result.push({
            id: p.id,
            name: p.name,
            tenantId: p.tenantId,
            modelId: p.modelId || "claude-sonnet-4-20250514",
            specialization: delConfig.specialization || "General assistant",
            canDelegate: delConfig.canDelegate || false,
            acceptsDelegation: true,
        });
    }

    return result;
}

/**
 * Get delegation config for a specific agent.
 */
export async function getAgentDelegationConfig(agentId: string): Promise<DelegationConfig> {
    const profile = await db.query.agentProfiles.findFirst({
        where: eq(agentProfiles.id, agentId),
    });

    if (!profile) return {};
    return (profile.delegationConfig as DelegationConfig) || {};
}

/**
 * Check if agent A can delegate to agent B.
 */
export async function canDelegateTo(sourceAgentId: string, targetAgentId: string): Promise<{ allowed: boolean; reason: string }> {
    const sourceConfig = await getAgentDelegationConfig(sourceAgentId);
    const targetConfig = await getAgentDelegationConfig(targetAgentId);

    if (!sourceConfig.canDelegate) {
        return { allowed: false, reason: "Source agent does not have delegation enabled" };
    }

    if (!targetConfig.acceptsDelegation) {
        return { allowed: false, reason: "Target agent does not accept delegations" };
    }

    // Check if source has a restricted delegation list
    if (sourceConfig.delegateTo && sourceConfig.delegateTo.length > 0) {
        if (!sourceConfig.delegateTo.includes(targetAgentId)) {
            return { allowed: false, reason: "Target agent is not in source agent's allowed delegation list" };
        }
    }

    return { allowed: true, reason: "Delegation allowed" };
}
