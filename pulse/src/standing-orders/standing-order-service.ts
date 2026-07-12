/**
 * Standing Orders — per-agent "operating programs" a user defines once and the
 * agent then runs autonomously within. Injected into the system prompt.
 *
 * Approval gates are enforced softly (the agent is instructed to pause and ask
 * before a gated action; escalation = notify the owner). Hard runtime pause/resume
 * is intentionally out of scope for this version.
 */

import { and, asc, eq } from "drizzle-orm";
import { db } from "../storage/db.js";
import { standingOrders } from "../storage/schema.js";
import { logger } from "../utils/logger.js";

export type StandingOrder = typeof standingOrders.$inferSelect;

/** Enabled standing orders for an agent, in display order. */
export async function getActiveStandingOrders(tenantId: string, agentId: string): Promise<StandingOrder[]> {
    try {
        return await db.query.standingOrders.findMany({
            where: and(
                eq(standingOrders.tenantId, tenantId),
                eq(standingOrders.agentId, agentId),
                eq(standingOrders.enabled, true)
            ),
            orderBy: [asc(standingOrders.sortOrder), asc(standingOrders.createdAt)],
        });
    } catch (err) {
        logger.warn({ err, tenantId, agentId }, "Failed to load standing orders (non-fatal)");
        return [];
    }
}

function field(label: string, value: string | null): string | null {
    const v = (value || "").trim();
    return v ? `  - ${label}: ${v}` : null;
}

/**
 * Render standing orders as a system-prompt section. Returns "" when there are
 * none so the caller can append unconditionally.
 */
export function formatStandingOrdersForPrompt(orders: StandingOrder[]): string {
    if (!orders.length) return "";
    const blocks = orders.map((o, i) => {
        const lines = [
            `${i + 1}. ${o.name}`,
            field("You are authorised to", o.scope),
            field("When", o.trigger),
            field("Steps", o.steps),
            field("Get my approval before", o.approvalGates),
            field("Stop and escalate to me if", o.escalation),
            field("Never", o.boundaries),
        ].filter(Boolean);
        return lines.join("\n");
    });
    return (
        `\n\n## Standing orders (your operating programs)\n` +
        `These are permanent instructions your operator has given you. Follow them without being re-asked. ` +
        `Always **execute → verify → report** (do the work, confirm it actually happened, then say what you did). ` +
        `Where an "approval before" is set, pause and ask first. Where an "escalate if" condition is met, stop and tell your operator instead of guessing.\n\n` +
        blocks.join("\n\n")
    );
}
