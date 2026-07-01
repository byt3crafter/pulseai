"use client";

import { getModelDisplayName, getProviderName } from "../../../utils/models";
import { ui, PageHeader, Panel } from "../../../components/admin/ui";

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
        <div className={ui.page}>
            <PageHeader title="Usage Analytics" subtitle="Platform-wide usage metrics and cost analysis." />

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[#242429] border border-[#242429] rounded-md overflow-hidden">
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Tenants by Cost */}
                <Panel label="Top Tenants by Cost">
                    <div className="space-y-4">
                        {topTenants.length === 0 && (
                            <p className="text-[13px] text-[#5A5A61]">No usage data yet.</p>
                        )}
                        {topTenants.map((t) => {
                            const pct = (t.totalCost / maxTenantCost) * 100;
                            return (
                                <div key={t.tenantId}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[13px] font-medium text-[#B5B5BA]">
                                            {t.tenantName}
                                        </span>
                                        <span className="text-[11px] text-[#8A8A90] tabular-nums">
                                            ${t.totalCost.toFixed(4)} &middot;{" "}
                                            {t.requestCount} requests
                                        </span>
                                    </div>
                                    <div className="w-full bg-[#1C1C1F] rounded-full h-2.5">
                                        <div
                                            className="bg-[#8B5CF6] h-2.5 rounded-full transition-all"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Panel>

                {/* Model Distribution */}
                <Panel label="Model Distribution">
                    <div className="space-y-4">
                        {modelDistribution.length === 0 && (
                            <p className="text-[13px] text-[#5A5A61]">No usage data yet.</p>
                        )}
                        {modelDistribution.map((m) => {
                            const pct =
                                (m.totalTokens / maxModelTokens) * 100;
                            return (
                                <div key={m.model}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[13px] font-medium text-[#B5B5BA]">
                                            <span className="text-[11px] text-[#5A5A61] mr-1">{getProviderName(m.model)}</span>
                                            {getModelDisplayName(m.model)}
                                        </span>
                                        <span className="text-[11px] text-[#8A8A90] tabular-nums">
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
                </Panel>
            </div>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-[#0C0C0E] p-4">
            <p className={ui.labelMicro}>{label}</p>
            <p className="text-2xl font-semibold tabular-nums mt-1.5 text-[#EDEDED]">{value}</p>
        </div>
    );
}
