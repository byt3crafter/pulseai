import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { getAgentPolicyRules, getAgentAuditLogs, addAgentPolicyRule, deleteAgentPolicyRule } from "./actions";
import { db } from "../../../../../storage/db";
import { agentProfiles } from "../../../../../storage/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AgentSafetyPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: agentId } = await params;

    const agent = await db.query.agentProfiles.findFirst({
        where: eq(agentProfiles.id, agentId),
    });
    if (!agent) return notFound();

    const rules = await getAgentPolicyRules(agentId);
    const { logs, total } = await getAgentAuditLogs(agentId);

    return (
        <div className="p-8">
            <div className="mb-8">
                <a href={`/dashboard/agents/${agentId}`} className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">
                    &larr; Back to {agent.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-50 rounded-lg">
                        <ShieldCheckIcon className="w-6 h-6 text-rose-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Exec Safety — {agent.name}</h1>
                        <p className="text-slate-500 text-sm">Per-agent command execution policy overrides.</p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Agent Policy Rules */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Agent Policy Rules</h2>
                        <p className="text-sm text-slate-500 mt-1">These rules apply only to this agent and take priority over global rules.</p>
                    </div>

                    <form action={addAgentPolicyRule} className="p-6 border-b border-slate-100 bg-slate-50">
                        <input type="hidden" name="agentId" value={agentId} />
                        <input type="hidden" name="tenantId" value={agent.tenantId} />
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                            <select
                                name="ruleType"
                                className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"
                            >
                                <option value="deny">Deny</option>
                                <option value="allow">Allow</option>
                            </select>
                            <input
                                type="text"
                                name="pattern"
                                placeholder="Pattern (glob or /regex/)"
                                required
                                className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 font-mono md:col-span-2"
                            />
                            <input
                                type="text"
                                name="description"
                                placeholder="Description"
                                className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400"
                            />
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    name="priority"
                                    placeholder="Priority"
                                    defaultValue="10"
                                    className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </form>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                                    <th className="px-6 py-3 font-medium">Type</th>
                                    <th className="px-6 py-3 font-medium">Pattern</th>
                                    <th className="px-6 py-3 font-medium">Description</th>
                                    <th className="px-6 py-3 font-medium">Priority</th>
                                    <th className="px-6 py-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-400">
                                            No agent-specific rules. This agent inherits global policy.
                                        </td>
                                    </tr>
                                )}
                                {rules.map((rule) => (
                                    <tr key={rule.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${rule.ruleType === "deny" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                                {rule.ruleType}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 font-mono text-sm text-slate-700">{rule.pattern}</td>
                                        <td className="px-6 py-3 text-sm text-slate-500">{rule.description || "—"}</td>
                                        <td className="px-6 py-3 text-sm text-slate-500">{rule.priority}</td>
                                        <td className="px-6 py-3">
                                            <form action={deleteAgentPolicyRule}>
                                                <input type="hidden" name="ruleId" value={rule.id} />
                                                <input type="hidden" name="agentId" value={agentId} />
                                                <button type="submit" className="text-xs text-red-600 hover:text-red-800 font-medium">Delete</button>
                                            </form>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Agent Audit Log */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Agent Audit Log</h2>
                        <p className="text-sm text-slate-500 mt-1">{total} exec events for this agent.</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                                    <th className="px-6 py-3 font-medium">Time</th>
                                    <th className="px-6 py-3 font-medium">Decision</th>
                                    <th className="px-6 py-3 font-medium">Command</th>
                                    <th className="px-6 py-3 font-medium">Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-400">
                                            No audit entries for this agent yet.
                                        </td>
                                    </tr>
                                )}
                                {logs.map((log) => (
                                    <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">
                                            {log.executedAt ? new Date(log.executedAt).toLocaleString() : "—"}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${log.decision === "denied" ? "bg-red-100 text-red-700" : log.decision === "sandboxed" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                                                {log.decision}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 font-mono text-xs text-slate-700 max-w-xs truncate">
                                            {log.command.length > 100 ? log.command.substring(0, 100) + "..." : log.command}
                                        </td>
                                        <td className="px-6 py-3 text-xs text-slate-500 max-w-xs truncate">{log.reason || "—"}</td>
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
