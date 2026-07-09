import { auth } from "../../../../../auth";
import { redirect, notFound } from "next/navigation";
import { db } from "../../../../../storage/db";
import { servers, agentProfiles } from "../../../../../storage/schema";
import { and, eq } from "drizzle-orm";
import ServerEditor from "../../ServerEditor";

export const dynamic = "force-dynamic";

export default async function EditServerPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");
    const tenantId = session.user.tenantId;

    const [row] = await db.select().from(servers)
        .where(and(eq(servers.id, id), eq(servers.tenantId, tenantId)))
        .limit(1);
    if (!row) return notFound();

    const agents = await db.select({ id: agentProfiles.id, name: agentProfiles.name })
        .from(agentProfiles)
        .where(eq(agentProfiles.tenantId, tenantId));

    const server = {
        id: row.id,
        name: row.name,
        host: row.host,
        port: row.port,
        username: row.username,
        authType: (row.authType === "password" ? "password" : "key") as "key" | "password",
        environment: (["production", "staging", "dev"].includes(row.environment) ? row.environment : "dev") as "production" | "staging" | "dev",
        safetyMode: (["observe", "safe", "full"].includes(row.safetyMode) ? row.safetyMode : "observe") as "observe" | "safe" | "full",
        instructions: row.instructions || "",
        allowedAgentIds: Array.isArray(row.allowedAgentIds) ? (row.allowedAgentIds as string[]) : [],
        approvalMode: (["off", "writes", "all"].includes(row.approvalMode) ? row.approvalMode : "off") as "off" | "writes" | "all",
        enabled: row.enabled,
    };

    return <ServerEditor agents={agents} server={server} />;
}
