"use client";

import { useState } from "react";
import Link from "next/link";
import SaveButton from "../../../components/SaveButton";
import ConfirmDialog from "../../../components/ConfirmDialog";
import {
    saveGlobalSettingsAction,
    saveMemorySettingsAction,
    saveSandboxSettingsAction,
    saveSchedulingSettingsAction,
} from "./actions";
import {
    saveExecSafetySettings,
    addPolicyRule,
    deletePolicyRule,
} from "./exec-safety/actions";

const TABS = [
    { id: "providers", label: "AI Providers" },
    { id: "system", label: "System Services" },
    { id: "exec-safety", label: "Exec Safety" },
    { id: "memory", label: "Memory" },
    { id: "sandbox", label: "Sandbox" },
    { id: "scheduling", label: "Scheduling" },
    { id: "database", label: "Database & Security" },
];

interface Props {
    tab: string;
    settings: any;
    execSafety: { enabled: boolean; defaultPolicy: string; globalDenyPatterns: string; globalAllowPatterns: string };
    auditLogs: { logs: any[]; total: number };
    policyRules: any[];
    memoryConfig: any;
    sandboxConfig: any;
    schedulingConfig: any;
    allJobs: any[];
}

export default function AdminSettingsClient({
    tab,
    settings,
    execSafety,
    auditLogs,
    policyRules,
    memoryConfig,
    sandboxConfig,
    schedulingConfig,
    allJobs,
}: Props) {
    return (
        <div className="p-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Global Settings</h1>
                <p className="text-sm text-slate-500 mt-1">Manage platform configuration, providers, security, and services.</p>
            </div>

            <div className="flex gap-8">
                {/* Left tab nav */}
                <nav className="w-44 flex-shrink-0">
                    <ul className="space-y-0.5">
                        {TABS.map(t => (
                            <li key={t.id}>
                                <Link
                                    href={`/admin/settings?tab=${t.id}`}
                                    className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        tab === t.id
                                            ? "bg-slate-100 text-slate-900"
                                            : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                                    }`}
                                >
                                    {t.label}
                                </Link>
                            </li>
                        ))}
                        <li>
                            <Link
                                href="/admin/plugins"
                                className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                            >
                                Plugins
                            </Link>
                        </li>
                    </ul>
                </nav>

                {/* Tab content */}
                <div className="flex-1 min-w-0">
                    {tab === "providers" && <ProvidersTab settings={settings} />}
                    {tab === "system" && <SystemTab settings={settings} />}
                    {tab === "exec-safety" && <ExecSafetyTab execSafety={execSafety} auditLogs={auditLogs} policyRules={policyRules} />}
                    {tab === "memory" && <MemoryTab config={memoryConfig} />}
                    {tab === "sandbox" && <SandboxTab config={sandboxConfig} />}
                    {tab === "scheduling" && <SchedulingTab config={schedulingConfig} allJobs={allJobs} />}
                    {tab === "database" && <DatabaseTab />}
                </div>
            </div>
        </div>
    );
}

/* ─── Providers Tab ───────────────────────────────────────────── */
function ProvidersTab({ settings }: { settings: any }) {
    return (
        <div className="space-y-6">
            <form action={saveGlobalSettingsAction} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <input type="hidden" name="section" value="providers" />
                <div className="p-6 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">AI Model Providers</h2>
                    <p className="text-sm text-slate-500 mt-1">Configure the master API keys used by all tenant agents.</p>
                </div>
                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Anthropic API Key (Claude)</label>
                        <div className="flex">
                            <input
                                type="password"
                                name="anthropicApiKey"
                                placeholder={settings.anthropicApiKeyHash ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "sk-ant-api03-..."}
                                className="w-full px-4 py-2 border border-slate-300 rounded-l-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-slate-900 placeholder:text-slate-400"
                            />
                            <SaveButton label="Update" className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-l-0 border-indigo-200 rounded-r-lg font-medium hover:bg-indigo-100 transition-colors disabled:opacity-60" />
                        </div>
                        <p className="text-xs flex items-center mt-2">
                            <span className={`w-2 h-2 rounded-full mr-2 ${settings.anthropicApiKeyHash ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                            <span className={settings.anthropicApiKeyHash ? 'text-emerald-600' : 'text-slate-500'}>
                                {settings.anthropicApiKeyHash ? 'Active in Database' : 'Missing (Agents will fail)'}
                            </span>
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">OpenAI API Key (GPT-4o)</label>
                        <div className="flex">
                            <input
                                type="password"
                                name="openaiApiKey"
                                placeholder={settings.openaiApiKeyHash ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "sk-proj-..."}
                                className="w-full px-4 py-2 border border-slate-300 rounded-l-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-slate-900 placeholder:text-slate-400"
                            />
                            <SaveButton label="Save" className="px-4 py-2 bg-slate-900 text-white rounded-r-lg font-medium hover:bg-slate-800 transition-colors disabled:opacity-60" />
                        </div>
                        <p className="text-xs flex items-center mt-2">
                            <span className={`w-2 h-2 rounded-full mr-2 ${settings.openaiApiKeyHash ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                            <span className={settings.openaiApiKeyHash ? 'text-emerald-600' : 'text-slate-500'}>
                                {settings.openaiApiKeyHash ? 'Active in Database' : 'Optional fallback provider'}
                            </span>
                        </p>
                    </div>
                </div>
            </form>
        </div>
    );
}

/* ─── System Services Tab ─────────────────────────────────────── */
function SystemTab({ settings }: { settings: any }) {
    return (
        <form action={saveGlobalSettingsAction} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <input type="hidden" name="section" value="pulse_system" />
            <div className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Pulse System Services</h2>
                <p className="text-sm text-slate-500 mt-1">Enable advanced features like hot-reload, trusted proxies, local discovery, and CLI backends.</p>
            </div>
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            name="enableHotReload"
                            defaultChecked={settings.gatewayConfig?.enable_hot_reload ?? true}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <div>
                            <span className="text-sm font-medium text-slate-900">Enable Hot-Reload</span>
                            <p className="text-xs text-slate-500">Apply config changes without restarting</p>
                        </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            name="lanDiscovery"
                            defaultChecked={settings.gatewayConfig?.lan_discovery ?? false}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <div>
                            <span className="text-sm font-medium text-slate-900">LAN Discovery / Bonjour</span>
                            <p className="text-xs text-slate-500">Allow mDNS local gateway discovery</p>
                        </div>
                    </label>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Trusted Proxy Network</label>
                        <input
                            type="text"
                            name="trustedProxy"
                            placeholder="10.0.0.0/8, 192.168.0.0/16"
                            defaultValue={settings.gatewayConfig?.trusted_proxy || ""}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 placeholder:text-slate-400"
                        />
                        <p className="text-xs text-slate-500 mt-1">Comma-separated CIDR list for trusted LB proxies.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">CLI Backends Integration</label>
                        <select
                            name="cliBackends"
                            defaultValue={settings.gatewayConfig?.cli_backends || "disabled"}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                        >
                            <option value="disabled">Disabled</option>
                            <option value="enabled">Enabled (Local Only)</option>
                            <option value="all">Enabled (All Interfaces)</option>
                        </select>
                    </div>
                </div>
                <div className="flex justify-end">
                    <SaveButton label="Save System Services" />
                </div>
            </div>
        </form>
    );
}

/* ─── Exec Safety Tab ─────────────────────────────────────────── */
function ExecSafetyTab({ execSafety, auditLogs, policyRules }: {
    execSafety: { enabled: boolean; defaultPolicy: string; globalDenyPatterns: string; globalAllowPatterns: string };
    auditLogs: { logs: any[]; total: number };
    policyRules: any[];
}) {
    const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);

    return (
        <div className="space-y-6">
            {/* Global Settings */}
            <form action={saveExecSafetySettings} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Global Policy</h2>
                    <p className="text-sm text-slate-500 mt-1">These settings apply to all tenants as defaults.</p>
                </div>
                <div className="p-6 space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" name="enabled" defaultChecked={execSafety.enabled}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                        <div>
                            <span className="text-sm font-medium text-slate-900">Enable Exec Safety</span>
                            <p className="text-xs text-slate-500">When disabled, all commands are allowed without checks.</p>
                        </div>
                    </label>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Default Policy</label>
                        <select name="defaultPolicy" defaultValue={execSafety.defaultPolicy}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900">
                            <option value="allow_all">Allow All (log everything)</option>
                            <option value="allowlist_only">Allowlist Only (safe commands only)</option>
                            <option value="deny_all">Deny All (block everything)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Global Deny Patterns</label>
                        <textarea name="denyPatterns" rows={3} defaultValue={execSafety.globalDenyPatterns}
                            placeholder={"One pattern per line, e.g.:\nrm -rf *\n/DROP\\s+TABLE/i"}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 placeholder:text-slate-400 font-mono" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Global Allow Patterns</label>
                        <textarea name="allowPatterns" rows={3} defaultValue={execSafety.globalAllowPatterns}
                            placeholder={"One pattern per line, e.g.:\npython3 *\nls *"}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 placeholder:text-slate-400 font-mono" />
                    </div>
                    <div className="flex justify-end">
                        <SaveButton label="Save Policy" />
                    </div>
                </div>
            </form>

            {/* Policy Rules */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Global Policy Rules</h2>
                    <p className="text-sm text-slate-500 mt-1">Custom allow/deny rules evaluated by priority (highest first).</p>
                </div>
                <form action={addPolicyRule} className="p-6 border-b border-slate-100 bg-slate-50">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <select name="ruleType" className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                            <option value="deny">Deny</option>
                            <option value="allow">Allow</option>
                        </select>
                        <input type="text" name="pattern" placeholder='Pattern (glob or /regex/)' required
                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 font-mono md:col-span-2" />
                        <input type="text" name="description" placeholder="Description"
                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400" />
                        <div className="flex gap-2">
                            <input type="number" name="priority" placeholder="Priority" defaultValue="0"
                                className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900" />
                            <SaveButton label="Add" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60" />
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
                            {policyRules.length === 0 && (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-400">
                                    No custom policy rules configured. Built-in patterns are always active.
                                </td></tr>
                            )}
                            {policyRules.map((rule: any) => (
                                <tr key={rule.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                            rule.ruleType === "deny" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                                        }`}>{rule.ruleType}</span>
                                    </td>
                                    <td className="px-6 py-3 font-mono text-sm text-slate-700">{rule.pattern}</td>
                                    <td className="px-6 py-3 text-sm text-slate-500">{rule.description || "\u2014"}</td>
                                    <td className="px-6 py-3 text-sm text-slate-500">{rule.priority}</td>
                                    <td className="px-6 py-3">
                                        <button
                                            onClick={() => setDeleteRuleId(rule.id)}
                                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                                        >
                                            Delete
                                        </button>
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
                    <p className="text-sm text-slate-500 mt-1">Recent command execution decisions ({auditLogs.total} total entries).</p>
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
                            {auditLogs.logs.length === 0 && (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-400">
                                    No audit log entries yet. Exec events will appear here once agents run commands.
                                </td></tr>
                            )}
                            {auditLogs.logs.map((log: any) => (
                                <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">
                                        {log.executedAt ? new Date(log.executedAt).toLocaleString() : "\u2014"}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                            log.decision === "denied" ? "bg-red-100 text-red-700"
                                                : log.decision === "sandboxed" ? "bg-amber-100 text-amber-700"
                                                    : "bg-green-100 text-green-700"
                                        }`}>{log.decision}</span>
                                    </td>
                                    <td className="px-6 py-3 font-mono text-xs text-slate-700 max-w-xs truncate">
                                        {log.command.length > 100 ? log.command.substring(0, 100) + "..." : log.command}
                                    </td>
                                    <td className="px-6 py-3 text-xs text-slate-500 max-w-xs truncate">
                                        {log.reason || "\u2014"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <ConfirmDialog
                open={!!deleteRuleId}
                title="Delete Policy Rule"
                message="Are you sure you want to delete this policy rule? This action cannot be undone."
                confirmLabel="Delete Rule"
                variant="danger"
                onConfirm={() => {
                    if (!deleteRuleId) return;
                    const fd = new FormData();
                    fd.append("ruleId", deleteRuleId);
                    deletePolicyRule(fd);
                    setDeleteRuleId(null);
                }}
                onCancel={() => setDeleteRuleId(null)}
            />
        </div>
    );
}

/* ─── Memory Tab ──────────────────────────────────────────────── */
function MemoryTab({ config }: { config: any }) {
    return (
        <form action={saveMemorySettingsAction} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Memory System</h2>
                <p className="text-sm text-slate-500 mt-1">Configure agent long-term memory and vector search.</p>
            </div>
            <div className="p-6 space-y-6">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" name="enabled" defaultChecked={config.enabled !== false}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                    <div>
                        <span className="text-sm font-medium text-slate-900">Enable Memory System</span>
                        <p className="text-xs text-slate-500">When disabled, agents cannot store or recall memories.</p>
                    </div>
                </label>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Embedding Model</label>
                    <select name="embeddingModel" defaultValue={config.embedding_model || "text-embedding-3-small"}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="text-embedding-3-small">text-embedding-3-small (1536d, fast)</option>
                        <option value="text-embedding-3-large">text-embedding-3-large (3072d, more accurate)</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">Requires OPENAI_API_KEY. Falls back to keyword-only search without it.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Max Memories per Agent</label>
                        <input type="number" name="maxMemories" defaultValue={config.max_memories_per_agent || 10000}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Decay Half-Life (days)</label>
                        <input type="number" name="decayHalfLife" defaultValue={config.decay_half_life_days || 30}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900" />
                        <p className="text-xs text-slate-400 mt-1">After this many days, a memory&apos;s relevance score halves.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">MMR Lambda (0.0-1.0)</label>
                        <input type="number" name="mmrLambda" step="0.1" min="0" max="1" defaultValue={config.mmr_lambda || 0.7}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900" />
                        <p className="text-xs text-slate-400 mt-1">1.0 = pure relevance, 0.0 = max diversity.</p>
                    </div>
                </div>
                <div className="flex justify-end">
                    <SaveButton label="Save Memory Settings" />
                </div>
            </div>
        </form>
    );
}

/* ─── Sandbox Tab ─────────────────────────────────────────────── */
function SandboxTab({ config }: { config: any }) {
    return (
        <form action={saveSandboxSettingsAction} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Python Sandbox</h2>
                <p className="text-sm text-slate-500 mt-1">Docker image, resource limits, timeouts, and network access for agent code execution.</p>
            </div>
            <div className="p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Python Docker Image</label>
                    <input type="text" name="pythonImage" defaultValue={config.image || "pulse-python-sandbox:latest"}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono" />
                    <p className="text-xs text-slate-400 mt-1">Build with: docker build -t pulse-python-sandbox pulse/docker/python-sandbox/</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Memory Limit</label>
                        <select name="memoryLimit" defaultValue={config.memory_limit || "256m"}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                            <option value="128m">128 MB</option>
                            <option value="256m">256 MB</option>
                            <option value="512m">512 MB</option>
                            <option value="1g">1 GB</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">CPU Limit</label>
                        <select name="cpuLimit" defaultValue={config.cpu_limit || "1.0"}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                            <option value="0.5">0.5 CPU</option>
                            <option value="1.0">1.0 CPU</option>
                            <option value="2.0">2.0 CPU</option>
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Default Timeout (seconds)</label>
                        <input type="number" name="defaultTimeout" defaultValue={config.default_timeout || 60}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Max Timeout (seconds)</label>
                        <input type="number" name="maxTimeout" defaultValue={config.max_timeout || 300}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900" />
                    </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" name="networkEnabled" defaultChecked={config.network_enabled !== false}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                    <div>
                        <span className="text-sm font-medium text-slate-900">Network Access</span>
                        <p className="text-xs text-slate-500">Allow sandbox containers to make outbound API calls</p>
                    </div>
                </label>
                <div className="flex justify-end">
                    <SaveButton label="Save Sandbox Settings" />
                </div>
            </div>
        </form>
    );
}

/* ─── Scheduling Tab ──────────────────────────────────────────── */
function SchedulingTab({ config, allJobs }: { config: any; allJobs: any[] }) {
    const enabledCount = allJobs.filter((j: any) => j.enabled).length;

    return (
        <div className="space-y-6">
            <form action={saveSchedulingSettingsAction} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Scheduling Settings</h2>
                    <p className="text-sm text-slate-500 mt-1">Configure global scheduling settings for cron jobs and scheduled tasks.</p>
                </div>
                <div className="p-6 space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" name="enabled" defaultChecked={config.enabled !== false}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                        <div>
                            <span className="text-sm font-medium text-slate-900">Enable Scheduling System</span>
                            <p className="text-xs text-slate-500">When disabled, no scheduled jobs will execute.</p>
                        </div>
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Max Jobs per Tenant</label>
                            <input type="number" name="maxJobsPerTenant" defaultValue={config.max_jobs_per_tenant || 50} min={1}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Max Jobs per Agent</label>
                            <input type="number" name="maxJobsPerAgent" defaultValue={config.max_jobs_per_agent || 10} min={1}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Min Interval (seconds)</label>
                            <input type="number" name="minInterval" defaultValue={config.min_interval_seconds || 300} min={60}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900" />
                            <p className="text-xs text-slate-400 mt-1">Minimum seconds between runs. Default: 300 (5 min).</p>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <SaveButton label="Save Scheduling Settings" />
                    </div>
                </div>
            </form>

            {/* Active Jobs Overview */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">All Scheduled Jobs</h2>
                    <p className="text-sm text-slate-500 mt-1">{allJobs.length} total jobs, {enabledCount} enabled</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                                <th className="px-6 py-3 font-medium">Name</th>
                                <th className="px-6 py-3 font-medium">Agent</th>
                                <th className="px-6 py-3 font-medium">Schedule</th>
                                <th className="px-6 py-3 font-medium">Timezone</th>
                                <th className="px-6 py-3 font-medium">Status</th>
                                <th className="px-6 py-3 font-medium">Last Run</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allJobs.length === 0 && (
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">
                                    No scheduled jobs across any tenant.
                                </td></tr>
                            )}
                            {allJobs.map((job: any) => {
                                const schedule = job.cronExpression
                                    || (job.intervalSeconds ? `every ${job.intervalSeconds}s` : `once at ${job.runAt ? new Date(job.runAt).toLocaleString() : "\u2014"}`);
                                return (
                                    <tr key={job.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-6 py-3 text-sm font-medium text-slate-900">{job.name}</td>
                                        <td className="px-6 py-3 text-sm text-slate-500">{job.agentName || "\u2014"}</td>
                                        <td className="px-6 py-3">
                                            <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">{schedule}</code>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-slate-500">{job.timezone || "UTC"}</td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                job.enabled ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                                            }`}>{job.enabled ? "Enabled" : "Disabled"}</span>
                                        </td>
                                        <td className="px-6 py-3 text-xs text-slate-400">
                                            {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "Never"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ─── Database & Security Tab ─────────────────────────────────── */
function DatabaseTab() {
    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">PostgreSQL Connection</h2>
                </div>
                <div className="p-6">
                    <label className="block text-sm font-medium text-slate-700 mb-1">DATABASE_URL</label>
                    <input type="text" readOnly value="postgres://pulseadmin:******@localhost:5432/pulse"
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-500 focus:outline-none font-mono text-sm" />
                    <div className="mt-4 flex gap-3">
                        <button className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors">
                            Test Connection
                        </button>
                        <button className="px-4 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 transition-colors">
                            Run Migrations
                        </button>
                    </div>
                </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Security & Encryption</h2>
                </div>
                <div className="p-6">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                            <p className="font-medium text-slate-900">ENCRYPTION_KEY Status</p>
                            <p className="text-sm text-slate-500">Used for signing OAuth tokens and NextAuth sessions.</p>
                        </div>
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">Valid (64-byte Hex)</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
