import { db } from "../../../../storage/db";
import { agentProfiles, agentDelegations } from "../../../../storage/schema";
import { desc, count, eq } from "drizzle-orm";
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrchestrationOverviewPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/auth/login");

    const tenantId = (session.user as any).tenantId;
    if (!tenantId) return <div className="p-4 sm:p-5 lg:p-6 text-pulse-muted">No tenant associated with this account.</div>;

    // Get all agents with their delegation configs
    const agents = await db.query.agentProfiles.findMany({
        where: eq(agentProfiles.tenantId, tenantId),
    });

    // Get recent delegations
    const recentDelegations = await db.query.agentDelegations.findMany({
        where: eq(agentDelegations.tenantId, tenantId),
        orderBy: [desc(agentDelegations.startedAt)],
        limit: 20,
    });

    // Build agent name map
    const agentMap = new Map(agents.map((a) => [a.id, a.name]));

    // Stats
    const delegationCount = recentDelegations.length;
    const completedCount = recentDelegations.filter((d) => d.status === "completed").length;
    const failedCount = recentDelegations.filter((d) => d.status === "failed").length;

    return (
        <div className="mx-auto w-full max-w-[1060px] px-6 py-7 sm:px-10 sm:py-9">
            <div className="mb-8">
                <a href="/dashboard/agents" className="text-sm text-indigo-500 hover:text-indigo-400 mb-2 inline-block cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                    &larr; Back to Agents
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                        <NetworkIcon className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-pulse-text">Orchestration Overview</h1>
                        <p className="text-pulse-muted text-sm">Multi-agent relationships and delegation activity.</p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Total Agents" value={agents.length} />
                    <StatCard label="Recent Delegations" value={delegationCount} />
                    <StatCard label="Completed" value={completedCount} />
                    <StatCard label="Failed" value={failedCount} />
                </div>

                {/* Agent Relationships */}
                <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle">
                        <h2 className="text-lg font-semibold text-pulse-text">Agent Capabilities</h2>
                        <p className="text-sm text-pulse-muted mt-1">Delegation configuration for each agent.</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-pulse-muted border-b border-pulse-border-subtle">
                                    <th className="px-6 py-3 font-medium">Agent</th>
                                    <th className="px-6 py-3 font-medium">Can Delegate</th>
                                    <th className="px-6 py-3 font-medium">Accepts Delegation</th>
                                    <th className="px-6 py-3 font-medium">Specialization</th>
                                    <th className="px-6 py-3 font-medium">Max Depth</th>
                                    <th className="px-6 py-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agents.map((agent) => {
                                    const del = (agent.delegationConfig as any) || {};
                                    return (
                                        <tr key={agent.id} className="border-b border-pulse-border-subtle hover:bg-pulse-hover">
                                            <td className="px-6 py-3">
                                                <div className="text-sm font-medium text-pulse-text">{agent.name}</div>
                                                <div className="text-xs text-pulse-faint">{agent.modelId}</div>
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    del.canDelegate ? "bg-green-500/10 text-green-400" : "bg-pulse-panel-alt text-pulse-muted"
                                                }`}>
                                                    {del.canDelegate ? "Yes" : "No"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    del.acceptsDelegation ? "bg-green-500/10 text-green-400" : "bg-pulse-panel-alt text-pulse-muted"
                                                }`}>
                                                    {del.acceptsDelegation ? "Yes" : "No"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-sm text-pulse-muted max-w-xs">
                                                <p className="truncate">{del.specialization || "—"}</p>
                                            </td>
                                            <td className="px-6 py-3 text-sm text-pulse-muted">{del.maxDepth || 3}</td>
                                            <td className="px-6 py-3">
                                                <a href={`/dashboard/agents/${agent.id}/delegation`} className="text-xs text-indigo-500 hover:text-indigo-400 font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                                                    Configure
                                                </a>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Recent Delegations */}
                <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle">
                        <h2 className="text-lg font-semibold text-pulse-text">Recent Delegations</h2>
                        <p className="text-sm text-pulse-muted mt-1">Cross-agent task delegations across all agents.</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-pulse-muted border-b border-pulse-border-subtle">
                                    <th className="px-6 py-3 font-medium">Source</th>
                                    <th className="px-6 py-3 font-medium">Target</th>
                                    <th className="px-6 py-3 font-medium">Task</th>
                                    <th className="px-6 py-3 font-medium">Status</th>
                                    <th className="px-6 py-3 font-medium">Started</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentDelegations.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-pulse-faint">
                                            No delegations yet. Enable delegation on agents to see activity.
                                        </td>
                                    </tr>
                                )}
                                {recentDelegations.map((d) => (
                                    <tr key={d.id} className="border-b border-pulse-border-subtle hover:bg-pulse-hover">
                                        <td className="px-6 py-3 text-sm text-pulse-text-soft">{agentMap.get(d.sourceAgentId) || d.sourceAgentId.substring(0, 8)}</td>
                                        <td className="px-6 py-3 text-sm text-pulse-text-soft">{agentMap.get(d.targetAgentId) || d.targetAgentId.substring(0, 8)}</td>
                                        <td className="px-6 py-3 text-sm text-pulse-muted max-w-xs">
                                            <p className="truncate">{d.task}</p>
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                d.status === "completed" ? "bg-green-500/10 text-green-400" :
                                                d.status === "failed" ? "bg-red-500/10 text-red-400" :
                                                "bg-yellow-500/10 text-yellow-400"
                                            }`}>
                                                {d.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-xs text-pulse-faint">
                                            {d.startedAt ? new Date(d.startedAt).toLocaleString() : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle p-4">
            <p className="text-2xl font-bold text-pulse-text">{value}</p>
            <p className="text-sm text-pulse-muted">{label}</p>
        </div>
    );
}

function NetworkIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.935-2.186 2.25 2.25 0 0 0-3.935 2.186Z" />
        </svg>
    );
}
