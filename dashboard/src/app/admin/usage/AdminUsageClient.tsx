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
                <h1 className="text-2xl font-bold text-[#EDEDED] tracking-tight">
                    Usage Analytics
                </h1>
                <p className="text-sm text-[#8A8A90] mt-1">
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
                <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#242429]">
                        <h2 className="text-sm font-semibold text-[#EDEDED]">
                            Top Tenants by Cost
                        </h2>
                    </div>
                    <div className="p-6 space-y-4">
                        {topTenants.length === 0 && (
                            <p className="text-sm text-[#5A5A61]">
                                No usage data yet.
                            </p>
                        )}
                        {topTenants.map((t) => {
                            const pct = (t.totalCost / maxTenantCost) * 100;
                            return (
                                <div key={t.tenantId}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-[#B5B5BA]">
                                            {t.tenantName}
                                        </span>
                                        <span className="text-xs text-[#8A8A90]">
                                            ${t.totalCost.toFixed(4)} &middot;{" "}
                                            {t.requestCount} requests
                                        </span>
                                    </div>
                                    <div className="w-full bg-[#1C1C1F] rounded-full h-2.5">
                                        <div
                                            className="bg-[#F5A524] h-2.5 rounded-full transition-all"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Model Distribution */}
                <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#242429]">
                        <h2 className="text-sm font-semibold text-[#EDEDED]">
                            Model Distribution
                        </h2>
                    </div>
                    <div className="p-6 space-y-4">
                        {modelDistribution.length === 0 && (
                            <p className="text-sm text-[#5A5A61]">
                                No usage data yet.
                            </p>
                        )}
                        {modelDistribution.map((m) => {
                            const pct =
                                (m.totalTokens / maxModelTokens) * 100;
                            return (
                                <div key={m.model}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-[#B5B5BA]">
                                            <span className="text-xs text-[#5A5A61] mr-1">{getProviderName(m.model)}</span>
                                            {getModelDisplayName(m.model)}
                                        </span>
                                        <span className="text-xs text-[#8A8A90]">
                                            {formatNumber(m.totalTokens)} tokens
                                            &middot; ${m.totalCost.toFixed(4)}
                                        </span>
                                    </div>
                                    <div className="w-full bg-[#1C1C1F] rounded-full h-2.5">
                                        <div
                                            className="bg-[#A78BFA] h-2.5 rounded-full transition-all"
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
        <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] p-5">
            <p className="text-xs font-medium text-[#8A8A90] uppercase tracking-wide">
                {label}
            </p>
            <p className="text-2xl font-bold text-[#EDEDED] mt-1">{value}</p>
        </div>
    );
}
