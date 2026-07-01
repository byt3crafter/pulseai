import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { getAdminOverview } from "./overview-data";
import type { AttentionItem, HealthRow, TenantRow, ActivityRow } from "./overview-data";
import PulseChart from "../../components/admin/PulseChart";

export const dynamic = "force-dynamic";

function relativeTime(iso: string | null): string {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 30_000) return "NOW";
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return `${sec}S AGO`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}M AGO`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}H AGO`;
    const day = Math.floor(hr / 24);
    return `${day}D AGO`;
}

function formatUsd(n: number): string {
    return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

function marginClass(n: number): string {
    return n < 0 ? "text-[#F0503C]" : "text-[#3FB950]";
}

function TrendLine({ pct }: { pct: number | null }) {
    if (pct === null) {
        return <span className="text-[11px] text-[#5A5A61]">— vs prior period</span>;
    }
    const up = pct >= 0;
    return (
        <span className={`text-[11px] tabular-nums ${up ? "text-[#3FB950]" : "text-[#F0503C]"}`}>
            {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% vs prior
        </span>
    );
}

function TenantStatusBadge({ status }: { status: string }) {
    const normalized = status.toLowerCase();
    if (normalized === "active") {
        return (
            <span className="text-[#3FB950] border border-[#3FB950]/40 bg-[#3FB950]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] rounded">
                Active
            </span>
        );
    }
    if (normalized === "suspended") {
        return (
            <span className="text-[#F0503C] border border-[#F0503C]/40 bg-[#F0503C]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] rounded">
                Suspended
            </span>
        );
    }
    return (
        <span className="text-[#5A5A61] border border-[#242429] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] rounded">
            {status}
        </span>
    );
}

function HealthStatus({ status }: { status: HealthRow["status"] }) {
    if (status === "operational") {
        return (
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[#3FB950]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" aria-hidden="true" />
                Operational
            </span>
        );
    }
    if (status === "degraded") {
        return (
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[#8B5CF6]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]" aria-hidden="true" />
                Degraded
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[#5A5A61]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5A5A61]" aria-hidden="true" />
            Unknown
        </span>
    );
}

function Panel({
    label,
    meta,
    children,
    className = "",
}: {
    label: string;
    meta?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={`border border-[#242429] bg-[#0C0C0E] rounded-md overflow-hidden flex flex-col ${className}`}>
            <div className="px-4 py-2.5 border-b border-[#242429] flex items-center justify-between gap-2 flex-shrink-0">
                <span className="text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]">{label}</span>
                {meta && <span className="text-[11px] uppercase tracking-[0.08em] text-[#5A5A61]">{meta}</span>}
            </div>
            <div className="p-4 flex-1">{children}</div>
        </div>
    );
}

export default async function AdminOverviewPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") redirect("/admin/login");

    const data = await getAdminOverview();
    const { kpis, series, tenants, attention, activity, health } = data;

    return (
        <div className="p-5 space-y-4">
            {/* Title row */}
            <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]">Platform &middot; Overview</p>
                <p className="text-[11px] text-[#5A5A61] mt-0.5">Live figures from the Pulse Gateway platform.</p>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-[#242429] border border-[#242429] rounded-md overflow-hidden">
                <div className="bg-[#0C0C0E] p-4">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]">Revenue 30D</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1.5 text-[#EDEDED]">{formatUsd(kpis.revenue30d)}</p>
                    <div className="mt-1">
                        <TrendLine pct={kpis.revenueTrendPct} />
                    </div>
                </div>

                <div className="bg-[#0C0C0E] p-4">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]">Margin 30D</p>
                    <p className={`text-2xl font-semibold tabular-nums mt-1.5 ${marginClass(kpis.margin30d)}`}>
                        {formatUsd(kpis.margin30d)}
                    </p>
                    <p className="text-[11px] text-[#5A5A61] mt-1">cost {formatUsd(kpis.cost30d)}</p>
                </div>

                <div className="bg-[#0C0C0E] p-4">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]">Margin %</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1.5 text-[#8B5CF6]">{kpis.marginPct.toFixed(1)}%</p>
                    <p className="text-[11px] text-[#5A5A61] mt-1">of revenue</p>
                </div>

                <div className="bg-[#0C0C0E] p-4">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]">Messages 24H</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1.5 text-[#EDEDED]">{kpis.messages24h.toLocaleString()}</p>
                    <div className="mt-1">
                        <TrendLine pct={kpis.messagesTrendPct} />
                    </div>
                </div>

                <div className="bg-[#0C0C0E] p-4">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]">Active Tenants</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1.5 text-[#EDEDED]">
                        {kpis.activeTenants}/{kpis.totalTenants}
                    </p>
                    <p className="text-[11px] text-[#5A5A61] mt-1">workspaces</p>
                </div>

                <div className="bg-[#0C0C0E] p-4">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]">Credits Out</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1.5 text-[#EDEDED]">{kpis.creditsOutstanding.toLocaleString()}</p>
                    <p className="text-[11px] text-[#5A5A61] mt-1">outstanding balance</p>
                </div>
            </div>

            {/* Platform Pulse */}
            <Panel label="Platform Pulse" meta="Messages & Revenue · 14D">
                <PulseChart series={series} />
            </Panel>

            {/* Workspaces + Needs attention */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Panel label="Workspaces" meta="Sorted by 30D spend" className="lg:col-span-2">
                    <div className="-m-4">
                        {tenants.length === 0 ? (
                            <p className="p-4 text-[13px] uppercase tracking-[0.06em] text-[#5A5A61]">No workspaces yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                    <thead>
                                        <tr className="text-[11px] uppercase tracking-[0.08em] text-[#5A5A61]">
                                            <th className="text-left font-normal px-4 py-2">Workspace</th>
                                            <th className="text-right font-normal px-4 py-2">Balance</th>
                                            <th className="text-right font-normal px-4 py-2">Spend 30D</th>
                                            <th className="text-right font-normal px-4 py-2">Margin 30D</th>
                                            <th className="text-right font-normal px-4 py-2">Last Active</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tenants.map((t: TenantRow) => {
                                            const marginOfSpendPct = t.spend30d > 0 ? (t.margin30d / t.spend30d) * 100 : 0;
                                            return (
                                                <tr
                                                    key={t.id}
                                                    className="border-t border-[#1C1C1F] hover:bg-[#101012] transition-colors motion-reduce:transition-none"
                                                >
                                                    <td className="px-4 py-2.5">
                                                        <Link
                                                            href="/admin/tenants"
                                                            className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#8B5CF6] rounded"
                                                        >
                                                            <span className="text-[#EDEDED] truncate">{t.name}</span>
                                                            <TenantStatusBadge status={t.status} />
                                                        </Link>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-[#EDEDED]">
                                                        {t.balance.toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-[#EDEDED]">
                                                        {formatUsd(t.spend30d)}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums">
                                                        <span className={marginClass(t.margin30d)}>{formatUsd(t.margin30d)}</span>{" "}
                                                        <span className="text-[11px] text-[#5A5A61]">({marginOfSpendPct.toFixed(0)}%)</span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-[#5A5A61]">
                                                        {relativeTime(t.lastActiveAt)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </Panel>

                <Panel label="Needs Attention">
                    {attention.length === 0 ? (
                        <div className="flex items-center gap-2 py-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" aria-hidden="true" />
                            <span className="text-[11px] uppercase tracking-[0.1em] text-[#3FB950]">All Clear</span>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {attention.map((item: AttentionItem) => (
                                <li key={item.title}>
                                    <Link
                                        href={item.href}
                                        className={`block pl-3 py-1.5 border-l-2 hover:bg-[#101012] transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#8B5CF6] rounded-sm ${
                                            item.severity === "warn" ? "border-[#8B5CF6]" : "border-[#33333B]"
                                        }`}
                                    >
                                        <span
                                            className={`text-[10px] uppercase tracking-[0.1em] ${
                                                item.severity === "warn" ? "text-[#8B5CF6]" : "text-[#5A5A61]"
                                            }`}
                                        >
                                            {item.severity}
                                        </span>
                                        <p className="text-[#EDEDED] text-[13px] mt-0.5">{item.title}</p>
                                        <p className="text-[11px] text-[#5A5A61] mt-0.5 truncate">{item.detail}</p>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>

            {/* Live activity + System health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel label="Live Activity">
                    {activity.length === 0 ? (
                        <p className="text-[13px] uppercase tracking-[0.06em] text-[#5A5A61]">No recent activity.</p>
                    ) : (
                        <ul className="space-y-1">
                            {activity.map((row: ActivityRow) => (
                                <li
                                    key={row.id}
                                    className="flex items-center justify-between gap-3 py-1.5 -mx-1 px-1 rounded hover:bg-[#101012] transition-colors motion-reduce:transition-none"
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-[10px] uppercase tracking-[0.06em] text-[#8A8A90] border border-[#242429] rounded px-1.5 py-0.5 flex-shrink-0">
                                            {row.channelType}
                                        </span>
                                        <span className="text-[13px] text-[#EDEDED] truncate">{row.contactName || "UNKNOWN"}</span>
                                        <span className="text-[11px] text-[#5A5A61] truncate">{row.tenantName || "—"}</span>
                                    </div>
                                    <span className="text-[11px] text-[#5A5A61] flex-shrink-0 tabular-nums">
                                        {relativeTime(row.updatedAt)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                <Panel label="System Health" meta="Checked Live">
                    <div className="space-y-1">
                        {health.map((item: HealthRow) => (
                            <div
                                key={item.name}
                                className="flex items-center justify-between py-1.5 -mx-1 px-1 rounded hover:bg-[#101012] transition-colors motion-reduce:transition-none"
                            >
                                <div>
                                    <p className="text-[13px] text-[#EDEDED]">{item.name}</p>
                                    <p className="text-[11px] text-[#5A5A61]">{item.detail}</p>
                                </div>
                                <HealthStatus status={item.status} />
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>
        </div>
    );
}
