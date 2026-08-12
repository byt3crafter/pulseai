/**
 * Commitment tools — the agent's "waiting for X" memory. When the agent does
 * something it expects a result from (e.g. sends a quotation and awaits the
 * customer's reply), it records a commitment with a due date. A scheduled
 * follow-up run (or the daily briefing) reads these to chase replies and surface
 * what's pending. The storage + due-scan already exist (commitment-service); this
 * is the missing agent-facing layer.
 */

import { Tool } from "../tool.interface.js";
import { createCommitment, listCommitments, setCommitmentStatus } from "../../../commitments/commitment-service.js";
import { getTenantTimezone, parseZonedDate, formatInTz } from "../tz-util.js";

export const commitmentCreateTool: Tool = {
    name: "commitment_create",
    source: "builtin",
    description:
        "THE tool for tracking something you are WAITING FOR A REPLY/RESPONSE on. Use this — NOT a to-do or a calendar event — whenever you send a quotation, invoice, or email and expect a reply back. " +
        "It's what lets the automatic follow-up check match the incoming reply and chase it if it's late. Give a clear summary of what you're waiting for and from whom, plus a due date to chase by. " +
        "(To-dos are for your own action items; commitments are specifically for awaiting someone else's reply.)",
    parameters: {
        type: "object",
        properties: {
            summary: { type: "string", description: "What you're waiting for and from whom, e.g. 'Reply from MP Mining on quotation TI-002514'." },
            due: { type: "string", description: "When to follow up / chase by (workspace timezone), e.g. '2026-08-15' or 'Friday'." },
            waiting_for: { type: "string", description: "Optional: who/what the reply is from (e.g. an email address or company) to help match an incoming reply." },
        },
        required: ["summary", "due"],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const summary = String(args?.summary ?? "").trim();
        if (!summary) return { result: "Describe what you're waiting for." };
        const tz = await getTenantTimezone(tenantId);
        // Forgiving: if the date is missing or unparseable, default to chasing in
        // 3 days rather than failing — a follow-up with a rough date beats none.
        const parsed = args?.due ? parseZonedDate(args.due, tz) : null;
        const dueAt = parsed ?? parseZonedDate("in 3 days", tz) ?? new Date(Date.now() + 3 * 86400000);
        const defaulted = !parsed;
        const agentId = typeof args?._agentId === "string" ? args._agentId : null;
        const row = await createCommitment({
            tenantId,
            agentId,
            conversationId: conversationId && /^[0-9a-f-]{36}$/i.test(conversationId) ? conversationId : null,
            summary: summary.slice(0, 1000),
            dueAt,
            metadata: args?.waiting_for ? { waitingFor: String(args.waiting_for).slice(0, 300) } : {},
        });
        return { result: `Noted — I'll follow up on "${summary}" by ${formatInTz(dueAt, tz)}${defaulted ? " (defaulted — tell me if you want a different date)" : ""}. [id: ${row?.id}]` };
    },
};

export const commitmentListTool: Tool = {
    name: "commitment_list",
    source: "builtin",
    description: "List your open follow-ups / things you're waiting on. By default shows pending ones; pass status to filter (pending|done|dismissed|delivered).",
    parameters: {
        type: "object",
        properties: { status: { type: "string", enum: ["pending", "done", "dismissed", "delivered"], description: "Filter by status (default pending)." } },
        required: [],
    },
    execute: async ({ tenantId, args }) => {
        const tz = await getTenantTimezone(tenantId);
        const agentId = typeof args?._agentId === "string" ? args._agentId : undefined;
        const status = ["pending", "done", "dismissed", "delivered"].includes(String(args?.status)) ? String(args.status) : "pending";
        const rows = await listCommitments(tenantId, { agentId, status, limit: 100 });
        if (rows.length === 0) return { result: status === "pending" ? "No open follow-ups — nothing you're waiting on." : `No ${status} follow-ups.` };
        const now = Date.now();
        const lines = rows.map((r) => {
            const due = r.dueAt ? formatInTz(r.dueAt, tz) : "?";
            const overdue = r.dueAt && r.status === "pending" && new Date(r.dueAt).getTime() < now ? " ⚠ OVERDUE" : "";
            const wf = (r.metadata as any)?.waitingFor ? ` (from ${(r.metadata as any).waitingFor})` : "";
            return `- ${r.summary}${wf} — due ${due}${overdue} [id: ${r.id}]`;
        });
        return { result: `Follow-ups (${rows.length}):\n${lines.join("\n")}` };
    },
};

export const commitmentCompleteTool: Tool = {
    name: "commitment_complete",
    source: "builtin",
    description: "Close a follow-up once it's resolved (e.g. the reply arrived) — by its id. Set dismiss=true to drop it without action.",
    parameters: {
        type: "object",
        properties: {
            id: { type: "string", description: "The follow-up id (from commitment_list)." },
            dismiss: { type: "boolean", description: "true to dismiss/drop it, false (default) to mark it resolved." },
        },
        required: ["id"],
    },
    execute: async ({ tenantId, args }) => {
        const id = String(args?.id ?? "").trim();
        if (!id) return { result: "Provide the follow-up id." };
        await setCommitmentStatus(tenantId, id, args?.dismiss === true ? "dismissed" : "done");
        return { result: args?.dismiss === true ? `Dropped follow-up ${id}.` : `Closed follow-up ${id} — marked resolved.` };
    },
};
