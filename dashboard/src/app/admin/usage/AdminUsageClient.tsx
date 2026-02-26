"use client";

import { getModelDisplayName, getProviderName } from "../../../utils/models";

interface TenantUsage {
    tenantId: string;
    tenantName: string;
    totalCost: number;
    totalTokens: number;
    requestCount: number;
}

interface ModelUsage {
    model: string;
    totalCost: number;
    totalTokens: number;
    requestCount: number;
}

interface Props {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    totalCredits: number;
    totalRequests: number;
    topTenants: TenantUsage[];
    modelDistribution: ModelUsage[];
}

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
}

export default function AdminUsageClient({
    totalInputTokens,
    totalOutputTokens,
    totalCost,
    totalCredits,
    totalRequests,
    topTenants,
    modelDistribution,
}: Props) {
    const maxTenantCost = Math.max(...topTenants.map((t) => t.totalCost), 1);
    const maxModelTokens = Math.max(
        ...modelDistribution.map((m) => m.totalTokens),
        1
    );

    return (
        <div className="p-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                    Usage Analytics
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Platform-wide usage metrics and cost analysis.
                </p>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                <StatCard
                    label="Total Tokens"
                    value={formatNumber(totalInputTokens + totalOutputTokens)}
                />
                <StatCard
                    label="Input Tokens"
                    value={formatNumber(totalInputTokens)}
                />
                <StatCard
                    label="Output Tokens"
                    value={formatNumber(totalOutputTokens)}
                />
                <StatCard
                    label="Total Cost"
                    value={`$${totalCost.toFixed(2)}`}
                />
                <StatCard
                    label="API Requests"
                    value={formatNumber(totalRequests)}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Tenants by Cost */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h2 className="text-sm font-semibold text-gray-900">
                            Top Tenants by Cost
                        </h2>
                    </div>
                    <div className="p-6 space-y-4">
                        {topTenants.length === 0 && (
                            <p className="text-sm text-gray-400">
                                No usage data yet.
                            </p>
                        )}
                        {topTenants.map((t) => {
                            const pct = (t.totalCost / maxTenantCost) * 100;
                            return (
                                <div key={t.tenantId}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-gray-700">
                                            {t.tenantName}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            ${t.totalCost.toFixed(4)} &middot;{" "}
                                            {t.requestCount} requests
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                                        <div
                                            className="bg-indigo-500 h-2.5 rounded-full transition-all"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Model Distribution */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h2 className="text-sm font-semibold text-gray-900">
                            Model Distribution
                        </h2>
                    </div>
                    <div className="p-6 space-y-4">
                        {modelDistribution.length === 0 && (
                            <p className="text-sm text-gray-400">
                                No usage data yet.
                            </p>
                        )}
                        {modelDistribution.map((m) => {
                            const pct =
                                (m.totalTokens / maxModelTokens) * 100;
                            return (
                                <div key={m.model}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-gray-700">
                                            <span className="text-xs text-gray-400 mr-1">{getProviderName(m.model)}</span>
                                            {getModelDisplayName(m.model)}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {formatNumber(m.totalTokens)} tokens
                                            &middot; ${m.totalCost.toFixed(4)}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                                        <div
                                            className="bg-purple-500 h-2.5 rounded-full transition-all"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {label}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
    );
}
