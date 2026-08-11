import { auth } from "../../auth";
import { db } from "../../storage/db";
import { tenantBalances, channelConnections, oauthClients, globalSettings } from "../../storage/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { PageHeader, Card, StatTile } from "../../components/dashboard/ui";
import { getWorkforceStats, getRecentRuns } from "../../utils/run-queries";
import { RunStatusBadge, triggerLabel, relativeTime, formatDuration } from "../../components/dashboard/run-ui";

export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
    const session = await auth();
    const tenantId = session?.user?.tenantId;

    const [balances, channels, cliClients, stats, recentRuns] = await Promise.all([
        tenantId ? db.select().from(tenantBalances).where(eq(tenantBalances.tenantId, tenantId)).limit(1) : Promise.resolve([]),
        tenantId ? db.select().from(channelConnections).where(eq(channelConnections.tenantId, tenantId)) : Promise.resolve([]),
        tenantId ? db.select().from(oauthClients).where(eq(oauthClients.tenantId, tenantId)) : Promise.resolve([]),
        tenantId ? getWorkforceStats(tenantId) : Promise.resolve(null),
        tenantId ? getRecentRuns(tenantId, 10) : Promise.resolve([]),
    ]);

    // Billing mode gates all credits/top-up UI. "unlimited" = BYOK / dedicated (no metering).
    const rootSettings = await db.select({ config: globalSettings.config }).from(globalSettings).where(eq(globalSettings.id, "root")).limit(1);
    const billingMode = (rootSettings[0]?.config as any)?.billingMode ?? "credits";
    const showBilling = billingMode !== "unlimited";

    const credits = Number(balances[0]?.balance ?? 0);
    const estimatedTokens = Math.floor(credits * 1500).toLocaleString();
    const creditStatus = credits > 500 ? "Healthy" : credits > 0 ? "Low" : "Empty";
    const creditStatusColor = credits > 500 ? "bg-green-500/10 text-green-400 border border-green-500/30" : credits > 0 ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30";

    const activeChannels = channels.filter((c: typeof channels[0]) => c.status === "active");
    const hasTelegram = channels.some((c: typeof channels[0]) => c.channelType === "telegram");
    const telegramChannel = channels.find((c: typeof channels[0]) => c.channelType === "telegram");
    const telegramBotToken = (telegramChannel?.channelConfig as any)?.botToken;

    return (
        <div className="p-4 sm:p-5 lg:p-6 space-y-6">
            <PageHeader
                title="Workspace Overview"
                description="Your AI workforce at a glance — what's running now, what got done today, and what needs you."
            />

            {stats && (
                <section className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        <StatTile label="Workers active" value={String(stats.activeAgents)} hint="agents run today" tone="accent" href="/dashboard/agents" />
                        <StatTile label="Running now" value={String(stats.running)} tone={stats.running > 0 ? "accent" : "default"} href="/dashboard/tasks?status=running" />
                        <StatTile label="Tasks today" value={stats.runsToday.toLocaleString()} href="/dashboard/tasks" />
                        <StatTile label="Completed" value={stats.completedToday.toLocaleString()} tone="good" href="/dashboard/tasks?status=completed" />
                        <StatTile label="Failed" value={stats.failedToday.toLocaleString()} tone={stats.failedToday > 0 ? "bad" : "default"} href="/dashboard/tasks?status=failed" />
                        <StatTile
                            label="Success rate"
                            value={stats.successRate == null ? "—" : `${Math.round(stats.successRate * 100)}%`}
                            tone={stats.successRate == null ? "default" : stats.successRate >= 0.9 ? "good" : stats.successRate >= 0.6 ? "warn" : "bad"}
                            hint="completed vs failed today"
                        />
                        <StatTile label="Waiting on you" value={String(stats.waiting)} tone={stats.waiting > 0 ? "warn" : "default"} hint="queued / awaiting approval" />
                        <StatTile label="Avg task time" value={formatDuration(stats.avgDurationMs || null)} hint="completed today" />
                        <StatTile label="Tokens today" value={stats.tokensToday.toLocaleString()} />
                        <StatTile
                            label="Metered cost today"
                            value={`$${stats.costTodayUsd.toFixed(2)}`}
                            hint="excludes flat-rate models"
                        />
                    </div>

                    <Card>
                        <div className="flex items-center justify-between border-b border-pulse-border-subtle px-5 py-3">
                            <h2 className="text-sm font-semibold text-pulse-text">Recent activity</h2>
                            <Link href="/dashboard/tasks" className="text-xs font-medium text-pulse-accent hover:text-pulse-accent-hi">View all tasks</Link>
                        </div>
                        {recentRuns.length === 0 ? (
                            <p className="px-5 py-8 text-center text-sm text-pulse-muted">No activity yet. When an agent handles a message or a scheduled job runs, it appears here.</p>
                        ) : (
                            <ul className="divide-y divide-pulse-border-subtle">
                                {recentRuns.map((r) => (
                                    <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                                        <RunStatusBadge status={r.status} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm text-pulse-text">{r.title || "(untitled task)"}</p>
                                            <p className="truncate text-xs text-pulse-muted">
                                                {r.agentName || "Unassigned"} · {triggerLabel(r.trigger)}
                                                {r.durationMs != null && ` · ${formatDuration(r.durationMs)}`}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-xs text-pulse-faint">{relativeTime(r.startedAt)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                </section>
            )}

            <div className={`grid grid-cols-1 gap-6 ${showBilling ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                {/* Credit Balance Card — only in managed (credits) mode */}
                {showBilling && (
                <Card className="p-6 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <h2 className="text-sm font-medium text-pulse-muted">Available Credits</h2>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${creditStatusColor}`}>{creditStatus}</span>
                    </div>
                    <div className="mt-4">
                        <div className="text-4xl font-bold tracking-tight text-pulse-text">
                            {credits.toLocaleString()}
                            <span className="text-xl text-pulse-faint font-medium tracking-normal">.00</span>
                        </div>
                        <p className="text-sm text-pulse-muted mt-1">Est. ~{estimatedTokens} input tokens remaining</p>
                    </div>
                    <Link href="/dashboard/billing" className="mt-6 w-full block text-center bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium transition-colors motion-reduce:transition-none text-sm cursor-pointer">
                        Top Up Balance
                    </Link>
                </Card>
                )}

                {/* Active Integrations Card */}
                <Card className="p-6 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-sm font-medium text-pulse-muted">Active Integrations</h2>
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-pulse-panel-alt text-pulse-text-soft">
                            {activeChannels.length + (cliClients.length > 0 ? 1 : 0)} active
                        </span>
                    </div>
                    <div className="space-y-3 flex-1">
                        {hasTelegram ? (
                            <div className="flex items-center gap-3 p-3 bg-pulse-panel-alt rounded-lg">
                                <div className="w-9 h-9 rounded-lg bg-sky-500/15 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-sky-500" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.247-2.04 9.607c-.147.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.26 14.28 4.31 13.37c-.642-.203-.654-.642.136-.953l10.918-4.21c.536-.194 1.004.131.832.954l-.634-.914z" />
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-pulse-text">Telegram Bot</p>
                                    <p className="text-xs text-pulse-muted truncate">{telegramBotToken ? "Token connected" : "Connected"}</p>
                                </div>
                                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 p-3 bg-pulse-panel-alt rounded-lg border border-dashed border-pulse-border">
                                <div className="w-9 h-9 rounded-lg bg-pulse-hover flex items-center justify-center flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-pulse-faint">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm text-pulse-faint">No channel connected</p>
                                    <Link href="/dashboard/channels" className="text-xs text-indigo-500 hover:text-indigo-400 font-medium">Connect one →</Link>
                                </div>
                            </div>
                        )}

                        {cliClients.length > 0 && (
                            <div className="flex items-center gap-3 p-3 bg-pulse-panel-alt rounded-lg">
                                <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-pulse-text">Local CLI Auth</p>
                                    <p className="text-xs text-pulse-muted">{cliClients.length} client{cliClients.length > 1 ? "s" : ""} configured</p>
                                </div>
                                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
                            </div>
                        )}
                    </div>
                    <Link href="/dashboard/channels" className="mt-4 text-xs text-indigo-500 hover:text-indigo-400 font-medium">
                        Manage channels →
                    </Link>
                </Card>

                {/* Quick Actions Card */}
                <Card className="p-6 flex flex-col">
                    <h2 className="text-sm font-medium text-pulse-muted mb-4">Quick Actions</h2>
                    <div className="space-y-2 flex-1">
                        <Link href="/dashboard/agents" className="flex items-center gap-3 p-3 rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none group">
                            <div className="w-9 h-9 rounded-lg bg-pulse-tint flex items-center justify-center flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-pulse-accent-hi">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-pulse-text group-hover:text-pulse-accent-hi">Manage Agents</p>
                                <p className="text-xs text-pulse-muted">Configure AI personas</p>
                            </div>
                        </Link>
                        <Link href="/dashboard/settings" className="flex items-center gap-3 p-3 rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none group">
                            <div className="w-9 h-9 rounded-lg bg-pulse-panel-alt flex items-center justify-center flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-pulse-text-soft">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-pulse-text group-hover:text-pulse-accent-hi">Workspace Settings</p>
                                <p className="text-xs text-pulse-muted">Tokens, API keys & more</p>
                            </div>
                        </Link>
                        {showBilling && (
                        <Link href="/dashboard/billing" className="flex items-center gap-3 p-3 rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none group">
                            <div className="w-9 h-9 rounded-lg bg-green-500/15 flex items-center justify-center flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-green-500">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-pulse-text group-hover:text-pulse-accent-hi">View Billing</p>
                                <p className="text-xs text-pulse-muted">Credits & top-up options</p>
                            </div>
                        </Link>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
