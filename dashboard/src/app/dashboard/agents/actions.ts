"use server";

import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import { agentProfiles, workspaceRevisions } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { initializeWorkspace } from "../../../utils/workspace";

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

        // Record initial revisions in DB
        const soulContent = systemPrompt || `# Soul

You are a helpful, professional AI assistant. You communicate clearly and concisely.

## Personality
- Friendly and approachable
- Thorough but not verbose
- Honest when uncertain

## Communication Style
- Use clear, simple language
- Break complex topics into digestible parts
- Ask clarifying questions when needed
`;

        const identityContent = `# Identity

- **Name**: AI Assistant
- **Role**: General Purpose Assistant
- **Background**: A versatile AI designed to help with a wide range of tasks
`;

        const memoryContent = `# Memory

This file stores persistent memory for the agent across conversations.

## Key Facts

## Learned Preferences

## Important Context
`;

        await db.insert(workspaceRevisions).values([
            {
                agentProfileId: agent.id,
                tenantId: session.user.tenantId,
                fileName: "SOUL.md",
                content: soulContent,
                changeSummary: "Initial workspace creation",
                changedBy: session.user.id,
                revisionNumber: 1,
            },
            {
                agentProfileId: agent.id,
                tenantId: session.user.tenantId,
                fileName: "IDENTITY.md",
                content: identityContent,
                changeSummary: "Initial workspace creation",
                changedBy: session.user.id,
                revisionNumber: 1,
            },
            {
                agentProfileId: agent.id,
                tenantId: session.user.tenantId,
                fileName: "MEMORY.md",
                content: memoryContent,
                changeSummary: "Initial workspace creation",
                changedBy: session.user.id,
                revisionNumber: 1,
            },
        ]);

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
