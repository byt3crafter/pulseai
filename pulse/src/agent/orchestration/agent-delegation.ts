/**
 * Agent Delegation — allows one agent to delegate tasks to another.
 * The target agent processes the task and returns results to the source agent.
 */

import { db } from "../../storage/db.js";
import { agentDelegations, agentProfiles } from "../../storage/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { canDelegateTo, DelegationConfig, resolveDelegationBudget } from "./agent-registry.js";
import { randomUUID } from "crypto";

// Dependency injection — set by index.ts at boot
let runtimeRef: any = null;

export function setDelegationRuntime(runtime: any) {
    runtimeRef = runtime;
}

// ── Safety cap: bound total delegations per root conversation in a short window ──
// Prevents agent↔agent routing loops (e.g. lead → member → lead) and runaway cost.
const MAX_DELEGATIONS_PER_WINDOW = 8;
const DELEGATION_WINDOW_MS = 60_000;
const delegationCounters = new Map<string, { count: number; resetAt: number }>();

function bumpDelegationCounter(conversationId: string): boolean {
    const now = Date.now();
    const entry = delegationCounters.get(conversationId);
    if (!entry || now >= entry.resetAt) {
        delegationCounters.set(conversationId, { count: 1, resetAt: now + DELEGATION_WINDOW_MS });
        return true;
    }
    if (entry.count >= MAX_DELEGATIONS_PER_WINDOW) return false;
    entry.count += 1;
    return true;
}

// ── Per-ROOT delegation budget (spans the whole sub-agent tree) ──────────────
// This is ADDITIVE on top of the window counter above. Its caps are OPT-IN
// (0 = unlimited) so with no config the behaviour is exactly as before. The
// budget is keyed by the ORIGINATING conversation (rootId), threaded down the
// tree, so a fan-out of many sub-agents shares one budget. In-memory (like the
// counter), idle-swept.
interface RootBudget {
    inFlight: number;
    tokens: number;
    hops: number;
    limits: ReturnType<typeof resolveDelegationBudget>;
    at: number;
}
const rootBudgets = new Map<string, RootBudget>();
const ROOT_BUDGET_TTL_MS = 30 * 60_000;

async function getRootBudget(rootId: string, sourceAgentId: string): Promise<RootBudget> {
    let b = rootBudgets.get(rootId);
    if (!b) {
        // Limits come from the agent that STARTED the fan-out (first touch).
        const src = await db.query.agentProfiles.findFirst({ where: eq(agentProfiles.id, sourceAgentId) });
        b = { inFlight: 0, tokens: 0, hops: 0, limits: resolveDelegationBudget((src?.delegationConfig as DelegationConfig) || {}), at: Date.now() };
        rootBudgets.set(rootId, b);
    }
    b.at = Date.now();
    return b;
}

/** Runtime calls this as delegated sub-runs report usage, to tally against the budget. */
export function addDelegatedTokens(rootId: string | undefined, tokens: number): void {
    if (!rootId || !(tokens > 0)) return;
    const b = rootBudgets.get(rootId);
    if (b) { b.tokens += tokens; b.at = Date.now(); }
}

// Idle cleanup so long-lived roots don't leak. unref so it never holds the process open.
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rootBudgets) if (now - v.at > ROOT_BUDGET_TTL_MS) rootBudgets.delete(k);
}, ROOT_BUDGET_TTL_MS).unref?.();

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
    currentDepth: number = 0,
    opts: { bypassPolicy?: boolean; rootId?: string } = {}
): Promise<DelegationResult> {
    const log = logger.child({ sourceAgentId, targetAgentId, tenantId });

    // 0. Safety cap — prevent routing loops / runaway cost within one conversation
    if (!bumpDelegationCounter(parentConversationId)) {
        log.warn({ parentConversationId }, "Delegation cap reached for conversation");
        return { success: false, result: "Delegation limit reached for this conversation. Please answer directly.", tokensUsed: 0, delegationId: "" };
    }

    // 1. Validate delegation (bypassed for org channel routing, which is authorized by
    // channel membership rather than per-agent delegation flags).
    if (!opts.bypassPolicy) {
        const check = await canDelegateTo(sourceAgentId, targetAgentId);
        if (!check.allowed) {
            return { success: false, result: `Delegation denied: ${check.reason}`, tokensUsed: 0, delegationId: "" };
        }
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

    // 2.5 Per-root delegation budget — opt-in caps (0 = unlimited = today's
    // behaviour). Keyed by the originating conversation so a fan-out of many
    // sub-agents shares one budget.
    const rootId = opts.rootId || parentConversationId;
    const budget = await getRootBudget(rootId, sourceAgentId);
    const { maxConcurrent, maxDelegationTokens, maxTreeHops } = budget.limits;
    if (maxTreeHops > 0 && budget.hops >= maxTreeHops) {
        return { success: false, result: `Delegation budget reached (max ${maxTreeHops} for this task). Please answer directly.`, tokensUsed: 0, delegationId: "" };
    }
    if (maxDelegationTokens > 0 && budget.tokens >= maxDelegationTokens) {
        return { success: false, result: `Delegation token budget reached for this task. Please answer directly.`, tokensUsed: 0, delegationId: "" };
    }
    if (maxConcurrent > 0 && budget.inFlight >= maxConcurrent) {
        return { success: false, result: `Too many sub-agents are already running (max ${maxConcurrent}). Please wait or answer directly.`, tokensUsed: 0, delegationId: "" };
    }
    budget.hops++;

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

        // Track this sub-run as in-flight for the concurrency cap; decrement no
        // matter how it ends. delegationContext threads the root id to the
        // sub-agent so nested delegations share this budget.
        budget.inFlight++;
        try {
            await runtimeRef.processMessage(inbound, captureCallback, { delegationContext: { rootId } });
        } finally {
            budget.inFlight--;
        }

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
