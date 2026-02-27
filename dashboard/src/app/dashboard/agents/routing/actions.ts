"use server";

import { db } from "../../../../storage/db";
import { routingRules, agentProfiles, tenants } from "../../../../storage/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../../utils/tenant-auth";

export async function isRoutingEnabledForTenant(tenantId: string): Promise<boolean> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized || tenantCheck.tenantId !== tenantId) return false;

    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
    });
    return !!(tenant?.config as any)?.multi_agent_routing_enabled;
}

export async function getRoutingRules() {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    const rows = await db
        .select({
            id: routingRules.id,
            agentProfileId: routingRules.agentProfileId,
            agentName: agentProfiles.name,
            ruleType: routingRules.ruleType,
            matchValue: routingRules.matchValue,
            priority: routingRules.priority,
            enabled: routingRules.enabled,
            description: routingRules.description,
            createdAt: routingRules.createdAt,
        })
        .from(routingRules)
        .leftJoin(agentProfiles, eq(routingRules.agentProfileId, agentProfiles.id))
        .where(eq(routingRules.tenantId, tenantId))
        .orderBy(asc(routingRules.priority));

    return rows;
}

export async function createRoutingRule(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: "Unauthorized." };
    const tenantId = tenantCheck.tenantId;

    const ruleType = formData.get("ruleType") as string;
    const matchValue = (formData.get("matchValue") as string)?.trim();
    const agentProfileId = formData.get("agentProfileId") as string;
    const priority = parseInt(formData.get("priority") as string, 10) || 100;
    const description = (formData.get("description") as string)?.trim() || null;

    if (!ruleType || !matchValue || !agentProfileId) {
        return { success: false, message: "Rule type, match value, and agent are required." };
    }

    if (!["contact", "group", "keyword", "channel_default"].includes(ruleType)) {
        return { success: false, message: "Invalid rule type." };
    }

    // Validate regex for keyword rules
    if (ruleType === "keyword") {
        try {
            new RegExp(matchValue, "i");
        } catch {
            return { success: false, message: "Invalid regex pattern for keyword rule." };
        }
    }

    // Verify agent belongs to this tenant
    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentProfileId), eq(agentProfiles.tenantId, tenantId)),
    });
    if (!agent) {
        return { success: false, message: "Agent not found." };
    }

    await db.insert(routingRules).values({
        tenantId,
        agentProfileId,
        ruleType,
        matchValue,
        priority,
        description,
    });

    revalidatePath("/dashboard/agents/routing");
    return { success: true };
}

export async function updateRoutingRule(ruleId: string, formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: "Unauthorized." };
    const tenantId = tenantCheck.tenantId;

    // Verify rule belongs to this tenant
    const existing = await db.query.routingRules.findFirst({
        where: and(eq(routingRules.id, ruleId), eq(routingRules.tenantId, tenantId)),
    });
    if (!existing) return { success: false, message: "Rule not found." };

    const ruleType = formData.get("ruleType") as string;
    const matchValue = (formData.get("matchValue") as string)?.trim();
    const agentProfileId = formData.get("agentProfileId") as string;
    const priority = parseInt(formData.get("priority") as string, 10) || 100;
    const description = (formData.get("description") as string)?.trim() || null;

    if (!ruleType || !matchValue || !agentProfileId) {
        return { success: false, message: "Rule type, match value, and agent are required." };
    }

    if (ruleType === "keyword") {
        try {
            new RegExp(matchValue, "i");
        } catch {
            return { success: false, message: "Invalid regex pattern for keyword rule." };
        }
    }

    // Verify agent belongs to this tenant
    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentProfileId), eq(agentProfiles.tenantId, tenantId)),
    });
    if (!agent) return { success: false, message: "Agent not found." };

    await db
        .update(routingRules)
        .set({ ruleType, matchValue, agentProfileId, priority, description, updatedAt: new Date() })
        .where(eq(routingRules.id, ruleId));

    revalidatePath("/dashboard/agents/routing");
    return { success: true };
}

export async function deleteRoutingRule(ruleId: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: "Unauthorized." };
    const tenantId = tenantCheck.tenantId;

    // Verify rule belongs to this tenant
    const existing = await db.query.routingRules.findFirst({
        where: and(eq(routingRules.id, ruleId), eq(routingRules.tenantId, tenantId)),
    });
    if (!existing) return { success: false, message: "Rule not found." };

    await db.delete(routingRules).where(eq(routingRules.id, ruleId));

    revalidatePath("/dashboard/agents/routing");
    return { success: true };
}

export async function toggleRoutingRule(ruleId: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: "Unauthorized." };
    const tenantId = tenantCheck.tenantId;

    const existing = await db.query.routingRules.findFirst({
        where: and(eq(routingRules.id, ruleId), eq(routingRules.tenantId, tenantId)),
    });
    if (!existing) return { success: false, message: "Rule not found." };

    await db
        .update(routingRules)
        .set({ enabled: !existing.enabled, updatedAt: new Date() })
        .where(eq(routingRules.id, ruleId));

    revalidatePath("/dashboard/agents/routing");
    return { success: true };
}
