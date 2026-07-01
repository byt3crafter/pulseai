import { db } from "../../../../storage/db";
import { tenants, oauthClients, channelConnections, pairingCodes } from "../../../../storage/schema";
import { eq, and, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import TenantSettingsClient from "./TenantSettingsClient";

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
        <div className="p-8">
            {/* Header */}
            <div className="mb-8">
                <Link
                    href="/admin/tenants"
                    className="text-sm text-[#F5A524] hover:text-[#FFC24B] mb-2 inline-block"
                >
                    &larr; Back to Tenants
                </Link>
                <h1 className="text-2xl font-bold text-[#EDEDED] tracking-tight">{tenant.name}</h1>
                <div className="flex items-center gap-3 mt-1">
                    <span className="bg-[#141417] text-[#8A8A90] border border-[#242429] px-2 py-0.5 rounded-md text-xs font-mono">
                        {tenant.slug}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        tenant.status === "active" ? "bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/40" : "bg-[#F0503C]/10 text-[#F0503C] border border-[#F0503C]/40"
                    }`}>
                        {tenant.status}
                    </span>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] p-4">
                    <div className="text-xs text-[#8A8A90]">Channels</div>
                    <div className="text-lg font-semibold text-[#EDEDED]">{channels.length}</div>
                </div>
                <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] p-4">
                    <div className="text-xs text-[#8A8A90]">Pending Approvals</div>
                    <div className="text-lg font-semibold text-[#EDEDED]">
                        {pendingCount}
                        {Number(pendingCount) > 0 && (
                            <Link
                                href={`/admin/tenants/${tenantId}/approvals`}
                                className="text-sm font-normal text-[#F5A524] hover:text-[#FFC24B] ml-2"
                            >
                                View
                            </Link>
                        )}
                    </div>
                </div>
                <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] p-4">
                    <div className="text-xs text-[#8A8A90]">OAuth Client</div>
                    <div className="text-sm font-mono text-[#B5B5BA] truncate">
                        {oauthClient?.clientId ?? "None"}
                    </div>
                </div>
            </div>

            {/* Settings Form */}
            <TenantSettingsClient
                tenantId={tenantId}
                tenantName={tenant.name}
                config={config}
                clientId={oauthClient?.clientId}
            />

            {/* Approvals Link */}
            <div className="mt-8">
                <Link
                    href={`/admin/tenants/${tenantId}/approvals`}
                    className="text-sm text-[#F5A524] hover:text-[#FFC24B] font-medium"
                >
                    Manage Approvals & Allowlists &rarr;
                </Link>
            </div>
        </div>
    );
}
