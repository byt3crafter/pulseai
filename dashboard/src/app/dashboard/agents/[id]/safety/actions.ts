"use server";

import { db } from "../../../../../storage/db";
import { execAuditLog, execPolicyRules } from "../../../../../storage/schema";
import { revalidatePath } from "next/cache";
import { desc, eq, and, sql } from "drizzle-orm";

export async function getAgentPolicyRules(agentId: string) {
    return db
        .select()
        .from(execPolicyRules)
        .where(eq(execPolicyRules.agentId, agentId))
        .orderBy(desc(execPolicyRules.priority));
}

export async function getAgentAuditLogs(agentId: string, page = 0, pageSize = 30) {
    const offset = page * pageSize;
    const logs = await db
        .select()
        .from(execAuditLog)
        .where(eq(execAuditLog.agentId, agentId))
        .orderBy(desc(execAuditLog.executedAt))
        .limit(pageSize)
        .offset(offset);

    const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(execAuditLog)
        .where(eq(execAuditLog.agentId, agentId));
    const total = Number(countResult[0]?.count || 0);

    return { logs, total, page, pageSize };
}

export async function addAgentPolicyRule(formData: FormData) {
    try {
        const agentId = formData.get("agentId") as string;
        const tenantId = formData.get("tenantId") as string;
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
    try {
        const ruleId = formData.get("ruleId") as string;
        const agentId = formData.get("agentId") as string;
        await db.delete(execPolicyRules).where(eq(execPolicyRules.id, ruleId));
        revalidatePath(`/dashboard/agents/${agentId}/safety`);
    } catch (error) {
        console.error("Failed to delete agent policy rule:", error);
    }
}
