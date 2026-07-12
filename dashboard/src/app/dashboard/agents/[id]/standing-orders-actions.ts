"use server";

import { db } from "../../../../storage/db";
import { standingOrders, agentProfiles } from "../../../../storage/schema";
import { eq, and, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../../utils/tenant-auth";

export interface StandingOrderDTO {
    id: string;
    name: string;
    enabled: boolean;
    scope: string;
    trigger: string;
    steps: string;
    approvalGates: string;
    escalation: string;
    boundaries: string;
}

/** Confirm the agent belongs to the caller's tenant; returns tenantId or null. */
async function assertAgent(agentId: string, tenantId: string): Promise<boolean> {
    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, tenantId)),
    });
    return Boolean(agent);
}

export async function getStandingOrdersAction(agentId: string): Promise<StandingOrderDTO[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;
    if (!(await assertAgent(agentId, tenantId))) return [];

    const rows = await db.query.standingOrders.findMany({
        where: and(eq(standingOrders.agentId, agentId), eq(standingOrders.tenantId, tenantId)),
        orderBy: [asc(standingOrders.sortOrder), asc(standingOrders.createdAt)],
    });
    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled ?? true,
        scope: r.scope ?? "",
        trigger: r.trigger ?? "",
        steps: r.steps ?? "",
        approvalGates: r.approvalGates ?? "",
        escalation: r.escalation ?? "",
        boundaries: r.boundaries ?? "",
    }));
}

function readFields(formData: FormData) {
    const s = (k: string) => ((formData.get(k) as string) || "").trim();
    return {
        name: s("name"),
        scope: s("scope") || null,
        trigger: s("trigger") || null,
        steps: s("steps") || null,
        approvalGates: s("approvalGates") || null,
        escalation: s("escalation") || null,
        boundaries: s("boundaries") || null,
    };
}

export async function createStandingOrderAction(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;
    const agentId = formData.get("agentId") as string;
    if (!(await assertAgent(agentId, tenantId))) return { success: false, message: "Agent not found." };

    const fields = readFields(formData);
    if (!fields.name) return { success: false, message: "Give the program a name." };

    try {
        await db.insert(standingOrders).values({ tenantId, agentId, ...fields });
        revalidatePath(`/dashboard/agents/${agentId}`);
        return { success: true, message: "Standing order created." };
    } catch (error) {
        console.error("Failed to create standing order:", error);
        return { success: false, message: "Failed to create standing order." };
    }
}

export async function updateStandingOrderAction(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;
    const id = formData.get("id") as string;
    const agentId = formData.get("agentId") as string;
    if (!(await assertAgent(agentId, tenantId))) return { success: false, message: "Agent not found." };

    const fields = readFields(formData);
    if (!fields.name) return { success: false, message: "Give the program a name." };

    try {
        await db
            .update(standingOrders)
            .set({ ...fields, updatedAt: new Date() })
            .where(and(eq(standingOrders.id, id), eq(standingOrders.tenantId, tenantId)));
        revalidatePath(`/dashboard/agents/${agentId}`);
        return { success: true, message: "Standing order saved." };
    } catch (error) {
        console.error("Failed to update standing order:", error);
        return { success: false, message: "Failed to save standing order." };
    }
}

export async function toggleStandingOrderAction(id: string, agentId: string, enabled: boolean) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    try {
        await db
            .update(standingOrders)
            .set({ enabled, updatedAt: new Date() })
            .where(and(eq(standingOrders.id, id), eq(standingOrders.tenantId, tenantId)));
        revalidatePath(`/dashboard/agents/${agentId}`);
        return { success: true, message: enabled ? "Enabled." : "Disabled." };
    } catch (error) {
        console.error("Failed to toggle standing order:", error);
        return { success: false, message: "Failed to update." };
    }
}

export async function deleteStandingOrderAction(id: string, agentId: string) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    try {
        await db.delete(standingOrders).where(and(eq(standingOrders.id, id), eq(standingOrders.tenantId, tenantId)));
        revalidatePath(`/dashboard/agents/${agentId}`);
        return { success: true, message: "Standing order deleted." };
    } catch (error) {
        console.error("Failed to delete standing order:", error);
        return { success: false, message: "Failed to delete standing order." };
    }
}
