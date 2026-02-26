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
    if (!tenantId) return <div className="p-8 text-slate-500">No tenant associated with this account.</div>;

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
        <div className="p-8 max-w-5xl mx-auto">
            <div className="mb-8">
                <a href="/dashboard/agents" className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">
                    &larr; Back to Agents
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                        <NetworkIcon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Orchestration Overview</h1>
                        <p className="text-slate-500 text-sm">Multi-agent relationships and delegation activity.</p>
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
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Agent Capabilities</h2>
                        <p className="text-sm text-slate-500 mt-1">Delegation configuration for each agent.</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
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
                                        <tr key={agent.id} className="border-b border-slate-50 hover:bg-slate-50">
                                            <td className="px-6 py-3">
                                                <div className="text-sm font-medium text-slate-900">{agent.name}</div>
                                                <div className="text-xs text-slate-400">{agent.modelId}</div>
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    del.canDelegate ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                                                }`}>
                                                    {del.canDelegate ? "Yes" : "No"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    del.acceptsDelegation ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                                                }`}>
                                                    {del.acceptsDelegation ? "Yes" : "No"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-sm text-slate-500 max-w-xs">
                                                <p className="truncate">{del.specialization || "—"}</p>
                                            </td>
                                            <td className="px-6 py-3 text-sm text-slate-500">{del.maxDepth || 3}</td>
                                            <td className="px-6 py-3">
                                                <a href={`/dashboard/agents/${agent.id}/delegation`} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
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
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Recent Delegations</h2>
                        <p className="text-sm text-slate-500 mt-1">Cross-agent task delegations across all agents.</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
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
                                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400">
                                            No delegations yet. Enable delegation on agents to see activity.
                                        </td>
                                    </tr>
                                )}
                                {recentDelegations.map((d) => (
                                    <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-6 py-3 text-sm text-slate-700">{agentMap.get(d.sourceAgentId) || d.sourceAgentId.substring(0, 8)}</td>
                                        <td className="px-6 py-3 text-sm text-slate-700">{agentMap.get(d.targetAgentId) || d.targetAgentId.substring(0, 8)}</td>
                                        <td className="px-6 py-3 text-sm text-slate-500 max-w-xs">
                                            <p className="truncate">{d.task}</p>
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                d.status === "completed" ? "bg-green-50 text-green-700" :
                                                d.status === "failed" ? "bg-red-50 text-red-700" :
                                                "bg-yellow-50 text-yellow-700"
                                            }`}>
                                                {d.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-xs text-slate-400">
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
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
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
