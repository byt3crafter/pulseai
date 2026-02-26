/**
 * Agent Delegation — allows one agent to delegate tasks to another.
 * The target agent processes the task and returns results to the source agent.
 */

import { db } from "../../storage/db.js";
import { agentDelegations, agentProfiles } from "../../storage/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { canDelegateTo, DelegationConfig } from "./agent-registry.js";
import { randomUUID } from "crypto";

// Dependency injection — set by index.ts at boot
let runtimeRef: any = null;

export function setDelegationRuntime(runtime: any) {
    runtimeRef = runtime;
}

export interface DelegationResult {
    success: boolean;
    result: string;
    tokensUsed: number;
    delegationId: string;
}

/**
 * Delegate a task from source agent to target agent.
 * Creates a synthetic conversation and captures the response.
 */
export async function delegateTask(
    sourceAgentId: string,
    targetAgentId: string,
    task: string,
    tenantId: string,
    parentConversationId: string,
    currentDepth: number = 0
): Promise<DelegationResult> {
    const log = logger.child({ sourceAgentId, targetAgentId, tenantId });

    // 1. Validate delegation
    const check = await canDelegateTo(sourceAgentId, targetAgentId);
    if (!check.allowed) {
        return { success: false, result: `Delegation denied: ${check.reason}`, tokensUsed: 0, delegationId: "" };
    }

    // 2. Check depth limit
    const targetProfile = await db.query.agentProfiles.findFirst({
        where: eq(agentProfiles.id, targetAgentId),
    });
    const targetDelConfig = (targetProfile?.delegationConfig as DelegationConfig) || {};
    const maxDepth = targetDelConfig.maxDepth ?? 3;

    if (currentDepth >= maxDepth) {
        return { success: false, result: `Delegation depth limit reached (max: ${maxDepth})`, tokensUsed: 0, delegationId: "" };
    }

    // 3. Create delegation record
    const [delegation] = await db
        .insert(agentDelegations)
        .values({
            tenantId,
            sourceAgentId,
            targetAgentId,
            conversationId: parentConversationId,
            task,
            status: "running",
        })
        .returning();

    log.info({ delegationId: delegation.id, task: task.substring(0, 100) }, "Delegating task to agent");

    if (!runtimeRef) {
        log.error("Agent runtime not initialized for delegation");
        await db.update(agentDelegations)
            .set({ status: "failed", result: "Runtime not initialized", completedAt: new Date() })
            .where(eq(agentDelegations.id, delegation.id));
        return { success: false, result: "Agent runtime not available", tokensUsed: 0, delegationId: delegation.id };
    }

    try {
        // 4. Build synthetic inbound message
        const inbound = {
            id: `delegation-${delegation.id}`,
            tenantId,
            agentProfileId: targetAgentId,
            channelType: "heartbeat" as const,
            channelContactId: `delegation-${sourceAgentId}`,
            contactName: `Delegation from agent`,
            content: task,
            receivedAt: new Date(),
        };

        // 5. Capture response
        let capturedResponse = "";
        const captureCallback = async (msg: any) => {
            capturedResponse = msg.content || "";
            return { channelMessageId: `delegation-response-${delegation.id}` };
        };

        await runtimeRef.processMessage(inbound, captureCallback);

        // 6. Update delegation record
        const truncatedResult = capturedResponse.substring(0, 10000);
        await db.update(agentDelegations)
            .set({
                status: "completed",
                result: truncatedResult,
                completedAt: new Date(),
            })
            .where(eq(agentDelegations.id, delegation.id));

        log.info({ delegationId: delegation.id }, "Delegation completed");

        return {
            success: true,
            result: truncatedResult,
            tokensUsed: 0, // Usage is tracked separately in the runtime
            delegationId: delegation.id,
        };
    } catch (err: any) {
        log.error({ err, delegationId: delegation.id }, "Delegation failed");

        await db.update(agentDelegations)
            .set({
                status: "failed",
                result: err.message || "Unknown error",
                completedAt: new Date(),
            })
            .where(eq(agentDelegations.id, delegation.id));

        return {
            success: false,
            result: `Delegation failed: ${err.message || "Unknown error"}`,
            tokensUsed: 0,
            delegationId: delegation.id,
        };
    }
}
