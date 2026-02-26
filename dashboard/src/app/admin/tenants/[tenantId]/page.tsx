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
        <div className="p-8 max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <Link
                    href="/admin/tenants"
                    className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block"
                >
                    &larr; Back to Tenants
                </Link>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{tenant.name}</h1>
                <div className="flex items-center gap-3 mt-1">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md text-xs font-mono">
                        {tenant.slug}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        tenant.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}>
                        {tenant.status}
                    </span>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div className="text-xs text-gray-500">Channels</div>
                    <div className="text-lg font-semibold text-gray-900">{channels.length}</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div className="text-xs text-gray-500">Pending Approvals</div>
                    <div className="text-lg font-semibold text-gray-900">
                        {pendingCount}
                        {Number(pendingCount) > 0 && (
                            <Link
                                href={`/admin/tenants/${tenantId}/approvals`}
                                className="text-sm font-normal text-indigo-600 hover:text-indigo-700 ml-2"
                            >
                                View
                            </Link>
                        )}
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div className="text-xs text-gray-500">OAuth Client</div>
                    <div className="text-sm font-mono text-gray-700 truncate">
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
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                    Manage Approvals & Allowlists &rarr;
                </Link>
            </div>
        </div>
    );
}
