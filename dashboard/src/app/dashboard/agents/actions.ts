"use server";

import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import { agentProfiles, workspaceRevisions } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { initializeWorkspace, WORKSPACE_DEFAULTS } from "../../../utils/workspace";

export async function createAgentProfileAction(formData: FormData) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId) {
            return { success: false, message: "Unauthorized. No tenant context found." };
        }

        const name = formData.get("name") as string;
        const systemPrompt = formData.get("systemPrompt") as string;
        const modelId = (formData.get("modelId") as string) || "claude-sonnet-4-20250514";
        const dockerSandboxEnabled = formData.get("dockerSandboxEnabled") === "true";

        if (!name) {
            return { success: false, message: "Agent name is required." };
        }

        // Insert the agent profile
        const [agent] = await db.insert(agentProfiles).values({
            tenantId: session.user.tenantId,
            name,
            systemPrompt,
            modelId,
            dockerSandboxEnabled,
        }).returning();

        // Initialize workspace directory with seed files
        const workspacePath = await initializeWorkspace(
            session.user.tenantId,
            agent.id,
            systemPrompt || undefined
        );

        // Record initial revisions in DB for all workspace files
        const tenantId = session.user.tenantId;
        const userId = session.user.id;
        const files = { ...WORKSPACE_DEFAULTS };
        if (systemPrompt) {
            files["SOUL.md"] = systemPrompt;
        }

        await db.insert(workspaceRevisions).values(
            Object.entries(files).map(([fileName, content]) => ({
                agentProfileId: agent.id,
                tenantId,
                fileName,
                content,
                changeSummary: "Initial workspace creation",
                changedBy: userId,
                revisionNumber: 1,
            }))
        );

        // Update agent with workspace path
        await db.update(agentProfiles)
            .set({ workspacePath, updatedAt: new Date() })
            .where(eq(agentProfiles.id, agent.id));

        revalidatePath("/dashboard/agents");
        return { success: true, message: "Agent Profile created successfully." };
    } catch (error) {
        console.error("Failed to create agent profile:", error);
        return { success: false, message: "An error occurred while creating the profile." };
    }
}
