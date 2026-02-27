"use server";

import { auth } from "../../../../auth";
import { db } from "../../../../storage/db";
import { agentProfiles, workspaceRevisions, tenantProviderKeys, globalSettings } from "../../../../storage/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { readWorkspaceFile, writeWorkspaceFile } from "../../../../utils/workspace";
import { redirect } from "next/navigation";

export async function updateWorkspaceFileAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;
    const fileName = formData.get("fileName") as string;
    const content = formData.get("content") as string;
    const summary = formData.get("summary") as string;

    const ALLOWED_FILES = new Set(["SOUL.md", "IDENTITY.md", "MEMORY.md", "HEARTBEAT.md", "TOOLS.md", "USER.md"]);
    if (!agentId || !fileName || content === null) {
        return { success: false, message: "Missing required fields." };
    }
    if (!ALLOWED_FILES.has(fileName)) {
        return { success: false, message: "Invalid file name." };
    }

    // Verify agent belongs to tenant
    const agent = await db.query.agentProfiles.findFirst({
        where: and(
            eq(agentProfiles.id, agentId),
            eq(agentProfiles.tenantId, session.user.tenantId)
        ),
    });

    if (!agent) {
        return { success: false, message: "Agent not found." };
    }

    try {
        // Write to disk
        await writeWorkspaceFile(session.user.tenantId, agentId, fileName, content);

        // Get next revision number
        const lastRevision = await db.query.workspaceRevisions.findFirst({
            where: and(
                eq(workspaceRevisions.agentProfileId, agentId),
                eq(workspaceRevisions.fileName, fileName)
            ),
            orderBy: [desc(workspaceRevisions.revisionNumber)],
        });
        const nextRevision = (lastRevision?.revisionNumber ?? 0) + 1;

        // Record revision in DB
        await db.insert(workspaceRevisions).values({
            agentProfileId: agentId,
            tenantId: session.user.tenantId,
            fileName,
            content,
            changeSummary: summary || `Updated ${fileName}`,
            changedBy: session.user.id,
            revisionNumber: nextRevision,
        });

        // If SOUL.md, sync to legacy systemPrompt
        if (fileName === "SOUL.md") {
            await db.update(agentProfiles)
                .set({ systemPrompt: content, updatedAt: new Date() })
                .where(eq(agentProfiles.id, agentId));
        }

        revalidatePath(`/dashboard/agents/${agentId}`);
        return { success: true, message: `${fileName} saved (revision #${nextRevision}).` };
    } catch (error) {
        console.error("Failed to update workspace file:", error);
        return { success: false, message: "Failed to save file." };
    }
}

export async function updateAgentModelAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;
    const modelId = formData.get("modelId") as string;

    if (!agentId || !modelId) {
        return { success: false, message: "Missing required fields." };
    }

    const agent = await db.query.agentProfiles.findFirst({
        where: and(
            eq(agentProfiles.id, agentId),
            eq(agentProfiles.tenantId, session.user.tenantId)
        ),
    });

    if (!agent) {
        return { success: false, message: "Agent not found." };
    }

    await db.update(agentProfiles)
        .set({ modelId, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: "Model updated." };
}

export async function getRevisionsAction(agentId: string, fileName: string) {
    const session = await auth();
    if (!session?.user?.tenantId) return [];

    const revisions = await db.select()
        .from(workspaceRevisions)
        .where(
            and(
                eq(workspaceRevisions.agentProfileId, agentId),
                eq(workspaceRevisions.fileName, fileName),
                eq(workspaceRevisions.tenantId, session.user.tenantId)
            )
        )
        .orderBy(desc(workspaceRevisions.revisionNumber));

    return revisions.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        changeSummary: r.changeSummary,
        revisionNumber: r.revisionNumber,
        createdAt: r.createdAt?.toISOString() ?? "",
    }));
}

export async function restoreRevisionAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;
    const revisionId = formData.get("revisionId") as string;

    if (!agentId || !revisionId) {
        return { success: false, message: "Missing required fields." };
    }

    const revision = await db.query.workspaceRevisions.findFirst({
        where: and(
            eq(workspaceRevisions.id, revisionId),
            eq(workspaceRevisions.tenantId, session.user.tenantId)
        ),
    });

    if (!revision) {
        return { success: false, message: "Revision not found." };
    }

    // Write restored content to disk
    await writeWorkspaceFile(session.user.tenantId, agentId, revision.fileName, revision.content);

    // Record new revision
    const lastRevision = await db.query.workspaceRevisions.findFirst({
        where: and(
            eq(workspaceRevisions.agentProfileId, agentId),
            eq(workspaceRevisions.fileName, revision.fileName)
        ),
        orderBy: [desc(workspaceRevisions.revisionNumber)],
    });
    const nextRevision = (lastRevision?.revisionNumber ?? 0) + 1;

    await db.insert(workspaceRevisions).values({
        agentProfileId: agentId,
        tenantId: session.user.tenantId,
        fileName: revision.fileName,
        content: revision.content,
        changeSummary: `Restored from revision #${revision.revisionNumber}`,
        changedBy: session.user.id,
        revisionNumber: nextRevision,
    });

    // Sync legacy systemPrompt if SOUL.md
    if (revision.fileName === "SOUL.md") {
        await db.update(agentProfiles)
            .set({ systemPrompt: revision.content, updatedAt: new Date() })
            .where(eq(agentProfiles.id, agentId));
    }

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: `Restored from revision #${revision.revisionNumber}.` };
}

export async function deleteAgentAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;

    if (!agentId) {
        return { success: false, message: "Missing agent ID." };
    }

    const agent = await db.query.agentProfiles.findFirst({
        where: and(
            eq(agentProfiles.id, agentId),
            eq(agentProfiles.tenantId, session.user.tenantId)
        ),
    });

    if (!agent) {
        return { success: false, message: "Agent not found." };
    }

    // Cascading delete handles workspace_revisions via FK
    await db.delete(agentProfiles).where(eq(agentProfiles.id, agentId));

    // Note: Workspace directory cleanup on disk is not critical; orphaned dirs are harmless
    revalidatePath("/dashboard/agents");
    redirect("/dashboard/agents");
}

/**
 * Get the list of provider IDs that have active API keys for the current tenant.
 * Checks: 1) tenant BYOK keys, 2) global admin keys from global_settings.
 * Env var fallback (tier 3) is backend-only and not checked here.
 */
export async function getActiveProvidersAction(): Promise<string[]> {
    const session = await auth();
    if (!session?.user?.tenantId) return [];

    const activeProviders = new Set<string>();

    // Tier 1: Tenant-specific BYOK keys
    const tenantKeys = await db.select({ provider: tenantProviderKeys.provider })
        .from(tenantProviderKeys)
        .where(
            and(
                eq(tenantProviderKeys.tenantId, session.user.tenantId),
                eq(tenantProviderKeys.isActive, true)
            )
        );

    for (const key of tenantKeys) {
        activeProviders.add(key.provider);
    }

    // Tier 2: Global admin-configured keys
    const rootSettings = await db.query.globalSettings.findFirst({
        where: eq(globalSettings.id, "root"),
    });

    if (rootSettings?.anthropicApiKeyHash) activeProviders.add("anthropic");
    if (rootSettings?.openaiApiKeyHash) activeProviders.add("openai");

    return Array.from(activeProviders);
}

export async function updateToolPolicyAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;
    const allowStr = formData.get("allow") as string;
    const denyStr = formData.get("deny") as string;

    if (!agentId) {
        return { success: false, message: "Missing required fields." };
    }

    const agent = await db.query.agentProfiles.findFirst({
        where: and(
            eq(agentProfiles.id, agentId),
            eq(agentProfiles.tenantId, session.user.tenantId)
        ),
    });

    if (!agent) {
        return { success: false, message: "Agent not found." };
    }

    const parseList = (str: string) => {
        if (!str || !str.trim()) return [];
        return str.split(",").map((s) => s.trim()).filter(Boolean);
    };

    const toolPolicy = {
        allow: parseList(allowStr || ""),
        deny: parseList(denyStr || ""),
    };

    await db.update(agentProfiles)
        .set({ toolPolicy, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: "Tool policy updated." };
}

export async function updateSandboxConfigAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;
    if (!agentId) return { success: false, message: "Missing required fields." };

    const agent = await db.query.agentProfiles.findFirst({
        where: and(
            eq(agentProfiles.id, agentId),
            eq(agentProfiles.tenantId, session.user.tenantId)
        ),
    });

    if (!agent) return { success: false, message: "Agent not found." };

    const sandboxConfig = {
        mode: formData.get("mode") || "off",
        scope: formData.get("scope") || "session",
        workspaceAccess: formData.get("workspaceAccess") || "none",
        docker: {
            image: formData.get("image") || undefined,
            memoryLimit: formData.get("memoryLimit") || undefined,
            cpuLimit: formData.get("cpuLimit") || undefined,
            setupCommand: formData.get("setupCommand") || undefined,
        }
    };

    await db.update(agentProfiles)
        .set({ sandboxConfig, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: "Sandbox configuration saved." };
}

export async function updateHeartbeatConfigAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "Unauthorized." };

    const agentId = formData.get("agentId") as string;
    if (!agentId) return { success: false, message: "Missing required fields." };

    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, session.user.tenantId))
    });

    if (!agent) return { success: false, message: "Agent not found." };

    const heartbeatConfig = {
        enabled: formData.get("enabled") === "true",
        every: parseInt(formData.get("every") as string) || 3600,
        activeHours: {
            enabled: formData.get("activeHoursEnabled") === "true",
            start: formData.get("activeHoursStart") as string || "09:00",
            end: formData.get("activeHoursEnd") as string || "17:00",
            timezone: formData.get("activeHoursTimezone") as string || "UTC"
        }
    };

    await db.update(agentProfiles)
        .set({ heartbeatConfig, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: "Heartbeat configuration saved. Note: It may take up to 60 seconds to reload the scheduler." };
}

