"use server";

import { db } from "../../../../../storage/db";
import { agentScripts } from "../../../../../storage/schema";
import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../../../utils/tenant-auth";

export async function getAgentScripts(agentId: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    return db.query.agentScripts.findMany({
        where: and(eq(agentScripts.agentId, agentId), eq(agentScripts.tenantId, tenantId)),
        orderBy: [desc(agentScripts.updatedAt)],
    });
}

export async function deleteScript(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    const scriptId = formData.get("scriptId") as string;
    const agentId = formData.get("agentId") as string;
    await db.delete(agentScripts).where(and(eq(agentScripts.id, scriptId), eq(agentScripts.tenantId, tenantId)));
    revalidatePath(`/dashboard/agents/${agentId}/scripts`);
}
