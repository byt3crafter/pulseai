/**
 * Commitments — agent follow-up check-ins. Stored per tenant/agent; how they're
 * delivered when due is a per-tenant setting (never hardcoded):
 *   channel  — send the check-in to the original conversation/channel
 *   owner    — surface it to a designated owner/manager contact
 *   internal — no outbound message; the agent just sees it (default, safest)
 */

import { and, eq, lte, desc } from "drizzle-orm";
import { db } from "../storage/db.js";
import { commitments } from "../storage/schema.js";
import { logger } from "../utils/logger.js";

export type CommitmentDeliveryMode = "channel" | "owner" | "internal";

export interface CommitmentsConfig {
    enabled: boolean;
    deliveryMode: CommitmentDeliveryMode;
    maxPerDay: number;
    ownerContact?: string;
}

const MODES: CommitmentDeliveryMode[] = ["channel", "owner", "internal"];

/** Read the tenant's commitments setting from its config (safe defaults). */
export function parseCommitmentsConfig(tenantConfig: unknown): CommitmentsConfig {
    const c = (tenantConfig && typeof tenantConfig === "object" ? (tenantConfig as any).commitments : undefined) || {};
    const deliveryMode = MODES.includes(c.deliveryMode) ? c.deliveryMode : "internal";
    const maxPerDay = Number.isFinite(c.maxPerDay) ? Math.max(0, Math.min(20, Math.floor(c.maxPerDay))) : 3;
    return {
        enabled: c.enabled === true,
        deliveryMode,
        maxPerDay,
        ownerContact: typeof c.ownerContact === "string" && c.ownerContact.trim() ? c.ownerContact.trim() : undefined,
    };
}

export interface CreateCommitmentInput {
    tenantId: string;
    agentId?: string | null;
    conversationId?: string | null;
    channelType?: string | null;
    channelContactId?: string | null;
    summary: string;
    dueAt: Date;
    metadata?: Record<string, any>;
}

export async function createCommitment(input: CreateCommitmentInput) {
    const [row] = await db
        .insert(commitments)
        .values({
            tenantId: input.tenantId,
            agentId: input.agentId ?? null,
            conversationId: input.conversationId ?? null,
            channelType: input.channelType ?? null,
            channelContactId: input.channelContactId ?? null,
            summary: input.summary,
            dueAt: input.dueAt,
            status: "pending",
            metadata: input.metadata ?? {},
        })
        .returning();
    logger.info({ tenantId: input.tenantId, agentId: input.agentId, id: row?.id }, "Commitment created");
    return row;
}

export async function listCommitments(
    tenantId: string,
    opts?: { agentId?: string; status?: string; limit?: number }
) {
    const conds = [eq(commitments.tenantId, tenantId)];
    if (opts?.agentId) conds.push(eq(commitments.agentId, opts.agentId));
    if (opts?.status) conds.push(eq(commitments.status, opts.status));
    return db
        .select()
        .from(commitments)
        .where(and(...conds))
        .orderBy(desc(commitments.dueAt))
        .limit(Math.min(opts?.limit ?? 50, 100));
}

export async function setCommitmentStatus(tenantId: string, id: string, status: "done" | "dismissed" | "delivered") {
    await db
        .update(commitments)
        .set({ status, updatedAt: new Date(), ...(status === "delivered" ? { deliveredAt: new Date() } : {}) })
        .where(and(eq(commitments.id, id), eq(commitments.tenantId, tenantId)));
}

/** Pending commitments whose due time has passed (for delivery). */
export async function getDueCommitments(tenantId: string, agentId?: string) {
    const conds = [eq(commitments.tenantId, tenantId), eq(commitments.status, "pending"), lte(commitments.dueAt, new Date())];
    if (agentId) conds.push(eq(commitments.agentId, agentId));
    return db.select().from(commitments).where(and(...conds)).orderBy(commitments.dueAt);
}
