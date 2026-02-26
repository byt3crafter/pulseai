import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import {
    getExecSafetySettings,
    saveExecSafetySettings,
    getAuditLogs,
    getGlobalPolicyRules,
    addPolicyRule,
    deletePolicyRule,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ExecSafetyPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const settings = await getExecSafetySettings();
    const { logs, total } = await getAuditLogs(0, 50);
    const rules = await getGlobalPolicyRules();

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-rose-50 rounded-lg">
                        <ShieldCheckIcon className="w-6 h-6 text-rose-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Exec Safety</h1>
                </div>
                <p className="text-slate-500">
                    Global command execution safety policies. Controls what agents can run via exec and sandbox tools.
                </p>
            </div>

            <div className="space-y-6">
                {/* Global Settings */}
                <form action={saveExecSafetySettings} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Global Policy</h2>
                        <p className="text-sm text-slate-500 mt-1">These settings apply to all tenants as defaults.</p>
                    </div>
                    <div className="p-6 space-y-6">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="enabled"
                                defaultChecked={settings.enabled}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <div>
                                <span className="text-sm font-medium text-slate-900">Enable Exec Safety</span>
                                <p className="text-xs text-slate-500">When disabled, all commands are allowed without checks.</p>
                            </div>
                        </label>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Default Policy</label>
                            <select
                                name="defaultPolicy"
                                defaultValue={settings.defaultPolicy}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                            >
                                <option value="allow_all">Allow All (log everything)</option>
                                <option value="allowlist_only">Allowlist Only (safe commands only)</option>
                                <option value="deny_all">Deny All (block everything)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Global Deny Patterns</label>
                            <textarea
                                name="denyPatterns"
                                rows={4}
                                defaultValue={settings.globalDenyPatterns}
                                placeholder="One pattern per line, e.g.:&#10;rm -rf *&#10;/DROP\s+TABLE/i"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 placeholder:text-slate-400 font-mono"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Global Allow Patterns</label>
                            <textarea
                                name="allowPatterns"
                                rows={4}
                                defaultValue={settings.globalAllowPatterns}
                                placeholder="One pattern per line, e.g.:&#10;python3 *&#10;ls *"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 placeholder:text-slate-400 font-mono"
                            />
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
                            >
                                Save Policy
                            </button>
                        </div>
                    </div>
                </form>

                {/* Policy Rules */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Global Policy Rules</h2>
                            <p className="text-sm text-slate-500 mt-1">Custom allow/deny rules evaluated by priority (highest first).</p>
                        </div>
                    </div>

                    {/* Add Rule Form */}
                    <form action={addPolicyRule} className="p-6 border-b border-slate-100 bg-slate-50">
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
                                    defaultValue="0"
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

                    {/* Rules Table */}
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
                                            No custom policy rules configured. Built-in patterns are always active.
                                        </td>
                                    </tr>
                                )}
                                {rules.map((rule) => (
                                    <tr key={rule.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-6 py-3">
                                            <span
                                                className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    rule.ruleType === "deny"
                                                        ? "bg-red-100 text-red-700"
                                                        : "bg-green-100 text-green-700"
                                                }`}
                                            >
                                                {rule.ruleType}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 font-mono text-sm text-slate-700">{rule.pattern}</td>
                                        <td className="px-6 py-3 text-sm text-slate-500">{rule.description || "—"}</td>
                                        <td className="px-6 py-3 text-sm text-slate-500">{rule.priority}</td>
                                        <td className="px-6 py-3">
                                            <form action={deletePolicyRule}>
                                                <input type="hidden" name="ruleId" value={rule.id} />
                                                <button
                                                    type="submit"
                                                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                                                >
                                                    Delete
                                                </button>
                                            </form>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Audit Log */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Audit Log</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            Recent command execution decisions ({total} total entries).
                        </p>
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
                                            No audit log entries yet. Exec events will appear here once agents run commands.
                                        </td>
                                    </tr>
                                )}
                                {logs.map((log) => (
                                    <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">
                                            {log.executedAt
                                                ? new Date(log.executedAt).toLocaleString()
                                                : "—"}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span
                                                className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    log.decision === "denied"
                                                        ? "bg-red-100 text-red-700"
                                                        : log.decision === "sandboxed"
                                                        ? "bg-amber-100 text-amber-700"
                                                        : "bg-green-100 text-green-700"
                                                }`}
                                            >
                                                {log.decision}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 font-mono text-xs text-slate-700 max-w-xs truncate">
                                            {log.command.length > 100
                                                ? log.command.substring(0, 100) + "..."
                                                : log.command}
                                        </td>
                                        <td className="px-6 py-3 text-xs text-slate-500 max-w-xs truncate">
                                            {log.reason || "—"}
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
