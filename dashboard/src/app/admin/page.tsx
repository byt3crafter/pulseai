import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { getAdminOverview } from "./overview-data";
import type { AttentionItem, HealthRow, TenantRow, ActivityRow } from "./overview-data";
import PulseChart from "../../components/admin/PulseChart";
import { ui, PageHeader, Panel, Badge, StatusDot } from "../../components/admin/ui";

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
    return n < 0 ? "text-pulse-loss" : "text-pulse-profit";
}

// Soft floating KPI card — subtle border, rounded, gentle hover (AI-studio style).
const kpiCard =
    "bg-pulse-panel border border-pulse-border-subtle rounded-xl p-4 transition-colors motion-reduce:transition-none hover:border-pulse-border";

function TrendLine({ pct }: { pct: number | null }) {
    if (pct === null) {
        return <span className="text-[11px] text-pulse-faint">— vs prior period</span>;
    }
    const up = pct >= 0;
    return (
        <span className={`text-[11px] tabular-nums ${up ? "text-pulse-profit" : "text-pulse-loss"}`}>
            {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% vs prior
        </span>
    );
}

function TenantStatusBadge({ status }: { status: string }) {
    const normalized = status.toLowerCase();
    if (normalized === "active") {
        return <Badge variant="success">Active</Badge>;
    }
    if (normalized === "suspended") {
        return <Badge variant="danger">Suspended</Badge>;
    }
    return <Badge variant="neutral">{status}</Badge>;
}

function HealthStatus({ status }: { status: HealthRow["status"] }) {
    if (status === "operational") {
        return <StatusDot variant="success">Operational</StatusDot>;
    }
    if (status === "degraded") {
        return <StatusDot variant="warn">Degraded</StatusDot>;
    }
    return <StatusDot variant="neutral">Unknown</StatusDot>;
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
        <div className={ui.page}>
            <PageHeader title="Platform Overview" subtitle="Live figures from the Pulse Gateway platform." />

            {/* KPI strip — soft floating cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <div className={kpiCard}>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-pulse-muted">Revenue 30D</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1.5 text-pulse-text">{formatUsd(kpis.revenue30d)}</p>
                    <div className="mt-1">
                        <TrendLine pct={kpis.revenueTrendPct} />
                    </div>
                </div>

                <div className={kpiCard}>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-pulse-muted">Margin 30D</p>
                    <p className={`text-2xl font-semibold tabular-nums mt-1.5 ${marginClass(kpis.margin30d)}`}>
                        {formatUsd(kpis.margin30d)}
                    </p>
                    <p className="text-[11px] text-pulse-faint mt-1">cost {formatUsd(kpis.cost30d)}</p>
                </div>

                <div className={kpiCard}>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-pulse-muted">Margin %</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1.5 text-pulse-accent">{kpis.marginPct.toFixed(1)}%</p>
                    <p className="text-[11px] text-pulse-faint mt-1">of revenue</p>
                </div>

                <div className={kpiCard}>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-pulse-muted">Messages 24H</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1.5 text-pulse-text">{kpis.messages24h.toLocaleString()}</p>
                    <div className="mt-1">
                        <TrendLine pct={kpis.messagesTrendPct} />
                    </div>
                </div>

                <div className={kpiCard}>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-pulse-muted">Active Tenants</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1.5 text-pulse-text">
                        {kpis.activeTenants}/{kpis.totalTenants}
                    </p>
                    <p className="text-[11px] text-pulse-faint mt-1">workspaces</p>
                </div>

                <div className={kpiCard}>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-pulse-muted">Credits Out</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1.5 text-pulse-text">{kpis.creditsOutstanding.toLocaleString()}</p>
                    <p className="text-[11px] text-pulse-faint mt-1">outstanding balance</p>
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
                            <p className="p-4 text-[13px] uppercase tracking-[0.06em] text-pulse-faint">No workspaces yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className={ui.table}>
                                    <thead>
                                        <tr>
                                            <th className={ui.th}>Workspace</th>
                                            <th className={ui.thRight}>Balance</th>
                                            <th className={ui.thRight}>Spend 30D</th>
                                            <th className={ui.thRight}>Margin 30D</th>
                                            <th className={ui.thRight}>Last Active</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tenants.map((t: TenantRow) => {
                                            const marginOfSpendPct = t.spend30d > 0 ? (t.margin30d / t.spend30d) * 100 : 0;
                                            return (
                                                <tr key={t.id} className={ui.row}>
                                                    <td className={ui.td}>
                                                        <Link
                                                            href="/admin/tenants"
                                                            className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pulse-accent rounded"
                                                        >
                                                            <span className="text-[13px] font-medium text-pulse-text truncate">{t.name}</span>
                                                            <TenantStatusBadge status={t.status} />
                                                        </Link>
                                                    </td>
                                                    <td className={ui.tdRight}>{t.balance.toLocaleString()}</td>
                                                    <td className={ui.tdRight}>{formatUsd(t.spend30d)}</td>
                                                    <td className={ui.tdRight}>
                                                        <span className={marginClass(t.margin30d)}>{formatUsd(t.margin30d)}</span>{" "}
                                                        <span className="text-[11px] text-pulse-faint">({marginOfSpendPct.toFixed(0)}%)</span>
                                                    </td>
                                                    <td className={ui.tdRight}>
                                                        <span className="text-pulse-faint">{relativeTime(t.lastActiveAt)}</span>
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
                            <span className="w-1.5 h-1.5 rounded-full bg-pulse-profit" aria-hidden="true" />
                            <span className="text-[11px] uppercase tracking-[0.1em] text-pulse-profit">All Clear</span>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {attention.map((item: AttentionItem) => (
                                <li key={item.title}>
                                    <Link
                                        href={item.href}
                                        className={`block pl-3 py-1.5 border-l-2 hover:bg-pulse-panel-alt transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pulse-accent rounded-sm ${
                                            item.severity === "warn" ? "border-pulse-accent" : "border-pulse-border-strong"
                                        }`}
                                    >
                                        <span
                                            className={`text-[10px] uppercase tracking-[0.1em] ${
                                                item.severity === "warn" ? "text-pulse-accent" : "text-pulse-faint"
                                            }`}
                                        >
                                            {item.severity}
                                        </span>
                                        <p className="text-pulse-text text-[13px] mt-0.5">{item.title}</p>
                                        <p className="text-[11px] text-pulse-faint mt-0.5 truncate">{item.detail}</p>
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
                        <p className="text-[13px] uppercase tracking-[0.06em] text-pulse-faint">No recent activity.</p>
                    ) : (
                        <ul className="space-y-1">
                            {activity.map((row: ActivityRow) => (
                                <li
                                    key={row.id}
                                    className="flex items-center justify-between gap-3 py-1.5 -mx-1 px-1 rounded hover:bg-pulse-panel-alt transition-colors motion-reduce:transition-none"
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-[10px] uppercase tracking-[0.06em] text-pulse-muted border border-pulse-border rounded px-1.5 py-0.5 flex-shrink-0">
                                            {row.channelType}
                                        </span>
                                        <span className="text-[13px] text-pulse-text truncate">{row.contactName || "UNKNOWN"}</span>
                                        <span className="text-[11px] text-pulse-faint truncate">{row.tenantName || "—"}</span>
                                    </div>
                                    <span className="text-[11px] text-pulse-faint flex-shrink-0 tabular-nums">
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
                                className="flex items-center justify-between py-1.5 -mx-1 px-1 rounded hover:bg-pulse-panel-alt transition-colors motion-reduce:transition-none"
                            >
                                <div>
                                    <p className="text-[13px] text-pulse-text">{item.name}</p>
                                    <p className="text-[11px] text-pulse-faint">{item.detail}</p>
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
