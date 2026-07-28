import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "../../../storage/db";
import { tenants } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Card, StatTile } from "../../../components/dashboard/ui";
import { getAnalytics } from "../../../utils/run-queries";
import { formatDuration } from "../../../components/dashboard/run-ui";
import AssumptionsBar from "./AssumptionsBar";

export const dynamic = "force-dynamic";

const DEFAULT_MINUTES = 45;

export default async function AnalyticsPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/login");
    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) return redirect("/login");

    const tRow = await db.select({ config: tenants.config }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const minutesPerTask = Number((tRow[0]?.config as any)?.roi?.minutesPerTask ?? DEFAULT_MINUTES);

    const a = await getAnalytics(tenantId, minutesPerTask, 30);
    const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const maxTrend = Math.max(1, ...a.trend.map((t) => t.tasks));

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            <PageHeader
                title="Analytics"
                description={`Your AI workforce over the last ${a.windowDays} days. Operational figures are measured; hours and money saved are estimates you control.`}
            />

            {a.totals.tasks === 0 ? (
                <Card><p className="px-5 py-12 text-center text-sm text-pulse-muted">No activity in the last {a.windowDays} days yet.</p></Card>
            ) : (
                <>
                    {/* ROI — clearly an estimate */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-pulse-text">Estimated ROI</h2>
                            <span className="rounded-full bg-pulse-panel-alt px-2 py-0.5 text-[11px] font-medium text-pulse-muted">estimate</span>
                        </div>
                        <AssumptionsBar minutesPerTask={minutesPerTask} />
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <StatTile label="Tasks completed" value={a.totals.completed.toLocaleString()} tone="good" />
                            <StatTile label="Hours saved (est.)" value={a.totals.hoursSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })} hint={`${a.minutesPerTask} min/task`} />
                            <StatTile label="Money saved (est.)" value={money(a.totals.moneySaved)} tone="accent" hint="hours × each agent's rate" />
                            <StatTile label="Metered AI cost" value={money(a.totals.meteredCostUsd)} hint="excludes flat-rate models" />
                        </div>
                        {a.agentsMissingRate > 0 && (
                            <p className="text-xs text-amber-500">
                                {a.agentsMissingRate} agent{a.agentsMissingRate === 1 ? "" : "s"} with completed work {a.agentsMissingRate === 1 ? "has" : "have"} no hourly value set, so {a.agentsMissingRate === 1 ? "it isn't" : "they aren't"} counted in money saved. Set it on each agent's profile.
                            </p>
                        )}
                    </section>

                    {/* Operational — measured */}
                    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatTile label="Total tasks" value={a.totals.tasks.toLocaleString()} />
                        <StatTile label="Failed" value={a.totals.failed.toLocaleString()} tone={a.totals.failed > 0 ? "bad" : "default"} />
                        <StatTile label="Success rate" value={a.totals.successRate == null ? "—" : `${Math.round(a.totals.successRate * 100)}%`} tone={a.totals.successRate != null && a.totals.successRate >= 0.9 ? "good" : "warn"} />
                        <StatTile label="Tokens" value={a.totals.tokens.toLocaleString()} />
                    </section>

                    {/* Trend */}
                    <Card>
                        <div className="border-b border-pulse-border-subtle px-5 py-3"><h2 className="text-sm font-semibold text-pulse-text">Activity — last 14 days</h2></div>
                        <div className="flex items-end gap-1.5 px-5 py-5" style={{ height: 140 }}>
                            {a.trend.length === 0 ? (
                                <p className="text-sm text-pulse-muted">No recent activity.</p>
                            ) : a.trend.map((t) => (
                                <div key={t.date} className="flex flex-1 flex-col items-center gap-1" title={`${t.date}: ${t.tasks} tasks, ${t.completed} completed`}>
                                    <div className="flex w-full items-end justify-center" style={{ height: 100 }}>
                                        <div className="w-full max-w-[28px] rounded-t bg-pulse-accent/70" style={{ height: `${Math.round((t.tasks / maxTrend) * 100)}%`, minHeight: 2 }} />
                                    </div>
                                    <span className="text-[10px] text-pulse-faint">{t.date.slice(5)}</span>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Per-agent breakdown */}
                    <Card>
                        <div className="border-b border-pulse-border-subtle px-5 py-3"><h2 className="text-sm font-semibold text-pulse-text">By agent</h2></div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-pulse-border-subtle text-left text-xs uppercase tracking-wider text-pulse-faint">
                                        <th className="px-4 py-3 font-medium">Agent</th>
                                        <th className="px-4 py-3 font-medium text-right">Tasks</th>
                                        <th className="px-4 py-3 font-medium text-right">Completed</th>
                                        <th className="px-4 py-3 font-medium text-right">Rate</th>
                                        <th className="px-4 py-3 font-medium text-right">Hours saved</th>
                                        <th className="px-4 py-3 font-medium text-right">Money saved</th>
                                        <th className="px-4 py-3 font-medium text-right">Metered cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-pulse-border-subtle">
                                    {a.agents.map((ag) => (
                                        <tr key={ag.agentId ?? "none"}>
                                            <td className="px-4 py-3 text-pulse-text">{ag.agentName || "Unassigned"}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-pulse-soft">{ag.tasks}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-pulse-soft">{ag.completed}</td>
                                            <td className="px-4 py-3 text-right tabular-nums">
                                                {ag.hourlyRate != null ? <span className="text-pulse-soft">${ag.hourlyRate}/hr</span> : <span className="text-amber-500">not set</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-pulse-soft">{ag.hoursSaved.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-pulse-text">{ag.hourlyRate != null ? money(ag.moneySaved) : "—"}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-pulse-muted">${ag.costUsd.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <p className="text-xs text-pulse-faint">
                        Hours and money saved are estimates: hours = completed tasks × {a.minutesPerTask} min, money = hours × each agent's hourly value.
                        Set an agent's value on its <Link href="/dashboard/agents" className="text-pulse-accent hover:underline">profile</Link>.
                    </p>
                </>
            )}
        </div>
    );
}
