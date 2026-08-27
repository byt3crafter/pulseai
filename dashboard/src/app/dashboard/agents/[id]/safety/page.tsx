import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { getAgentPolicyRules, getAgentAuditLogs, addAgentPolicyRule, deleteAgentPolicyRule } from "./actions";
import { db } from "../../../../../storage/db";
import { agentProfiles } from "../../../../../storage/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AgentSafetyPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: agentId } = await params;

    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const agent = await db.query.agentProfiles.findFirst({
        where: eq(agentProfiles.id, agentId),
    });
    if (!agent) return notFound();

    const rules = await getAgentPolicyRules(agentId);
    const { logs, total } = await getAgentAuditLogs(agentId);

    return (
        <div className="mx-auto w-full max-w-[1060px] px-6 py-7 sm:px-10 sm:py-9">
            <div className="mb-8">
                <a href={`/dashboard/agents/${agentId}`} className="text-sm text-indigo-500 hover:text-indigo-400 mb-2 inline-block transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                    &larr; Back to {agent.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-500/10 rounded-lg">
                        <ShieldCheckIcon className="w-6 h-6 text-rose-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-pulse-text">Exec Safety — {agent.name}</h1>
                        <p className="text-pulse-muted text-sm">Per-agent command execution policy overrides.</p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Agent Policy Rules */}
                <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle">
                        <h2 className="text-lg font-semibold text-pulse-text">Agent Policy Rules</h2>
                        <p className="text-sm text-pulse-muted mt-1">These rules apply only to this agent and take priority over global rules.</p>
                    </div>

                    <form action={addAgentPolicyRule} className="p-6 border-b border-pulse-border-subtle bg-pulse-panel-alt">
                        <input type="hidden" name="agentId" value={agentId} />
                        <input type="hidden" name="tenantId" value={agent.tenantId} />
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                            <select
                                name="ruleType"
                                className="px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                            >
                                <option value="deny">Deny</option>
                                <option value="allow">Allow</option>
                            </select>
                            <input
                                type="text"
                                name="pattern"
                                placeholder="Pattern (glob or /regex/)"
                                required
                                className="px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint font-mono md:col-span-2 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                            />
                            <input
                                type="text"
                                name="description"
                                placeholder="Description"
                                className="px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                            />
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    name="priority"
                                    placeholder="Priority"
                                    defaultValue="10"
                                    className="w-20 px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel-alt"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </form>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-pulse-muted border-b border-pulse-border-subtle">
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
                                        <td colSpan={5} className="px-6 py-8 text-center text-sm text-pulse-faint">
                                            No agent-specific rules. This agent inherits global policy.
                                        </td>
                                    </tr>
                                )}
                                {rules.map((rule) => (
                                    <tr key={rule.id} className="border-b border-pulse-border-subtle hover:bg-pulse-hover">
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${rule.ruleType === "deny" ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                                                {rule.ruleType}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 font-mono text-sm text-pulse-text-soft">{rule.pattern}</td>
                                        <td className="px-6 py-3 text-sm text-pulse-muted">{rule.description || "—"}</td>
                                        <td className="px-6 py-3 text-sm text-pulse-muted">{rule.priority}</td>
                                        <td className="px-6 py-3">
                                            <form action={deleteAgentPolicyRule}>
                                                <input type="hidden" name="ruleId" value={rule.id} />
                                                <input type="hidden" name="agentId" value={agentId} />
                                                <button type="submit" className="text-xs text-red-400 hover:text-red-300 font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">Delete</button>
                                            </form>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Agent Audit Log */}
                <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle">
                        <h2 className="text-lg font-semibold text-pulse-text">Agent Audit Log</h2>
                        <p className="text-sm text-pulse-muted mt-1">{total} exec events for this agent.</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-pulse-muted border-b border-pulse-border-subtle">
                                    <th className="px-6 py-3 font-medium">Time</th>
                                    <th className="px-6 py-3 font-medium">Decision</th>
                                    <th className="px-6 py-3 font-medium">Command</th>
                                    <th className="px-6 py-3 font-medium">Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-sm text-pulse-faint">
                                            No audit entries for this agent yet.
                                        </td>
                                    </tr>
                                )}
                                {logs.map((log) => (
                                    <tr key={log.id} className="border-b border-pulse-border-subtle hover:bg-pulse-hover">
                                        <td className="px-6 py-3 text-xs text-pulse-muted whitespace-nowrap">
                                            {log.executedAt ? new Date(log.executedAt).toLocaleString() : "—"}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${log.decision === "denied" ? "bg-red-500/10 text-red-400" : log.decision === "sandboxed" ? "bg-amber-500/10 text-amber-400" : "bg-green-500/10 text-green-400"}`}>
                                                {log.decision}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 font-mono text-xs text-pulse-text-soft max-w-xs truncate">
                                            {log.command.length > 100 ? log.command.substring(0, 100) + "..." : log.command}
                                        </td>
                                        <td className="px-6 py-3 text-xs text-pulse-muted max-w-xs truncate">{log.reason || "—"}</td>
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
