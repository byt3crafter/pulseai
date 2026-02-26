"use server";

import { db } from "../../../../../storage/db";
import { agentProfiles, agentDelegations } from "../../../../../storage/schema";
import { eq, or, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function saveDelegationConfig(formData: FormData) {
    "use server";
    const agentId = formData.get("agentId") as string;

    const delegationConfig = {
        canDelegate: formData.get("canDelegate") === "on",
        acceptsDelegation: formData.get("acceptsDelegation") === "on",
        specialization: (formData.get("specialization") as string) || "",
        maxDepth: parseInt(formData.get("maxDepth") as string) || 3,
        delegateTo: [] as string[],
    };

    // Parse comma-separated agent IDs
    const delegateToRaw = (formData.get("delegateTo") as string) || "";
    if (delegateToRaw.trim()) {
        delegationConfig.delegateTo = delegateToRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }

    await db
        .update(agentProfiles)
        .set({ delegationConfig, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}/delegation`);
}

export async function getDelegationHistory(agentId: string, limit = 20) {
    return db.query.agentDelegations.findMany({
        where: or(
            eq(agentDelegations.sourceAgentId, agentId),
            eq(agentDelegations.targetAgentId, agentId)
        ),
        orderBy: [desc(agentDelegations.startedAt)],
        limit,
    });
}

export async function getTenantAgents(tenantId: string) {
    return db.query.agentProfiles.findMany({
        where: eq(agentProfiles.tenantId, tenantId),
    });
}
