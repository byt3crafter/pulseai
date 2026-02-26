"use server";

import { db } from "../../../../../storage/db";
import { agentScripts } from "../../../../../storage/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getAgentScripts(agentId: string) {
    return db.query.agentScripts.findMany({
        where: eq(agentScripts.agentId, agentId),
        orderBy: [desc(agentScripts.updatedAt)],
    });
}

export async function deleteScript(formData: FormData) {
    const scriptId = formData.get("scriptId") as string;
    const agentId = formData.get("agentId") as string;
    await db.delete(agentScripts).where(eq(agentScripts.id, scriptId));
    revalidatePath(`/dashboard/agents/${agentId}/scripts`);
}
