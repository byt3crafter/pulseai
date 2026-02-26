"use server";

import { db } from "../../../../../storage/db";
import { agentScripts } from "../../../../../storage/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../../../utils/tenant-auth";

export async function getAgentScripts(agentId: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];

    return db.query.agentScripts.findMany({
        where: eq(agentScripts.agentId, agentId),
        orderBy: [desc(agentScripts.updatedAt)],
    });
}

export async function deleteScript(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return;

    const scriptId = formData.get("scriptId") as string;
    const agentId = formData.get("agentId") as string;
    await db.delete(agentScripts).where(eq(agentScripts.id, scriptId));
    revalidatePath(`/dashboard/agents/${agentId}/scripts`);
}
