/**
 * Commitment tools — record and manage agent follow-up check-ins.
 * Delivery when due is governed by the tenant's commitments.deliveryMode setting.
 */

import { eq } from "drizzle-orm";
import { Tool } from "../../src/agent/tools/tool.interface.js";
import { db } from "../../src/storage/db.js";
import { conversations } from "../../src/storage/schema.js";
import { createCommitment, listCommitments, setCommitmentStatus } from "../../src/commitments/commitment-service.js";

function resolveDueAt(args: Record<string, any>): Date | null {
    if (args.due_at) {
        const d = new Date(String(args.due_at));
        if (!Number.isNaN(d.getTime())) return d;
    }
    if (args.due_in_hours != null && Number.isFinite(Number(args.due_in_hours))) {
        return new Date(Date.now() + Number(args.due_in_hours) * 3600_000);
    }
    return null;
}

export const commitmentCreateTool: Tool = {
    name: "commitment_create",
    description:
        "Record a follow-up commitment (a check-in to come back to later) — e.g. 'follow up with ABC Traders " +
        "about the quote'. Give a due time as an ISO date (due_at) or hours from now (due_in_hours). What happens " +
        "when it's due depends on this workspace's commitments setting.",
    parameters: {
        type: "object",
        properties: {
            summary: { type: "string", description: "Short description of the follow-up, e.g. 'Check if ABC Traders accepted quote QTN-0042'." },
            due_at: { type: "string", description: "When it's due, ISO 8601 (e.g. 2026-07-18T09:00:00). Use get_current_time to anchor relative dates." },
            due_in_hours: { type: "number", description: "Alternative to due_at: hours from now (e.g. 72 for three days)." },
        },
        required: ["summary"],
    },
    async execute({ tenantId, conversationId, args }) {
        const dueAt = resolveDueAt(args);
        if (!dueAt) return { result: "Provide a due time — either due_at (ISO 8601) or due_in_hours." };

        let channelType: string | null = null;
        let channelContactId: string | null = null;
        if (conversationId) {
            const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
            channelType = conv?.channelType ?? null;
            channelContactId = conv?.channelContactId ?? null;
        }

        const row = await createCommitment({
            tenantId,
            agentId: (args as any)._agentId ?? null,
            conversationId: conversationId ?? null,
            channelType,
            channelContactId,
            summary: String(args.summary),
            dueAt,
        });
        return {
            result: JSON.stringify({ created: true, id: row?.id, summary: row?.summary, due_at: dueAt.toISOString() }),
            metadata: { id: row?.id },
        };
    },
};

export const commitmentListTool: Tool = {
    name: "commitment_list",
    description: "List your recorded follow-up commitments (optionally filter by status: pending, done, dismissed, delivered).",
    parameters: {
        type: "object",
        properties: {
            status: { type: "string", description: "Filter: pending, done, dismissed, delivered — or omit for all." },
        },
        required: [],
    },
    async execute({ tenantId, args }) {
        const rows = await listCommitments(tenantId, {
            agentId: (args as any)._agentId,
            status: args.status ? String(args.status) : undefined,
        });
        const items = rows.map((r) => ({ id: r.id, summary: r.summary, due_at: r.dueAt, status: r.status }));
        return { result: JSON.stringify({ count: items.length, commitments: items }, null, 2), metadata: { count: items.length } };
    },
};

export const commitmentCompleteTool: Tool = {
    name: "commitment_complete",
    description: "Mark a commitment done or dismissed once handled (or no longer needed). Give the commitment id.",
    parameters: {
        type: "object",
        properties: {
            id: { type: "string", description: "The commitment id (from commitment_list)." },
            status: { type: "string", description: "'done' (default) or 'dismissed'." },
        },
        required: ["id"],
    },
    async execute({ tenantId, args }) {
        const status = args.status === "dismissed" ? "dismissed" : "done";
        await setCommitmentStatus(tenantId, String(args.id), status);
        return { result: JSON.stringify({ id: args.id, status }) };
    },
};
