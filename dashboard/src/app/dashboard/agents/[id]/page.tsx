import { db } from "../../../../storage/db";
import { agentProfiles, workspaceRevisions } from "../../../../storage/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "../../../../auth";
import { redirect, notFound } from "next/navigation";
import { readWorkspaceFile, workspaceExists } from "../../../../utils/workspace";
import { getActiveProvidersAction } from "./actions";
import AgentWorkspaceClient from "./AgentWorkspaceClient";

export default async function AgentDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    const { id } = await params;

    const agent = await db.query.agentProfiles.findFirst({
        where: and(
            eq(agentProfiles.id, id),
            eq(agentProfiles.tenantId, session.user.tenantId)
        ),
    });

    if (!agent) {
        notFound();
    }

    // Read workspace files (may be null if workspace not yet initialized)
    const hasWorkspace = await workspaceExists(session.user.tenantId, agent.id);
    const soulContent = hasWorkspace
        ? await readWorkspaceFile(session.user.tenantId, agent.id, "SOUL.md")
        : agent.systemPrompt;
    const identityContent = hasWorkspace
        ? await readWorkspaceFile(session.user.tenantId, agent.id, "IDENTITY.md")
        : null;
    const memoryContent = hasWorkspace
        ? await readWorkspaceFile(session.user.tenantId, agent.id, "MEMORY.md")
        : null;
    const heartbeatContent = hasWorkspace
        ? await readWorkspaceFile(session.user.tenantId, agent.id, "HEARTBEAT.md")
        : null;
    const toolsGuidanceContent = hasWorkspace
        ? await readWorkspaceFile(session.user.tenantId, agent.id, "TOOLS.md")
        : null;
    const userPrefsContent = hasWorkspace
        ? await readWorkspaceFile(session.user.tenantId, agent.id, "USER.md")
        : null;

    // Get revision counts and active providers in parallel
    const [revisions, activeProviders] = await Promise.all([
        db.select()
            .from(workspaceRevisions)
            .where(eq(workspaceRevisions.agentProfileId, agent.id)),
        getActiveProvidersAction(),
    ]);

    const soulRevisionCount = revisions.filter(r => r.fileName === "SOUL.md").length;
    const identityRevisionCount = revisions.filter(r => r.fileName === "IDENTITY.md").length;
    const memoryRevisionCount = revisions.filter(r => r.fileName === "MEMORY.md").length;
    const heartbeatRevisionCount = revisions.filter(r => r.fileName === "HEARTBEAT.md").length;
    const toolsGuidanceRevisionCount = revisions.filter(r => r.fileName === "TOOLS.md").length;
    const userPrefsRevisionCount = revisions.filter(r => r.fileName === "USER.md").length;

    return (
        <AgentWorkspaceClient
            agent={{
                id: agent.id,
                name: agent.name,
                modelId: agent.modelId ?? "claude-sonnet-4-20250514",
                dockerSandboxEnabled: agent.dockerSandboxEnabled ?? false,
                selfConfigEnabled: agent.selfConfigEnabled ?? false,
                hasWorkspace,
                toolPolicy: agent.toolPolicy,
                sandboxConfig: agent.sandboxConfig,
                heartbeatConfig: agent.heartbeatConfig,
            }}
            soulContent={soulContent ?? ""}
            identityContent={identityContent ?? ""}
            memoryContent={memoryContent ?? ""}
            heartbeatContent={heartbeatContent ?? ""}
            toolsGuidanceContent={toolsGuidanceContent ?? ""}
            userPrefsContent={userPrefsContent ?? ""}
            soulRevisionCount={soulRevisionCount}
            identityRevisionCount={identityRevisionCount}
            memoryRevisionCount={memoryRevisionCount}
            heartbeatRevisionCount={heartbeatRevisionCount}
            toolsGuidanceRevisionCount={toolsGuidanceRevisionCount}
            userPrefsRevisionCount={userPrefsRevisionCount}
            activeProviders={activeProviders}
        />
    );
}
