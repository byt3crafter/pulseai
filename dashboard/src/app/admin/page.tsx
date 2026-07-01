import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { getAdminOverview } from "./overview-data";
import type { AttentionItem, HealthRow, TenantRow, ActivityRow } from "./overview-data";
import PulseChart from "../../components/admin/PulseChart";
import CommandPalette from "../../components/admin/CommandPalette";
import {
    ArrowTrendingUpIcon,
    ArrowTrendingDownIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

function relativeTime(iso: string | null): string {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 30_000) return "just now";
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
}

function money(n: number): string {
    return `$${n.toFixed(2)}`;
}

function TrendChip({ pct }: { pct: number | null }) {
    if (pct === null) {
        return <span className="text-xs font-medium text-[#80868B]">—</span>;
    }
    const isUp = pct >= 0;
    const Icon = isUp ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;
    const classes = isUp ? "text-[#1E8E3E] bg-[#E6F4EA]" : "text-[#C5221F] bg-[#FCE8E6]";
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${classes}`}>
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {Math.abs(pct).toFixed(1)}%
        </span>
    );
}

function Sparkline({ values }: { values: number[] }) {
    if (values.length === 0) return null;
    const w = 120;
    const h = 32;
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const step = values.length > 1 ? w / (values.length - 1) : 0;
    const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`);
    return (
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="none" aria-hidden="true" className="overflow-visible">
            <polyline points={pts.join(" ")} fill="none" stroke="#0B57D0" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
        </svg>
    );
}

function TenantStatusPill({ status }: { status: string }) {
    const normalized = status.toLowerCase();
    if (normalized === "active") {
        return <span className="inline-flex items-center rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-xs font-medium text-[#1E8E3E]">Active</span>;
    }
    if (normalized === "suspended") {
        return <span className="inline-flex items-center rounded-full bg-[#FCE8E6] px-2.5 py-0.5 text-xs font-medium text-[#C5221F]">Suspended</span>;
    }
    return <span className="inline-flex items-center rounded-full bg-[#F1F3F4] px-2.5 py-0.5 text-xs font-medium text-[#5F6368] capitalize">{status}</span>;
}

function HealthStatusPill({ status }: { status: HealthRow["status"] }) {
    if (status === "operational") {
        return <span className="inline-flex items-center rounded-full bg-[#E6F4EA] px-2.5 py-1 text-xs font-medium text-[#1E8E3E]">Operational</span>;
    }
    if (status === "degraded") {
        return <span className="inline-flex items-center rounded-full bg-[#FEF7E0] px-2.5 py-1 text-xs font-medium text-[#B06000]">Degraded</span>;
    }
    return <span className="inline-flex items-center rounded-full bg-[#F1F3F4] px-2.5 py-1 text-xs font-medium text-[#5F6368]">Unknown</span>;
}

function AttentionIcon({ severity }: { severity: AttentionItem["severity"] }) {
    if (severity === "warn") {
        return <ExclamationTriangleIcon className="w-5 h-5 text-[#B06000]" aria-hidden="true" />;
    }
    return <InformationCircleIcon className="w-5 h-5 text-[#5F6368]" aria-hidden="true" />;
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

    const allOperational = health.length > 0 && health.every((h) => h.status === "operational");
    const sparklineValues = series.map((p) => p.messages);

    return (
        <div className="p-8 lg:p-10 max-w-7xl mx-auto">
            {/* Hero header */}
            <div className="relative rounded-2xl border border-[#E1E5EA] bg-white overflow-hidden mb-8">
                <div className="h-[3px] w-full bg-gradient-to-r from-[#4285F4] via-[#9B72CB] to-[#D96570]" aria-hidden="true" />
                <div className="p-7 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-[28px] leading-tight font-semibold text-[#1F1F1F] tracking-tight">
                            Platform Overview
                        </h1>
                        <p className="text-[#5F6368] text-sm mt-1.5">
                            Live data from the Pulse Gateway platform.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <div
                            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 ${
                                allOperational ? "bg-[#E6F4EA]" : "bg-[#FEF7E0]"
                            }`}
                        >
                            <span className="relative flex h-2 w-2" aria-hidden="true">
                                {allOperational && (
                                    <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1E8E3E] opacity-75" />
                                )}
                                <span
                                    className={`relative inline-flex rounded-full h-2 w-2 ${
                                        allOperational ? "bg-[#1E8E3E]" : "bg-[#B06000]"
                                    }`}
                                />
                            </span>
                            <span className={`text-xs font-medium ${allOperational ? "text-[#1E8E3E]" : "text-[#B06000]"}`}>
                                {allOperational ? "All systems operational" : "Some systems need attention"}
                            </span>
                        </div>
                        <CommandPalette tenants={tenants.map((t) => ({ id: t.id, name: t.name }))} />
                    </div>
                </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
                {/* Revenue 30d */}
                <div className="bg-white rounded-2xl border border-[#E1E5EA] p-6 transition-shadow motion-reduce:transition-none hover:shadow-md hover:border-[#D2D6DB]">
                    <p className="text-sm font-medium text-[#5F6368]">Revenue (30d)</p>
                    <p className="text-3xl font-semibold text-[#1F1F1F] tabular-nums mt-2">{money(kpis.revenue30d)}</p>
                    <div className="mt-3">
                        <TrendChip pct={kpis.revenueTrendPct} />
                    </div>
                </div>

                {/* Margin 30d — the money metric, gradient accent */}
                <div className="p-[1.5px] rounded-2xl bg-gradient-to-br from-[#4285F4] via-[#9B72CB] to-[#D96570] transition-shadow motion-reduce:transition-none hover:shadow-md">
                    <div className="bg-white rounded-[15px] p-[22.5px] h-full">
                        <p className="text-sm font-medium text-[#5F6368]">Margin (30d)</p>
                        <p className="text-3xl font-semibold tabular-nums mt-2 bg-gradient-to-r from-[#4285F4] via-[#9B72CB] to-[#D96570] bg-clip-text text-transparent">
                            {money(kpis.margin30d)}
                        </p>
                        <p className="text-xs font-medium text-[#80868B] mt-3 tabular-nums">{kpis.marginPct.toFixed(1)}% margin</p>
                    </div>
                </div>

                {/* Messages 24h */}
                <div className="bg-white rounded-2xl border border-[#E1E5EA] p-6 transition-shadow motion-reduce:transition-none hover:shadow-md hover:border-[#D2D6DB]">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium text-[#5F6368]">Messages (24h)</p>
                            <p className="text-3xl font-semibold text-[#1F1F1F] tabular-nums mt-2">{kpis.messages24h.toLocaleString()}</p>
                        </div>
                        <Sparkline values={sparklineValues} />
                    </div>
                    <div className="mt-3">
                        <TrendChip pct={kpis.messagesTrendPct} />
                    </div>
                </div>

                {/* Credits outstanding */}
                <div className="bg-white rounded-2xl border border-[#E1E5EA] p-6 transition-shadow motion-reduce:transition-none hover:shadow-md hover:border-[#D2D6DB]">
                    <p className="text-sm font-medium text-[#5F6368]">Credits outstanding</p>
                    <p className="text-3xl font-semibold text-[#1F1F1F] tabular-nums mt-2">{kpis.creditsOutstanding.toLocaleString()}</p>
                    <p className="text-xs text-[#80868B] mt-3 tabular-nums">
                        {kpis.activeTenants}/{kpis.totalTenants} active workspaces
                    </p>
                </div>
            </div>

            {/* Main grid: Pulse chart + Needs attention */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E1E5EA] p-7">
                    <h2 className="text-sm font-semibold text-[#1F1F1F]">Platform Pulse</h2>
                    <p className="text-xs text-[#80868B] mt-0.5 mb-5">Messages &amp; revenue · last 14 days</p>
                    <PulseChart series={series} />
                </div>

                <div className="bg-white rounded-2xl border border-[#E1E5EA] p-7">
                    <h2 className="text-sm font-semibold text-[#1F1F1F] mb-4">Needs attention</h2>
                    {attention.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center gap-2 py-10">
                            <CheckCircleIcon className="w-8 h-8 text-[#1E8E3E]" aria-hidden="true" />
                            <p className="text-sm text-[#5F6368]">All clear — nothing needs attention.</p>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {attention.map((item) => (
                                <li key={item.title}>
                                    <Link
                                        href={item.href}
                                        className={`flex items-start gap-3 rounded-xl border-l-4 p-3.5 transition-colors motion-reduce:transition-none hover:bg-[#F8F9FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] ${
                                            item.severity === "warn" ? "border-[#B06000] bg-[#FEF7E0]/40" : "border-[#5F6368] bg-[#F8F9FA]"
                                        }`}
                                    >
                                        <AttentionIcon severity={item.severity} />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-[#1F1F1F]">{item.title}</p>
                                            <p className="text-xs text-[#80868B] mt-0.5 truncate">{item.detail}</p>
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Tenants table */}
            <div className="bg-white rounded-2xl border border-[#E1E5EA] overflow-hidden mb-6">
                <div className="p-7 pb-4">
                    <h2 className="text-sm font-semibold text-[#1F1F1F]">Workspaces</h2>
                    <p className="text-xs text-[#80868B] mt-0.5">Sorted by 30-day spend</p>
                </div>
                {tenants.length === 0 ? (
                    <p className="px-7 pb-8 text-sm text-[#80868B]">No workspaces yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-t border-[#E1E5EA] text-xs text-[#80868B]">
                                    <th className="text-left font-medium px-7 py-3">Workspace</th>
                                    <th className="text-right font-medium px-4 py-3">Balance</th>
                                    <th className="text-right font-medium px-4 py-3">Spend (30d)</th>
                                    <th className="text-right font-medium px-4 py-3">Margin (30d)</th>
                                    <th className="text-right font-medium px-7 py-3">Last active</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tenants.map((t: TenantRow) => {
                                    const marginOfSpendPct = t.spend30d > 0 ? (t.margin30d / t.spend30d) * 100 : 0;
                                    return (
                                        <tr key={t.id} className="border-t border-[#E1E5EA] hover:bg-[#F8F9FA] transition-colors motion-reduce:transition-none">
                                            <td className="px-7 py-3.5">
                                                <Link href="/admin/tenants" className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] rounded">
                                                    <span className="text-sm font-medium text-[#1F1F1F] group-hover:text-[#0B57D0] truncate">{t.name}</span>
                                                    <TenantStatusPill status={t.status} />
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3.5 text-right tabular-nums text-[#1F1F1F]">{t.balance.toLocaleString()}</td>
                                            <td className="px-4 py-3.5 text-right tabular-nums text-[#1F1F1F]">{money(t.spend30d)}</td>
                                            <td className="px-4 py-3.5 text-right tabular-nums">
                                                <span className="text-[#1F1F1F]">{money(t.margin30d)}</span>{" "}
                                                <span className="text-xs text-[#80868B]">({marginOfSpendPct.toFixed(0)}%)</span>
                                            </td>
                                            <td className="px-7 py-3.5 text-right tabular-nums text-[#5F6368]">{relativeTime(t.lastActiveAt)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Bottom grid: Live activity + System health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-[#E1E5EA] p-7">
                    <h2 className="text-sm font-semibold text-[#1F1F1F] mb-4">Live Activity</h2>
                    {activity.length === 0 ? (
                        <p className="text-sm text-[#80868B]">No recent activity.</p>
                    ) : (
                        <ul className="space-y-1">
                            {activity.map((row: ActivityRow) => (
                                <li key={row.id} className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-[#F8F9FA] transition-colors motion-reduce:transition-none">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="w-9 h-9 rounded-full bg-[#F0F4F9] flex items-center justify-center flex-shrink-0">
                                            <ChatBubbleLeftRightIcon className="w-4 h-4 text-[#5F6368]" aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-[#1F1F1F] truncate">{row.contactName || "Unknown"}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="inline-flex items-center rounded-full bg-[#F1F3F4] px-2 py-0.5 text-[11px] font-medium text-[#5F6368] capitalize">
                                                    {row.channelType}
                                                </span>
                                                <span className="text-xs text-[#80868B] truncate">{row.tenantName || "—"}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-xs text-[#80868B] flex-shrink-0 tabular-nums">{relativeTime(row.updatedAt)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-[#E1E5EA] p-7">
                    <h2 className="text-sm font-semibold text-[#1F1F1F] mb-4">System Health</h2>
                    <div className="space-y-1">
                        {health.map((item: HealthRow) => (
                            <div key={item.name} className="flex items-center justify-between p-3 rounded-xl hover:bg-[#F8F9FA] transition-colors motion-reduce:transition-none">
                                <div>
                                    <p className="text-sm font-medium text-[#1F1F1F]">{item.name}</p>
                                    <p className="text-xs text-[#80868B]">{item.detail}</p>
                                </div>
                                <HealthStatusPill status={item.status} />
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-[#80868B] mt-4">Checked live</p>
                </div>
            </div>
        </div>
    );
}
