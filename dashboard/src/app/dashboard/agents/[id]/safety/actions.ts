"use server";

import { db } from "../../../../../storage/db";
import { execAuditLog, execPolicyRules } from "../../../../../storage/schema";
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireTenant } from "../../../../../utils/tenant-auth";

export async function getAgentPolicyRules(agentId: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    return db
        .select()
        .from(execPolicyRules)
        .where(and(eq(execPolicyRules.agentId, agentId), eq(execPolicyRules.tenantId, tenantId)))
        .orderBy(desc(execPolicyRules.priority));
}

export async function getAgentAuditLogs(agentId: string, page = 0, pageSize = 30) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { logs: [], total: 0, page, pageSize };
    const tenantId = tenantCheck.tenantId;

    const offset = page * pageSize;
    const logs = await db
        .select()
        .from(execAuditLog)
        .where(and(eq(execAuditLog.agentId, agentId), eq(execAuditLog.tenantId, tenantId)))
        .orderBy(desc(execAuditLog.executedAt))
        .limit(pageSize)
        .offset(offset);

    const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(execAuditLog)
        .where(and(eq(execAuditLog.agentId, agentId), eq(execAuditLog.tenantId, tenantId)));
    const total = Number(countResult[0]?.count || 0);

    return { logs, total, page, pageSize };
}

export async function addAgentPolicyRule(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    try {
        const agentId = formData.get("agentId") as string;
        await db.insert(execPolicyRules).values({
            tenantId,
            agentId,
            ruleType: formData.get("ruleType") as string,
            pattern: formData.get("pattern") as string,
            description: formData.get("description") as string,
            priority: parseInt(formData.get("priority") as string) || 0,
        });
        revalidatePath(`/dashboard/agents/${agentId}/safety`);
    } catch (error) {
        console.error("Failed to add agent policy rule:", error);
    }
}

export async function deleteAgentPolicyRule(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    try {
        const ruleId = formData.get("ruleId") as string;
        const agentId = formData.get("agentId") as string;
        await db.delete(execPolicyRules).where(and(eq(execPolicyRules.id, ruleId), eq(execPolicyRules.tenantId, tenantId)));
        revalidatePath(`/dashboard/agents/${agentId}/safety`);
    } catch (error) {
        console.error("Failed to delete agent policy rule:", error);
    }
}
