import { saveDelegationConfig, getDelegationHistory, getTenantAgents } from "./actions";
import { db } from "../../../../../storage/db";
import { agentProfiles } from "../../../../../storage/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { InfoTip } from "../../../../../components/dashboard/ui";

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
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-8">
                <a href={`/dashboard/agents/${agentId}`} className="text-sm text-indigo-500 hover:text-indigo-400 mb-2 inline-block transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                    &larr; Back to {agent.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                        <LinkIcon className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <h1 className="text-2xl font-bold text-pulse-text">Delegation — {agent.name}</h1>
                            <InfoTip text="Example: a lead agent routes a billing question to the Finance agent." />
                        </div>
                        <p className="text-pulse-muted text-sm">Let this agent hand a task to another agent it's allowed to call.</p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Delegation Config */}
                <form action={saveDelegationConfig} className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle">
                        <h2 className="text-lg font-semibold text-pulse-text">Delegation Settings</h2>
                    </div>
                    <div className="p-6 space-y-5">
                        <input type="hidden" name="agentId" value={agentId} />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="canDelegate"
                                    defaultChecked={delConfig.canDelegate || false}
                                    className="w-4 h-4 text-indigo-600 border-pulse-border rounded focus:ring-indigo-500 cursor-pointer bg-pulse-panel"
                                />
                                <div>
                                    <span className="text-sm font-medium text-pulse-text">Can Delegate to Others</span>
                                    <p className="text-xs text-pulse-muted">This agent can call other agents via delegate_to_agent tool.</p>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="acceptsDelegation"
                                    defaultChecked={delConfig.acceptsDelegation || false}
                                    className="w-4 h-4 text-indigo-600 border-pulse-border rounded focus:ring-indigo-500 cursor-pointer bg-pulse-panel"
                                />
                                <div>
                                    <span className="text-sm font-medium text-pulse-text">Accepts Delegation</span>
                                    <p className="text-xs text-pulse-muted">Other agents can delegate tasks to this agent.</p>
                                </div>
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Specialization</label>
                            <textarea
                                name="specialization"
                                rows={2}
                                defaultValue={delConfig.specialization || ""}
                                placeholder="e.g., ERPNext specialist — handles invoices, customers, and stock queries"
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                            />
                            <p className="text-xs text-pulse-faint mt-1">Description shown to other agents for delegation routing.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1">Max Delegation Depth</label>
                                <input
                                    type="number"
                                    name="maxDepth"
                                    min={1}
                                    max={10}
                                    defaultValue={delConfig.maxDepth || 3}
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                />
                                <p className="text-xs text-pulse-faint mt-1">Prevents infinite delegation chains.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1">Allowed Targets (optional)</label>
                                <input
                                    type="text"
                                    name="delegateTo"
                                    defaultValue={(delConfig.delegateTo || []).join(", ")}
                                    placeholder="Leave empty to allow all agents"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                />
                                <p className="text-xs text-pulse-faint mt-1">Comma-separated agent IDs. Empty = all.</p>
                            </div>
                        </div>

                        {otherAgents.length > 0 && (
                            <div className="bg-pulse-panel-alt rounded-lg p-4">
                                <p className="text-xs font-medium text-pulse-muted mb-2">Other agents in this tenant:</p>
                                <div className="space-y-1">
                                    {otherAgents.map((a) => {
                                        const aDel = (a.delegationConfig as any) || {};
                                        return (
                                            <div key={a.id} className="flex items-center gap-2 text-xs text-pulse-muted">
                                                <span className={`w-2 h-2 rounded-full ${aDel.acceptsDelegation ? "bg-green-400" : "bg-pulse-border-strong"}`} />
                                                <span className="font-mono text-[10px] text-pulse-faint">{a.id.substring(0, 8)}...</span>
                                                <span className="text-pulse-text-soft">{a.name}</span>
                                                {aDel.specialization && <span className="text-pulse-faint">— {aDel.specialization}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors motion-reduce:transition-none text-sm cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel">
                                Save Delegation Config
                            </button>
                        </div>
                    </div>
                </form>

                {/* Delegation History */}
                <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle">
                        <h2 className="text-lg font-semibold text-pulse-text">Delegation History</h2>
                        <p className="text-sm text-pulse-muted mt-1">{history.length} recent delegations</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-pulse-muted border-b border-pulse-border-subtle">
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
                                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-pulse-faint">
                                            No delegations yet. Enable delegation and the agent can use delegate_to_agent tool.
                                        </td>
                                    </tr>
                                )}
                                {history.map((d) => {
                                    const isOutgoing = d.sourceAgentId === agentId;
                                    return (
                                        <tr key={d.id} className="border-b border-pulse-border-subtle hover:bg-pulse-hover">
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    isOutgoing ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"
                                                }`}>
                                                    {isOutgoing ? "Outgoing" : "Incoming"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-sm text-pulse-text-soft max-w-xs">
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
                                            <td className="px-6 py-3 text-sm text-pulse-muted max-w-xs">
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
