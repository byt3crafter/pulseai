import { db } from "../../../storage/db";
import { agentProfiles, tenantProviderKeys, channelAgents, channels } from "../../../storage/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import AgentsTableClient from "./AgentsTableClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';

    let agents: {
        id: string;
        name: string;
        modelId: string | null;
        enabled: boolean;
        dockerSandboxEnabled: boolean | null;
        workspacePath: string | null;
    }[] = [];
    let connectedProviders: string[] = [];
    let deptsByAgent: Record<string, { name: string; kind: string; role: string }[]> = {};

    if (!isNextBuild) {
        const tenantId = session.user.tenantId;

        agents = await db.select({
            id: agentProfiles.id,
            name: agentProfiles.name,
            modelId: agentProfiles.modelId,
            enabled: agentProfiles.enabled,
            dockerSandboxEnabled: agentProfiles.dockerSandboxEnabled,
            workspacePath: agentProfiles.workspacePath,
        })
            .from(agentProfiles)
            .where(eq(agentProfiles.tenantId, tenantId));

        // Single source of truth (excludes OAuth-only OpenAI, includes codex).
        const { getActiveProvidersAction } = await import("./[id]/actions");
        connectedProviders = await getActiveProvidersAction();

        // Departments / groups each agent belongs to (for the "Departments" column).
        const membershipRows = await db.select({
            agentId: channelAgents.agentProfileId,
            role: channelAgents.role,
            channelName: channels.name,
            channelKind: channels.kind,
        })
            .from(channelAgents)
            .innerJoin(channels, eq(channelAgents.channelId, channels.id))
            .where(eq(channels.tenantId, tenantId));

        for (const row of membershipRows) {
            if (!deptsByAgent[row.agentId]) deptsByAgent[row.agentId] = [];
            deptsByAgent[row.agentId].push({ name: row.channelName, kind: row.channelKind, role: row.role });
        }
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <AgentsTableClient
                agents={agents}
                deptsByAgent={deptsByAgent}
                connectedProviders={connectedProviders}
            />
        </div>
    );
}
