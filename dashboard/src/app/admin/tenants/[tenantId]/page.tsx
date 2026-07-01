import { db } from "../../../../storage/db";
import { tenants, oauthClients, channelConnections, pairingCodes } from "../../../../storage/schema";
import { eq, and, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import TenantSettingsClient from "./TenantSettingsClient";
import { ui, PageHeader, Panel, Badge } from "../../../../components/admin/ui";

export default async function TenantDetailPage({
    params,
}: {
    params: Promise<{ tenantId: string }>;
}) {
    const { tenantId } = await params;

    // Bypass during build phase
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) {
        return <div>Building Component</div>;
    }

    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
    });

    if (!tenant) {
        notFound();
    }

    const oauthClient = await db.query.oauthClients.findFirst({
        where: eq(oauthClients.tenantId, tenantId),
    });

    const channels = await db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.tenantId, tenantId));

    const [pendingResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(pairingCodes)
        .where(and(eq(pairingCodes.tenantId, tenantId), eq(pairingCodes.status, "pending")));

    const pendingCount = pendingResult?.count ?? 0;
    const config = (tenant.config as Record<string, any>) || {};

    return (
        <div className={ui.page}>
            {/* Header */}
            <div>
                <Link href="/admin/tenants" className={`${ui.btnGhost} inline-block mb-2`}>
                    &larr; Back to Tenants
                </Link>
                <PageHeader
                    title={tenant.name}
                    subtitle={`Slug: ${tenant.slug}`}
                    action={
                        <Badge variant={tenant.status === "active" ? "success" : "danger"}>
                            <span className="capitalize">{tenant.status}</span>
                        </Badge>
                    }
                />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Panel>
                    <div className={ui.labelMicro}>Channels</div>
                    <div className="text-lg font-semibold text-pulse-text mt-1.5">{channels.length}</div>
                </Panel>
                <Panel>
                    <div className={ui.labelMicro}>Pending Approvals</div>
                    <div className="text-lg font-semibold text-pulse-text mt-1.5 flex items-center gap-2">
                        {pendingCount}
                        {Number(pendingCount) > 0 && (
                            <Link
                                href={`/admin/tenants/${tenantId}/approvals`}
                                className={`${ui.btnGhost} text-[13px] font-normal`}
                            >
                                View
                            </Link>
                        )}
                    </div>
                </Panel>
                <Panel>
                    <div className={ui.labelMicro}>OAuth Client</div>
                    <div className="text-[13px] font-mono text-pulse-text-soft truncate mt-1.5">
                        {oauthClient?.clientId ?? "None"}
                    </div>
                </Panel>
            </div>

            {/* Settings Form */}
            <TenantSettingsClient
                tenantId={tenantId}
                tenantName={tenant.name}
                config={config}
                clientId={oauthClient?.clientId}
            />

            {/* Approvals Link */}
            <div>
                <Link
                    href={`/admin/tenants/${tenantId}/approvals`}
                    className={ui.btnGhost}
                >
                    Manage Approvals & Allowlists &rarr;
                </Link>
            </div>
        </div>
    );
}
