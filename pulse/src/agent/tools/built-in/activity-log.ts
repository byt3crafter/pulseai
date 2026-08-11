/**
 * Activity Log tool — lets an agent read its workspace's audit trail (who did
 * what: settings, credentials, tools, agents, team roles, integrations).
 * Strictly tenant-scoped and read-only. Powers questions like "who disabled the
 * web-search tool", "what changed this week", "who added the ERPNext key".
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { auditLogs } from "../../../storage/schema.js";
import { and, eq, desc, gte, ilike } from "drizzle-orm";

/** Parse "7d" / "24h" / "30m" / ISO date into a Date (or null). */
function parseSince(raw: string | undefined): Date | null {
    if (!raw) return null;
    const s = raw.trim();
    const rel = s.match(/^(\d+)\s*([mhdw])$/i);
    if (rel) {
        const n = parseInt(rel[1], 10);
        const unitMs = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[rel[2].toLowerCase()]!;
        return new Date(Date.now() - n * unitMs);
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

export const activityLogTool: Tool = {
    name: "activity_log",
    source: "builtin",
    description:
        "Read this workspace's activity / audit log — a record of WHO changed WHAT (settings, credentials, tools, agents, team roles, integrations, approvals). Read-only and scoped to this workspace only. " +
        "Use it to answer questions like 'who disabled the web search tool', 'what changed this week', 'who added the ERPNext credentials', or to review recent admin activity.",
    parameters: {
        type: "object",
        properties: {
            limit: { type: "number", description: "Max entries to return (default 20, max 100)." },
            action: { type: "string", description: "Filter by action substring, e.g. 'credential', 'agent', 'tool_policy', 'provider_key'." },
            actor: { type: "string", description: "Filter by the person's email (substring)." },
            since: { type: "string", description: "Only entries since this time. Relative like '24h', '7d', '2w', or an ISO date." },
        },
        required: [],
    },
    execute: async ({ tenantId, args }) => {
        const limit = Math.max(1, Math.min(100, Number(args?.limit) || 20));
        const since = parseSince(typeof args?.since === "string" ? args.since : undefined);

        const conds = [eq(auditLogs.tenantId, tenantId)];
        if (typeof args?.action === "string" && args.action.trim()) {
            conds.push(ilike(auditLogs.action, `%${args.action.trim()}%`));
        }
        if (typeof args?.actor === "string" && args.actor.trim()) {
            conds.push(ilike(auditLogs.actorEmail, `%${args.actor.trim()}%`));
        }
        if (since) conds.push(gte(auditLogs.createdAt, since));

        const rows = await db
            .select({
                createdAt: auditLogs.createdAt,
                actorEmail: auditLogs.actorEmail,
                actorRole: auditLogs.actorRole,
                action: auditLogs.action,
                summary: auditLogs.summary,
                targetType: auditLogs.targetType,
                targetId: auditLogs.targetId,
            })
            .from(auditLogs)
            .where(and(...conds))
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit);

        if (rows.length === 0) {
            return { result: "No matching activity-log entries for this workspace." };
        }

        const lines = rows.map((r) => {
            const when = r.createdAt ? new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "?";
            const who = r.actorEmail ? `${r.actorEmail}${r.actorRole ? ` (${r.actorRole})` : ""}` : "system";
            const what = r.summary || r.action;
            const tgt = r.targetType ? ` [${r.targetType}${r.targetId ? `:${r.targetId}` : ""}]` : "";
            return `- ${when} · ${who} · ${r.action}: ${what}${tgt}`;
        });

        return {
            result: `Recent workspace activity (${rows.length} entr${rows.length === 1 ? "y" : "ies"}, newest first):\n${lines.join("\n")}`,
            metadata: { count: rows.length },
        };
    },
};
