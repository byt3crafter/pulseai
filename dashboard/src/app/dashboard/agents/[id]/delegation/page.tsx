import { saveDelegationConfig, getDelegationHistory, getTenantAgents } from "./actions";
import { db } from "../../../../../storage/db";
import { agentProfiles } from "../../../../../storage/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AgentDelegationPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: agentId } = await params;

    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const agent = await db.query.agentProfiles.findFirst({ where: eq(agentProfiles.id, agentId) });
    if (!agent) return notFound();

    const delConfig = (agent.delegationConfig as any) || {};
    const history = await getDelegationHistory(agentId);
    const tenantAgents = await getTenantAgents(agent.tenantId);
    const otherAgents = tenantAgents.filter((a) => a.id !== agentId);

    return (
        <div className="p-8">
            <div className="mb-8">
                <a href={`/dashboard/agents/${agentId}`} className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">
                    &larr; Back to {agent.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                        <LinkIcon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Delegation — {agent.name}</h1>
                        <p className="text-slate-500 text-sm">Configure multi-agent delegation for this agent.</p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Delegation Config */}
                <form action={saveDelegationConfig} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Delegation Settings</h2>
                    </div>
                    <div className="p-6 space-y-5">
                        <input type="hidden" name="agentId" value={agentId} />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="canDelegate"
                                    defaultChecked={delConfig.canDelegate || false}
                                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                />
                                <div>
                                    <span className="text-sm font-medium text-slate-900">Can Delegate to Others</span>
                                    <p className="text-xs text-slate-500">This agent can call other agents via delegate_to_agent tool.</p>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="acceptsDelegation"
                                    defaultChecked={delConfig.acceptsDelegation || false}
                                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                />
                                <div>
                                    <span className="text-sm font-medium text-slate-900">Accepts Delegation</span>
                                    <p className="text-xs text-slate-500">Other agents can delegate tasks to this agent.</p>
                                </div>
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Specialization</label>
                            <textarea
                                name="specialization"
                                rows={2}
                                defaultValue={delConfig.specialization || ""}
                                placeholder="e.g., ERPNext specialist — handles invoices, customers, and stock queries"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                            />
                            <p className="text-xs text-slate-400 mt-1">Description shown to other agents for delegation routing.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Max Delegation Depth</label>
                                <input
                                    type="number"
                                    name="maxDepth"
                                    min={1}
                                    max={10}
                                    defaultValue={delConfig.maxDepth || 3}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                                <p className="text-xs text-slate-400 mt-1">Prevents infinite delegation chains.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Allowed Targets (optional)</label>
                                <input
                                    type="text"
                                    name="delegateTo"
                                    defaultValue={(delConfig.delegateTo || []).join(", ")}
                                    placeholder="Leave empty to allow all agents"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                                <p className="text-xs text-slate-400 mt-1">Comma-separated agent IDs. Empty = all.</p>
                            </div>
                        </div>

                        {otherAgents.length > 0 && (
                            <div className="bg-slate-50 rounded-lg p-4">
                                <p className="text-xs font-medium text-slate-600 mb-2">Other agents in this tenant:</p>
                                <div className="space-y-1">
                                    {otherAgents.map((a) => {
                                        const aDel = (a.delegationConfig as any) || {};
                                        return (
                                            <div key={a.id} className="flex items-center gap-2 text-xs text-slate-500">
                                                <span className={`w-2 h-2 rounded-full ${aDel.acceptsDelegation ? "bg-green-400" : "bg-slate-300"}`} />
                                                <span className="font-mono text-[10px] text-slate-400">{a.id.substring(0, 8)}...</span>
                                                <span className="text-slate-700">{a.name}</span>
                                                {aDel.specialization && <span className="text-slate-400">— {aDel.specialization}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors text-sm">
                                Save Delegation Config
                            </button>
                        </div>
                    </div>
                </form>

                {/* Delegation History */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Delegation History</h2>
                        <p className="text-sm text-slate-500 mt-1">{history.length} recent delegations</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                                    <th className="px-6 py-3 font-medium">Direction</th>
                                    <th className="px-6 py-3 font-medium">Task</th>
                                    <th className="px-6 py-3 font-medium">Status</th>
                                    <th className="px-6 py-3 font-medium">Started</th>
                                    <th className="px-6 py-3 font-medium">Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400">
                                            No delegations yet. Enable delegation and the agent can use delegate_to_agent tool.
                                        </td>
                                    </tr>
                                )}
                                {history.map((d) => {
                                    const isOutgoing = d.sourceAgentId === agentId;
                                    return (
                                        <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50">
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    isOutgoing ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                                                }`}>
                                                    {isOutgoing ? "Outgoing" : "Incoming"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-sm text-slate-700 max-w-xs">
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
                                            <td className="px-6 py-3 text-sm text-slate-500 max-w-xs">
                                                <p className="truncate">{d.result || "—"}</p>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

function LinkIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.935-2.186 2.25 2.25 0 0 0-3.935 2.186Z" />
        </svg>
    );
}
