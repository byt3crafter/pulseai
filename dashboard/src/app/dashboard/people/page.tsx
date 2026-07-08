import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../storage/db";
import { people, agentProfiles, tenants } from "../../../storage/schema";
import { eq, desc } from "drizzle-orm";
import PeopleClient from "./PeopleClient";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");
    const tenantId = session.user.tenantId;

    const [rows, agents, tenant] = await Promise.all([
        db.select().from(people).where(eq(people.tenantId, tenantId)).orderBy(desc(people.lastSeenAt)),
        db.select({ id: agentProfiles.id, name: agentProfiles.name }).from(agentProfiles).where(eq(agentProfiles.tenantId, tenantId)),
        db.query.tenants.findFirst({ where: eq(tenants.id, tenantId), columns: { config: true } }),
    ]);

    const defaultAccessRaw = (tenant?.config as any)?.default_person_access;
    const defaultAccess = ["talk", "observe", "blocked"].includes(defaultAccessRaw) ? defaultAccessRaw : "observe";

    const peopleRows = rows.map((r) => ({
        id: r.id,
        telegramUserId: r.telegramUserId,
        displayName: r.displayName,
        username: r.username,
        access: (["talk", "observe", "blocked"].includes(r.access) ? r.access : "observe") as "talk" | "observe" | "blocked",
        isApprover: r.isApprover,
        approvalMode: (r.approvalMode === "requires_approval" ? "requires_approval" : "auto") as "auto" | "requires_approval",
        allowedAgentIds: Array.isArray(r.allowedAgentIds) ? (r.allowedAgentIds as string[]) : [],
        lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    }));

    return <PeopleClient people={peopleRows} agents={agents} defaultAccess={defaultAccess} />;
}
