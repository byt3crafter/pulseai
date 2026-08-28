import { redirect } from "next/navigation";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { requireTenant } from "../../../utils/tenant-auth";
import { db } from "../../../storage/db";
import { auditLogs } from "../../../storage/schema";
import { PageHeader } from "../../../components/dashboard/ui";
import AuditViewClient from "./AuditViewClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function TenantAuditPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; action?: string; actor?: string }>;
}) {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return redirect("/login");
    const tenantId = tenantCheck.tenantId;

    const params = await searchParams;
    const action = params.action?.trim() || "";
    const actor = params.actor?.trim() || "";
    const page = Math.max(0, parseInt(params.page || "0", 10) || 0);

    const conditions = [eq(auditLogs.tenantId, tenantId)];
    if (action) conditions.push(ilike(auditLogs.action, `%${action}%`));
    if (actor) conditions.push(ilike(auditLogs.actorEmail, `%${actor}%`));
    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
        db
            .select()
            .from(auditLogs)
            .where(where)
            .orderBy(desc(auditLogs.createdAt))
            .limit(PAGE_SIZE)
            .offset(page * PAGE_SIZE),
        db
            .select({ c: sql<number>`count(*)` })
            .from(auditLogs)
            .where(where),
    ]);

    const total = Number(countResult[0]?.c || 0);

    const logs = rows.map((r) => ({
        id: r.id,
        actorEmail: r.actorEmail,
        actorRole: r.actorRole,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        summary: r.summary,
        createdAt: r.createdAt ? r.createdAt.toISOString() : "",
    }));

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-page mx-auto">
            <PageHeader
                title="Audit Log"
                description="Everything that happened in this workspace — who changed what, and when."
            />
            <AuditViewClient
                logs={logs}
                total={total}
                page={page}
                pageSize={PAGE_SIZE}
                action={action}
                actor={actor}
            />
        </div>
    );
}
