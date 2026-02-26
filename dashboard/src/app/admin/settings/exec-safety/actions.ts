"use server";

import { db } from "../../../../storage/db";
import { globalSettings, execAuditLog, execPolicyRules } from "../../../../storage/schema";
import { revalidatePath } from "next/cache";
import { desc, eq, sql } from "drizzle-orm";

export async function getExecSafetySettings() {
    const settings = await db.query.globalSettings.findFirst({
        where: (table, { eq }) => eq(table.id, "root"),
    });
    const gwConfig = (settings?.gatewayConfig || {}) as any;
    return {
        enabled: gwConfig.exec_safety_enabled !== false,
        defaultPolicy: gwConfig.exec_safety_default_policy || "allow_all",
        globalDenyPatterns: gwConfig.exec_safety_deny_patterns || "",
        globalAllowPatterns: gwConfig.exec_safety_allow_patterns || "",
    };
}

export async function saveExecSafetySettings(formData: FormData) {
    try {
        const currentSettings = await db.query.globalSettings.findFirst({
            where: (table, { eq }) => eq(table.id, "root"),
        });
        const gwConfig: any = currentSettings?.gatewayConfig
            ? { ...(currentSettings.gatewayConfig as any) }
            : {};

        gwConfig.exec_safety_enabled = formData.get("enabled") === "on";
        gwConfig.exec_safety_default_policy = formData.get("defaultPolicy") as string;
        gwConfig.exec_safety_deny_patterns = formData.get("denyPatterns") as string;
        gwConfig.exec_safety_allow_patterns = formData.get("allowPatterns") as string;

        await db
            .insert(globalSettings)
            .values({ id: "root", gatewayConfig: gwConfig, updatedAt: new Date() })
            .onConflictDoUpdate({
                target: globalSettings.id,
                set: { gatewayConfig: gwConfig, updatedAt: new Date() },
            });

        revalidatePath("/admin/settings/exec-safety");
    } catch (error) {
        console.error("Failed to save exec safety settings:", error);
    }
}

export async function getAuditLogs(page = 0, pageSize = 50) {
    const offset = page * pageSize;
    const logs = await db
        .select()
        .from(execAuditLog)
        .orderBy(desc(execAuditLog.executedAt))
        .limit(pageSize)
        .offset(offset);

    const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(execAuditLog);
    const total = Number(countResult[0]?.count || 0);

    return { logs, total, page, pageSize };
}

export async function getGlobalPolicyRules() {
    return db
        .select()
        .from(execPolicyRules)
        .where(sql`${execPolicyRules.tenantId} IS NULL`)
        .orderBy(desc(execPolicyRules.priority));
}

export async function addPolicyRule(formData: FormData) {
    try {
        await db.insert(execPolicyRules).values({
            tenantId: null,
            agentId: null,
            ruleType: formData.get("ruleType") as string,
            pattern: formData.get("pattern") as string,
            description: formData.get("description") as string,
            priority: parseInt(formData.get("priority") as string) || 0,
        });
        revalidatePath("/admin/settings/exec-safety");
    } catch (error) {
        console.error("Failed to add policy rule:", error);
    }
}

export async function deletePolicyRule(formData: FormData) {
    try {
        const ruleId = formData.get("ruleId") as string;
        await db.delete(execPolicyRules).where(eq(execPolicyRules.id, ruleId));
        revalidatePath("/admin/settings/exec-safety");
    } catch (error) {
        console.error("Failed to delete policy rule:", error);
    }
}
