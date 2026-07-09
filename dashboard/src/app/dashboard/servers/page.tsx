import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../storage/db";
import { servers, agentProfiles } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import ServersTableClient from "./ServersTableClient";

export const dynamic = "force-dynamic";

export default async function ServersPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");
    const tenantId = session.user.tenantId;

    const [rows, agents] = await Promise.all([
        db.select().from(servers).where(eq(servers.tenantId, tenantId)),
        db.select({ id: agentProfiles.id, name: agentProfiles.name }).from(agentProfiles).where(eq(agentProfiles.tenantId, tenantId)),
    ]);

    const agentNameById = new Map(agents.map((a) => [a.id, a.name] as const));

    const list = rows.map((r) => {
        const allowedAgentIds = Array.isArray(r.allowedAgentIds) ? (r.allowedAgentIds as string[]) : [];
        return {
            id: r.id,
            name: r.name,
            host: r.host,
            port: r.port,
            environment: r.environment,
            safetyMode: r.safetyMode,
            enabled: r.enabled,
            agentNames: allowedAgentIds.map((id) => agentNameById.get(id)).filter((n): n is string => !!n),
        };
    });

    return <ServersTableClient servers={list} />;
}
