import { db } from "../../../storage/db";
import {
    mcpServers,
    agentProfiles,
    agentProfileMcpBindings,
    tenantProviderKeys,
} from "../../../storage/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import McpClient from "./McpClient";

export default async function McpPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");

    const tenantId = session.user.tenantId;

    const [servers, agents, bindings] = await Promise.all([
        db
            .select()
            .from(mcpServers)
            .where(eq(mcpServers.tenantId, tenantId)),
        db
            .select({ id: agentProfiles.id, name: agentProfiles.name })
            .from(agentProfiles)
            .where(eq(agentProfiles.tenantId, tenantId)),
        db
            .select()
            .from(agentProfileMcpBindings),
    ]);

    // Does this tenant have a Z.ai key? Drives the one-click "Connect Z.ai tools".
    const [zaiKey] = await db.select({ id: tenantProviderKeys.id })
        .from(tenantProviderKeys)
        .where(and(
            eq(tenantProviderKeys.tenantId, tenantId),
            eq(tenantProviderKeys.provider, "zai"),
            eq(tenantProviderKeys.isActive, true),
        ))
        .limit(1);
    const hasZaiKey = !!zaiKey;

    // Filter bindings to only include ones for this tenant's servers
    const serverIds = new Set(servers.map((s) => s.id));
    const tenantBindings = bindings.filter((b) => serverIds.has(b.mcpServerId));

    const serializedServers = servers.map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        authHeaders: s.authHeaders as Record<string, string>,
        status: s.status,
        createdAt: s.createdAt?.toISOString() ?? "",
    }));

    const serializedAgents = agents.map((a) => ({
        id: a.id,
        name: a.name,
    }));

    const serializedBindings = tenantBindings.map((b) => ({
        id: b.id,
        agentProfileId: b.agentProfileId,
        mcpServerId: b.mcpServerId,
    }));

    return (
        <McpClient
            servers={serializedServers}
            agents={serializedAgents}
            bindings={serializedBindings}
            hasZaiKey={hasZaiKey}
        />
    );
}
