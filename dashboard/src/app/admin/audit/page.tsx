import { db } from "../../../storage/db";
import { auditLogs } from "../../../storage/schema";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import AuditClient from "./AuditClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AuditPage({
    searchParams,
}: {
    searchParams: Promise<{ action?: string; q?: string; page?: string }>;
}) {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") redirect("/admin/login");

    const params = await searchParams;
    const action = params.action?.trim() || "";
    const q = params.q?.trim() || "";
    const page = Math.max(0, parseInt(params.page || "0", 10) || 0);

    const conditions = [];
    if (action) conditions.push(eq(auditLogs.action, action));
    if (q) conditions.push(ilike(auditLogs.actorEmail, `%${q}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult, distinctActions] = await Promise.all([
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
        db
            .selectDistinct({ action: auditLogs.action })
            .from(auditLogs)
            .orderBy(auditLogs.action),
    ]);

    const total = Number(countResult[0]?.c || 0);

    const logs = rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        actorId: r.actorId,
        actorEmail: r.actorEmail,
        actorRole: r.actorRole,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        summary: r.summary,
        ip: r.ip,
        createdAt: r.createdAt ? r.createdAt.toISOString() : "",
    }));

    return (
        <AuditClient
            logs={logs}
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            action={action}
            q={q}
            actions={distinctActions.map((a) => a.action)}
        />
    );
}
