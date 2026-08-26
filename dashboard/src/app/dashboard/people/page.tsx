import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../storage/db";
import { people, agentProfiles, tenants, approvalAllowances, users } from "../../../storage/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
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

    const [rows, agents, tenant, allowanceRows, memberRows] = await Promise.all([
        db.select().from(people).where(eq(people.tenantId, tenantId)).orderBy(desc(people.lastSeenAt)),
        db.select({ id: agentProfiles.id, name: agentProfiles.name }).from(agentProfiles).where(eq(agentProfiles.tenantId, tenantId)),
        db.query.tenants.findFirst({ where: eq(tenants.id, tenantId), columns: { config: true } }),
        db
            .select()
            .from(approvalAllowances)
            .where(and(eq(approvalAllowances.tenantId, tenantId), isNull(approvalAllowances.revokedAt)))
            .orderBy(desc(approvalAllowances.createdAt)),
        // Workspace members a Telegram identity can be linked to.
        db.select({ id: users.id, name: users.name, email: users.email })
            .from(users).where(eq(users.tenantId, tenantId)),
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
        userId: r.userId ?? null,
        lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    }));

    const allowances = allowanceRows.map((r) => ({
        id: r.id,
        kind: (r.kind === "server" ? "server" : "user") as "user" | "server",
        subject: r.subject,
        label: r.label,
        createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    }));

    return (
        <PeopleClient
            people={peopleRows}
            agents={agents}
            members={memberRows.map((m) => ({ id: m.id, name: (m.name || m.email || "Member") }))}
            defaultAccess={defaultAccess}
            allowances={allowances}
        />
    );
}
