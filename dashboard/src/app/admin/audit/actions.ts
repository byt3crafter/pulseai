"use server";

import { db } from "../../../storage/db";
import { auditLogs } from "../../../storage/schema";
import { and, desc, eq, ilike } from "drizzle-orm";
import { requireAdmin } from "../../../utils/admin-auth";

const EXPORT_LIMIT = 5000;

function csvField(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

export async function exportAuditCsv(action: string, q: string): Promise<string> {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return "";

    const conditions = [];
    if (action) conditions.push(eq(auditLogs.action, action));
    if (q) conditions.push(ilike(auditLogs.actorEmail, `%${q}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(EXPORT_LIMIT);

    const header = "time,actor,role,action,target_type,target_id,ip,summary";
    const lines = rows.map((r) => {
        const time = r.createdAt ? r.createdAt.toISOString() : "";
        const actor = r.actorEmail || "";
        const role = r.actorRole || "";
        const action = r.action || "";
        const targetType = r.targetType || "";
        const targetId = r.targetId || "";
        const ip = r.ip || "";
        const summary = r.summary || "";
        return [time, actor, role, action, targetType, targetId, ip, summary]
            .map(csvField)
            .join(",");
    });

    return [header, ...lines].join("\n");
}
