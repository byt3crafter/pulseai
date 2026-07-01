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
    saveDefaultSkillsAction,
    saveModelPricingAction,
    deleteModelPricingAction,
    syncProviderModelsAction,
    saveProviderKeyAction,
    testProviderKeyAction,
    saveEmailSettingsAction,
    testEmailSettingsAction,
    type EmailSettingsView,
} from "./actions";
import { BUILTIN_SKILLS } from "../../../utils/skills-registry";
import {
    saveExecSafetySettings,
    addPolicyRule,
    deletePolicyRule,
} from "./exec-safety/actions";

const TABS = [
    { id: "providers", label: "AI Providers" },
    { id: "model-pricing", label: "Model Pricing" },
    { id: "system", label: "System Services" },
    { id: "email", label: "Email (SMTP)" },
    { id: "exec-safety", label: "Exec Safety" },
    { id: "memory", label: "Memory" },
    { id: "sandbox", label: "Sandbox" },
    { id: "scheduling", label: "Scheduling" },
    { id: "skills", label: "Skills" },
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
    defaultSkills: string[];
    modelPricing: ModelPricingEntry[];
    providerStatuses: Array<{ provider: string; hasKey: boolean }>;
    emailSettings: EmailSettingsView | null;
}

interface ModelPricingEntry {
    id: string;
    provider: string;
    modelId: string;
    displayName: string;
    category: string;
    baseInputPerMillion: number;
    baseOutputPerMillion: number;
    customerInputPerMillion: number;
    customerOutputPerMillion: number;
    maxTokens: number;
    isActive: boolean;
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
    defaultSkills,
    modelPricing,
    providerStatuses,
    emailSettings,
}: Props) {
    return (
        <div className="p-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-[#EDEDED] tracking-tight">Global Settings</h1>
                <p className="text-sm text-[#8A8A90] mt-1">Manage platform configuration, providers, security, and services.</p>
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
                                            ? "bg-[#17132B] text-[#8B5CF6]"
                                            : "text-[#8A8A90] hover:text-[#EDEDED] hover:bg-[#101012]"
                                    }`}
                                >
                                    {t.label}
                                </Link>
                            </li>
                        ))}
                        <li>
                            <Link
                                href="/admin/plugins"
                                className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-[#8A8A90] hover:text-[#EDEDED] hover:bg-[#101012] transition-colors"
                            >
                                Plugins
                            </Link>
                        </li>
                    </ul>
                </nav>

                {/* Tab content */}
                <div className="flex-1 min-w-0">
                    {tab === "providers" && <ProvidersTab providerStatuses={providerStatuses} />}
                    {tab === "system" && <SystemTab settings={settings} />}
                    {tab === "email" && <EmailTab settings={emailSettings} />}
                    {tab === "exec-safety" && <ExecSafetyTab execSafety={execSafety} auditLogs={auditLogs} policyRules={policyRules} />}
                    {tab === "memory" && <MemoryTab config={memoryConfig} />}
                    {tab === "sandbox" && <SandboxTab config={sandboxConfig} />}
                    {tab === "scheduling" && <SchedulingTab config={schedulingConfig} allJobs={allJobs} />}
                    {tab === "skills" && <SkillsDefaultsTab defaultSkills={defaultSkills} />}
                    {tab === "model-pricing" && <ModelPricingTab models={modelPricing} />}
                    {tab === "database" && <DatabaseTab />}
                </div>
            </div>
        </div>
    );
}

/* ─── Providers Tab ───────────────────────────────────────────── */

const PROVIDER_CARDS = [
    { id: "anthropic", name: "Anthropic", description: "Claude models", placeholder: "sk-ant-api03-...", required: true },
    { id: "openai", name: "OpenAI", description: "GPT-4o, o1, o3 models", placeholder: "sk-proj-..." },
    { id: "google", name: "Google", description: "Gemini models", placeholder: "AIza..." },
    { id: "openrouter", name: "OpenRouter", description: "Multi-provider routing", placeholder: "sk-or-..." },
    { id: "minimax", name: "MiniMax", description: "MiniMax M2.5 models", placeholder: "eyJ..." },
];

function ProvidersTab({ providerStatuses }: { providerStatuses: Array<{ provider: string; hasKey: boolean }> }) {
    const statusMap = Object.fromEntries(providerStatuses.map(s => [s.provider, s.hasKey]));

    return (
        <div className="space-y-6">
            <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                <div className="p-6 border-b border-[#242429]">
                    <h2 className="text-lg font-semibold text-[#EDEDED]">AI Model Providers</h2>
                    <p className="text-sm text-[#8A8A90] mt-1">Configure global API keys. Platform-mode tenants use these keys automatically.</p>
                </div>
                <div className="p-6 space-y-4">
                    {PROVIDER_CARDS.map(pc => (
                        <ProviderKeyCard
                            key={pc.id}
                            provider={pc.id}
                            name={pc.name}
                            description={pc.description}
                            placeholder={pc.placeholder}
                            hasKey={statusMap[pc.id] ?? false}
                            required={pc.required}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function ProviderKeyCard({ provider, name, description, placeholder, hasKey, required }: {
    provider: string;
    name: string;
    description: string;
    placeholder: string;
    hasKey: boolean;
    required?: boolean;
}) {
    const [apiKey, setApiKey] = useState("");
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleSave = async () => {
        if (!apiKey.trim()) return;
        setSaving(true);
        setMessage(null);
        const fd = new FormData();
        fd.set("provider", provider);
        fd.set("apiKey", apiKey.trim());
        const result = await saveProviderKeyAction(fd);
        setSaving(false);
        if (result.success) {
            setMessage({ type: "success", text: "Key saved" });
            setApiKey("");
        } else {
            setMessage({ type: "error", text: result.message || "Failed to save" });
        }
    };

    const handleTest = async () => {
        if (!apiKey.trim()) return;
        setTesting(true);
        setMessage(null);
        const fd = new FormData();
        fd.set("provider", provider);
        fd.set("apiKey", apiKey.trim());
        const result = await testProviderKeyAction(fd);
        setTesting(false);
        setMessage(result.success
            ? { type: "success", text: "Key is valid" }
            : { type: "error", text: result.message || "Invalid key" }
        );
    };

    return (
        <div className="border border-[#242429] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <span className="text-sm font-semibold text-[#EDEDED]">{name}</span>
                    <span className="text-xs text-[#8A8A90] ml-2">{description}</span>
                    {required && <span className="text-xs text-[#F0503C] ml-1">*</span>}
                </div>
                <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${hasKey ? 'bg-[#3FB950]' : 'bg-[#5A5A61]'}`} />
                    <span className={`text-xs ${hasKey ? 'text-[#3FB950]' : 'text-[#5A5A61]'}`}>
                        {hasKey ? "Active" : "Not configured"}
                    </span>
                </div>
            </div>
            <div className="flex gap-2">
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setMessage(null); }}
                    placeholder={hasKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (enter new key to replace)" : placeholder}
                    className="flex-1 px-3 py-1.5 border border-[#242429] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all text-[#EDEDED] placeholder:text-[#5A5A61]"
                />
                <button
                    type="button"
                    onClick={handleTest}
                    disabled={!apiKey.trim() || testing}
                    className="px-3 py-1.5 text-xs font-medium border border-[#242429] rounded-lg hover:bg-[#101012] transition-colors disabled:opacity-40 text-[#B5B5BA]"
                >
                    {testing ? "Testing..." : "Test"}
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!apiKey.trim() || saving}
                    className="px-3 py-1.5 text-xs font-medium bg-[#8B5CF6] text-white rounded-lg hover:bg-[#A78BFA] transition-colors disabled:opacity-40"
                >
                    {saving ? "Saving..." : "Save"}
                </button>
            </div>
            {message && (
                <p className={`text-xs mt-2 ${message.type === "success" ? "text-[#3FB950]" : "text-[#F0503C]"}`}>
                    {message.text}
                </p>
            )}
        </div>
    );
}

/* ─── Email (SMTP) Tab ────────────────────────────────────────── */
function EmailTab({ settings }: { settings: EmailSettingsView | null }) {
    const s = settings ?? {
        enabled: false, host: "", port: 587, secure: false,
        user: "", from: "", fromName: "", hasPassword: false,
    };

    const [enabled, setEnabled] = useState(s.enabled);
    const [host, setHost] = useState(s.host);
    const [port, setPort] = useState(String(s.port || 587));
    const [secure, setSecure] = useState(s.secure);
    const [user, setUser] = useState(s.user);
    const [password, setPassword] = useState("");
    const [from, setFrom] = useState(s.from);
    const [fromName, setFromName] = useState(s.fromName);
    const [testEmail, setTestEmail] = useState("");
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const buildForm = () => {
        const fd = new FormData();
        if (enabled) fd.set("enabled", "on");
        fd.set("host", host);
        fd.set("port", port);
        if (secure) fd.set("secure", "on");
        fd.set("user", user);
        if (password) fd.set("password", password);
        fd.set("from", from);
        fd.set("fromName", fromName);
        return fd;
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        const result = await saveEmailSettingsAction(buildForm());
        setSaving(false);
        setMessage(result.success
            ? { type: "success", text: result.message || "Saved" }
            : { type: "error", text: result.message || "Failed to save" });
        if (result.success) setPassword("");
    };

    const handleTest = async () => {
        if (!testEmail.trim()) {
            setMessage({ type: "error", text: "Enter a recipient email to send the test to." });
            return;
        }
        setTesting(true);
        setMessage(null);
        const fd = buildForm();
        fd.set("testEmail", testEmail.trim());
        const result = await testEmailSettingsAction(fd);
        setTesting(false);
        setMessage(result.success
            ? { type: "success", text: result.message || "Test sent" }
            : { type: "error", text: result.message || "Test failed" });
    };

    const inputClass = "w-full px-3 py-2 border border-[#242429] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all text-[#EDEDED] placeholder:text-[#5A5A61]";

    return (
        <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
            <div className="p-6 border-b border-[#242429]">
                <h2 className="text-lg font-semibold text-[#EDEDED]">Email (SMTP)</h2>
                <p className="text-sm text-[#8A8A90] mt-1">
                    Used for account emails — password resets and user invitations. The password is encrypted at rest.
                </p>
            </div>
            <div className="p-6 space-y-4">
                <label className="flex items-center gap-2 text-sm font-medium text-[#B5B5BA]">
                    <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded border-[#242429]" />
                    Enable email sending
                </label>

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1.5">SMTP Host</label>
                        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" className={inputClass} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1.5">Port</label>
                        <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" className={inputClass} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1.5">Username</label>
                        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="you@example.com" className={inputClass} autoComplete="off" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1.5">Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={s.hasPassword ? "•••••••• (enter to replace)" : "SMTP password"} className={inputClass} autoComplete="new-password" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1.5">From Address</label>
                        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="no-reply@example.com" className={inputClass} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1.5">From Name <span className="text-[#5A5A61] font-normal">(optional)</span></label>
                        <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Pulse AI" className={inputClass} />
                    </div>
                </div>

                <label className="flex items-center gap-2 text-sm font-medium text-[#B5B5BA]">
                    <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="rounded border-[#242429]" />
                    Use implicit TLS (port 465). Leave off for STARTTLS (port 587).
                </label>

                <div className="flex items-center gap-2 pt-2">
                    <button type="button" onClick={handleSave} disabled={saving}
                        className="px-4 py-2 text-sm font-medium bg-[#8B5CF6] text-white rounded-lg hover:bg-[#A78BFA] transition-colors disabled:opacity-40">
                        {saving ? "Saving..." : "Save settings"}
                    </button>
                </div>

                <div className="border-t border-[#242429] pt-4 mt-2">
                    <label className="block text-sm font-medium text-[#B5B5BA] mb-1.5">Send a test email</label>
                    <div className="flex gap-2">
                        <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="recipient@example.com" className={inputClass} />
                        <button type="button" onClick={handleTest} disabled={testing}
                            className="px-3 py-2 text-sm font-medium border border-[#242429] rounded-lg hover:bg-[#101012] transition-colors disabled:opacity-40 text-[#B5B5BA] whitespace-nowrap">
                            {testing ? "Sending..." : "Send test"}
                        </button>
                    </div>
                    <p className="text-xs text-[#5A5A61] mt-1.5">Uses the values above (saving first is not required).</p>
                </div>

                {message && (
                    <p className={`text-sm ${message.type === "success" ? "text-[#3FB950]" : "text-[#F0503C]"}`}>
                        {message.text}
                    </p>
                )}
            </div>
        </div>
    );
}

/* ─── System Services Tab ─────────────────────────────────────── */
function SystemTab({ settings }: { settings: any }) {
    return (
        <form action={saveGlobalSettingsAction} className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
            <input type="hidden" name="section" value="pulse_system" />
            <div className="p-6 border-b border-[#242429]">
                <h2 className="text-lg font-semibold text-[#EDEDED]">Pulse System Services</h2>
                <p className="text-sm text-[#8A8A90] mt-1">Enable advanced features like hot-reload, trusted proxies, local discovery, and CLI backends.</p>
            </div>
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            name="enableHotReload"
                            defaultChecked={settings.gatewayConfig?.enable_hot_reload ?? true}
                            className="w-4 h-4 text-[#8B5CF6] border-[#242429] rounded focus:ring-[#8B5CF6]"
                        />
                        <div>
                            <span className="text-sm font-medium text-[#EDEDED]">Enable Hot-Reload</span>
                            <p className="text-xs text-[#8A8A90]">Apply config changes without restarting</p>
                        </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            name="lanDiscovery"
                            defaultChecked={settings.gatewayConfig?.lan_discovery ?? false}
                            className="w-4 h-4 text-[#8B5CF6] border-[#242429] rounded focus:ring-[#8B5CF6]"
                        />
                        <div>
                            <span className="text-sm font-medium text-[#EDEDED]">LAN Discovery / Bonjour</span>
                            <p className="text-xs text-[#8A8A90]">Allow mDNS local gateway discovery</p>
                        </div>
                    </label>
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Trusted Proxy Network</label>
                        <input
                            type="text"
                            name="trustedProxy"
                            placeholder="10.0.0.0/8, 192.168.0.0/16"
                            defaultValue={settings.gatewayConfig?.trusted_proxy || ""}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg outline-none focus:ring-2 focus:ring-[#8B5CF6] text-[#EDEDED] placeholder:text-[#5A5A61]"
                        />
                        <p className="text-xs text-[#8A8A90] mt-1">Comma-separated CIDR list for trusted LB proxies.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">CLI Backends Integration</label>
                        <select
                            name="cliBackends"
                            defaultValue={settings.gatewayConfig?.cli_backends || "disabled"}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#0C0C0E] outline-none focus:ring-2 focus:ring-[#8B5CF6] text-[#EDEDED]"
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
            <form action={saveExecSafetySettings} className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                <div className="p-6 border-b border-[#242429]">
                    <h2 className="text-lg font-semibold text-[#EDEDED]">Global Policy</h2>
                    <p className="text-sm text-[#8A8A90] mt-1">These settings apply to all tenants as defaults.</p>
                </div>
                <div className="p-6 space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" name="enabled" defaultChecked={execSafety.enabled}
                            className="w-4 h-4 text-[#8B5CF6] border-[#242429] rounded focus:ring-[#8B5CF6]" />
                        <div>
                            <span className="text-sm font-medium text-[#EDEDED]">Enable Exec Safety</span>
                            <p className="text-xs text-[#8A8A90]">When disabled, all commands are allowed without checks.</p>
                        </div>
                    </label>
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Default Policy</label>
                        <select name="defaultPolicy" defaultValue={execSafety.defaultPolicy}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#0C0C0E] outline-none focus:ring-2 focus:ring-[#8B5CF6] text-[#EDEDED]">
                            <option value="allow_all">Allow All (log everything)</option>
                            <option value="allowlist_only">Allowlist Only (safe commands only)</option>
                            <option value="deny_all">Deny All (block everything)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Global Deny Patterns</label>
                        <textarea name="denyPatterns" rows={3} defaultValue={execSafety.globalDenyPatterns}
                            placeholder={"One pattern per line, e.g.:\nrm -rf *\n/DROP\\s+TABLE/i"}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6] text-[#EDEDED] placeholder:text-[#5A5A61] font-sans" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Global Allow Patterns</label>
                        <textarea name="allowPatterns" rows={3} defaultValue={execSafety.globalAllowPatterns}
                            placeholder={"One pattern per line, e.g.:\npython3 *\nls *"}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6] text-[#EDEDED] placeholder:text-[#5A5A61] font-sans" />
                    </div>
                    <div className="flex justify-end">
                        <SaveButton label="Save Policy" />
                    </div>
                </div>
            </form>

            {/* Policy Rules */}
            <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                <div className="p-6 border-b border-[#242429]">
                    <h2 className="text-lg font-semibold text-[#EDEDED]">Global Policy Rules</h2>
                    <p className="text-sm text-[#8A8A90] mt-1">Custom allow/deny rules evaluated by priority (highest first).</p>
                </div>
                <form action={addPolicyRule} className="p-6 border-b border-[#1C1C1F] bg-[#101012]">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <select name="ruleType" className="px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#0C0C0E] text-[#EDEDED]">
                            <option value="deny">Deny</option>
                            <option value="allow">Allow</option>
                        </select>
                        <input type="text" name="pattern" placeholder='Pattern (glob or /regex/)' required
                            className="px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED] placeholder:text-[#5A5A61] font-sans md:col-span-2" />
                        <input type="text" name="description" placeholder="Description"
                            className="px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED] placeholder:text-[#5A5A61]" />
                        <div className="flex gap-2">
                            <input type="number" name="priority" placeholder="Priority" defaultValue="0"
                                className="w-20 px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED]" />
                            <SaveButton label="Add" className="px-4 py-2 bg-[#8B5CF6] text-white rounded-lg text-sm font-medium hover:bg-[#A78BFA] transition-colors disabled:opacity-60" />
                        </div>
                    </div>
                </form>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs text-[#8A8A90] border-b border-[#1C1C1F]">
                                <th className="px-6 py-3 font-medium">Type</th>
                                <th className="px-6 py-3 font-medium">Pattern</th>
                                <th className="px-6 py-3 font-medium">Description</th>
                                <th className="px-6 py-3 font-medium">Priority</th>
                                <th className="px-6 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {policyRules.length === 0 && (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-[#5A5A61]">
                                    No custom policy rules configured. Built-in patterns are always active.
                                </td></tr>
                            )}
                            {policyRules.map((rule: any) => (
                                <tr key={rule.id} className="border-b border-[#1C1C1F] hover:bg-[#101012]">
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                            rule.ruleType === "deny" ? "bg-[#F0503C]/10 text-[#F0503C] border border-[#F0503C]/40" : "bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/40"
                                        }`}>{rule.ruleType}</span>
                                    </td>
                                    <td className="px-6 py-3 font-sans text-sm text-[#B5B5BA]">{rule.pattern}</td>
                                    <td className="px-6 py-3 text-sm text-[#8A8A90]">{rule.description || "\u2014"}</td>
                                    <td className="px-6 py-3 text-sm text-[#8A8A90]">{rule.priority}</td>
                                    <td className="px-6 py-3">
                                        <button
                                            onClick={() => setDeleteRuleId(rule.id)}
                                            className="text-xs text-[#F0503C] hover:text-[#F0503C]/80 font-medium"
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
            <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                <div className="p-6 border-b border-[#242429]">
                    <h2 className="text-lg font-semibold text-[#EDEDED]">Audit Log</h2>
                    <p className="text-sm text-[#8A8A90] mt-1">Recent command execution decisions ({auditLogs.total} total entries).</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs text-[#8A8A90] border-b border-[#1C1C1F]">
                                <th className="px-6 py-3 font-medium">Time</th>
                                <th className="px-6 py-3 font-medium">Decision</th>
                                <th className="px-6 py-3 font-medium">Command</th>
                                <th className="px-6 py-3 font-medium">Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {auditLogs.logs.length === 0 && (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-[#5A5A61]">
                                    No audit log entries yet. Exec events will appear here once agents run commands.
                                </td></tr>
                            )}
                            {auditLogs.logs.map((log: any) => (
                                <tr key={log.id} className="border-b border-[#1C1C1F] hover:bg-[#101012]">
                                    <td className="px-6 py-3 text-xs text-[#8A8A90] whitespace-nowrap">
                                        {log.executedAt ? new Date(log.executedAt).toLocaleString() : "\u2014"}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                            log.decision === "denied" ? "bg-[#F0503C]/10 text-[#F0503C] border border-[#F0503C]/40"
                                                : log.decision === "sandboxed" ? "bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/40"
                                                    : "bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/40"
                                        }`}>{log.decision}</span>
                                    </td>
                                    <td className="px-6 py-3 font-sans text-xs text-[#B5B5BA] max-w-xs truncate">
                                        {log.command.length > 100 ? log.command.substring(0, 100) + "..." : log.command}
                                    </td>
                                    <td className="px-6 py-3 text-xs text-[#8A8A90] max-w-xs truncate">
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
        <form action={saveMemorySettingsAction} className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
            <div className="p-6 border-b border-[#242429]">
                <h2 className="text-lg font-semibold text-[#EDEDED]">Memory System</h2>
                <p className="text-sm text-[#8A8A90] mt-1">Configure agent long-term memory and vector search.</p>
            </div>
            <div className="p-6 space-y-6">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" name="enabled" defaultChecked={config.enabled !== false}
                        className="w-4 h-4 text-[#8B5CF6] border-[#242429] rounded focus:ring-[#8B5CF6]" />
                    <div>
                        <span className="text-sm font-medium text-[#EDEDED]">Enable Memory System</span>
                        <p className="text-xs text-[#8A8A90]">When disabled, agents cannot store or recall memories.</p>
                    </div>
                </label>
                <div>
                    <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Embedding Model</label>
                    <select name="embeddingModel" defaultValue={config.embedding_model || "text-embedding-3-small"}
                        className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#0C0C0E] text-[#EDEDED]">
                        <option value="text-embedding-3-small">text-embedding-3-small (1536d, fast)</option>
                        <option value="text-embedding-3-large">text-embedding-3-large (3072d, more accurate)</option>
                    </select>
                    <p className="text-xs text-[#5A5A61] mt-1">Requires OPENAI_API_KEY. Falls back to keyword-only search without it.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Max Memories per Agent</label>
                        <input type="number" name="maxMemories" defaultValue={config.max_memories_per_agent || 10000}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED]" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Decay Half-Life (days)</label>
                        <input type="number" name="decayHalfLife" defaultValue={config.decay_half_life_days || 30}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED]" />
                        <p className="text-xs text-[#5A5A61] mt-1">After this many days, a memory&apos;s relevance score halves.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">MMR Lambda (0.0-1.0)</label>
                        <input type="number" name="mmrLambda" step="0.1" min="0" max="1" defaultValue={config.mmr_lambda || 0.7}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED]" />
                        <p className="text-xs text-[#5A5A61] mt-1">1.0 = pure relevance, 0.0 = max diversity.</p>
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
        <form action={saveSandboxSettingsAction} className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
            <div className="p-6 border-b border-[#242429]">
                <h2 className="text-lg font-semibold text-[#EDEDED]">Python Sandbox</h2>
                <p className="text-sm text-[#8A8A90] mt-1">Docker image, resource limits, timeouts, and network access for agent code execution.</p>
            </div>
            <div className="p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Python Docker Image</label>
                    <input type="text" name="pythonImage" defaultValue={config.image || "pulse-python-sandbox:latest"}
                        className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED] font-sans" />
                    <p className="text-xs text-[#5A5A61] mt-1">Build with: docker build -t pulse-python-sandbox pulse/docker/python-sandbox/</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Memory Limit</label>
                        <select name="memoryLimit" defaultValue={config.memory_limit || "256m"}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#0C0C0E] text-[#EDEDED]">
                            <option value="128m">128 MB</option>
                            <option value="256m">256 MB</option>
                            <option value="512m">512 MB</option>
                            <option value="1g">1 GB</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">CPU Limit</label>
                        <select name="cpuLimit" defaultValue={config.cpu_limit || "1.0"}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#0C0C0E] text-[#EDEDED]">
                            <option value="0.5">0.5 CPU</option>
                            <option value="1.0">1.0 CPU</option>
                            <option value="2.0">2.0 CPU</option>
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Default Timeout (seconds)</label>
                        <input type="number" name="defaultTimeout" defaultValue={config.default_timeout || 60}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED]" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Max Timeout (seconds)</label>
                        <input type="number" name="maxTimeout" defaultValue={config.max_timeout || 300}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED]" />
                    </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" name="networkEnabled" defaultChecked={config.network_enabled !== false}
                        className="w-4 h-4 text-[#8B5CF6] border-[#242429] rounded focus:ring-[#8B5CF6]" />
                    <div>
                        <span className="text-sm font-medium text-[#EDEDED]">Network Access</span>
                        <p className="text-xs text-[#8A8A90]">Allow sandbox containers to make outbound API calls</p>
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
            <form action={saveSchedulingSettingsAction} className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                <div className="p-6 border-b border-[#242429]">
                    <h2 className="text-lg font-semibold text-[#EDEDED]">Scheduling Settings</h2>
                    <p className="text-sm text-[#8A8A90] mt-1">Configure global scheduling settings for cron jobs and scheduled tasks.</p>
                </div>
                <div className="p-6 space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" name="enabled" defaultChecked={config.enabled !== false}
                            className="w-4 h-4 text-[#8B5CF6] border-[#242429] rounded focus:ring-[#8B5CF6]" />
                        <div>
                            <span className="text-sm font-medium text-[#EDEDED]">Enable Scheduling System</span>
                            <p className="text-xs text-[#8A8A90]">When disabled, no scheduled jobs will execute.</p>
                        </div>
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Max Jobs per Tenant</label>
                            <input type="number" name="maxJobsPerTenant" defaultValue={config.max_jobs_per_tenant || 50} min={1}
                                className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED]" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Max Jobs per Agent</label>
                            <input type="number" name="maxJobsPerAgent" defaultValue={config.max_jobs_per_agent || 10} min={1}
                                className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED]" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Min Interval (seconds)</label>
                            <input type="number" name="minInterval" defaultValue={config.min_interval_seconds || 300} min={60}
                                className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm text-[#EDEDED]" />
                            <p className="text-xs text-[#5A5A61] mt-1">Minimum seconds between runs. Default: 300 (5 min).</p>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <SaveButton label="Save Scheduling Settings" />
                    </div>
                </div>
            </form>

            {/* Active Jobs Overview */}
            <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                <div className="p-6 border-b border-[#242429]">
                    <h2 className="text-lg font-semibold text-[#EDEDED]">All Scheduled Jobs</h2>
                    <p className="text-sm text-[#8A8A90] mt-1">{allJobs.length} total jobs, {enabledCount} enabled</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs text-[#8A8A90] border-b border-[#1C1C1F]">
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
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-[#5A5A61]">
                                    No scheduled jobs across any tenant.
                                </td></tr>
                            )}
                            {allJobs.map((job: any) => {
                                const schedule = job.cronExpression
                                    || (job.intervalSeconds ? `every ${job.intervalSeconds}s` : `once at ${job.runAt ? new Date(job.runAt).toLocaleString() : "\u2014"}`);
                                return (
                                    <tr key={job.id} className="border-b border-[#1C1C1F] hover:bg-[#101012]">
                                        <td className="px-6 py-3 text-sm font-medium text-[#EDEDED]">{job.name}</td>
                                        <td className="px-6 py-3 text-sm text-[#8A8A90]">{job.agentName || "\u2014"}</td>
                                        <td className="px-6 py-3">
                                            <code className="text-xs bg-[#141417] text-[#B5B5BA] px-2 py-1 rounded">{schedule}</code>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#8A8A90]">{job.timezone || "UTC"}</td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                job.enabled ? "bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/40" : "bg-[#141417] text-[#8A8A90] border border-[#242429]"
                                            }`}>{job.enabled ? "Enabled" : "Disabled"}</span>
                                        </td>
                                        <td className="px-6 py-3 text-xs text-[#5A5A61]">
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

/* ─── Model Pricing Tab ──────────────────────────────────────── */
function ModelPricingTab({ models }: { models: ModelPricingEntry[] }) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [syncStatus, setSyncStatus] = useState<string>("");
    const [showAddForm, setShowAddForm] = useState(false);

    // Group models by provider
    const grouped: Record<string, ModelPricingEntry[]> = {};
    for (const m of models) {
        if (!grouped[m.provider]) grouped[m.provider] = [];
        grouped[m.provider].push(m);
    }

    const providers = Object.keys(grouped).sort();

    const handleSync = async (provider: string) => {
        setSyncStatus(`Syncing ${provider}...`);
        const fd = new FormData();
        fd.set("provider", provider);
        const result = await syncProviderModelsAction(fd);
        setSyncStatus(result.message || "Done");
        setTimeout(() => setSyncStatus(""), 5000);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Remove this model from pricing?")) return;
        const fd = new FormData();
        fd.set("id", id);
        await deleteModelPricingAction(fd);
    };

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const result = await saveModelPricingAction(fd);
        if (result.success) {
            setEditingId(null);
            setShowAddForm(false);
        }
    };

    const formatPrice = (n: number) => {
        if (n < 1) return `$${n.toFixed(3)}`;
        return `$${n.toFixed(2)}`;
    };

    const calcMarkup = (base: number, customer: number) => {
        if (base === 0) return "N/A";
        const pct = ((customer - base) / base) * 100;
        if (pct === 0) return "0%";
        return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-[#EDEDED]">Model Pricing</h3>
                    <p className="text-sm text-[#8A8A90] mt-1">
                        Set base cost (what you pay) and customer price (what you charge). The difference is your profit.
                    </p>
                </div>
                <div className="flex gap-2">
                    {["anthropic", "openai", "google", "openrouter", "minimax"].map((p) => (
                        <button
                            key={p}
                            onClick={() => handleSync(p)}
                            className="px-3 py-1.5 text-xs font-medium bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/40 rounded-lg hover:bg-[#8B5CF6]/20"
                        >
                            Sync {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="px-3 py-1.5 text-xs font-medium bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/40 rounded-lg hover:bg-[#3FB950]/20"
                    >
                        + Add Model
                    </button>
                </div>
            </div>

            {syncStatus && (
                <div className="bg-[#8B5CF6]/10 border border-[#8B5CF6]/40 text-[#8B5CF6] rounded-lg p-3 text-sm">
                    {syncStatus}
                </div>
            )}

            {showAddForm && (
                <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] p-6">
                    <h4 className="text-sm font-semibold text-[#EDEDED] mb-4">Add New Model</h4>
                    <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-[#B5B5BA] mb-1">Provider</label>
                            <select name="provider" className="w-full border border-[#242429] rounded-lg px-3 py-2 text-sm" required>
                                <option value="anthropic">Anthropic</option>
                                <option value="openai">OpenAI</option>
                                <option value="google">Google</option>
                                <option value="openrouter">OpenRouter</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#B5B5BA] mb-1">Model ID</label>
                            <input name="modelId" type="text" placeholder="claude-sonnet-4-6" className="w-full border border-[#242429] rounded-lg px-3 py-2 text-sm" required />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#B5B5BA] mb-1">Display Name</label>
                            <input name="displayName" type="text" placeholder="Claude Sonnet 4.6" className="w-full border border-[#242429] rounded-lg px-3 py-2 text-sm" required />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#B5B5BA] mb-1">Category</label>
                            <select name="category" className="w-full border border-[#242429] rounded-lg px-3 py-2 text-sm">
                                <option value="flagship">Flagship</option>
                                <option value="fast">Fast</option>
                                <option value="reasoning">Reasoning</option>
                                <option value="passthrough">Passthrough</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#B5B5BA] mb-1">Base Input $/1M tokens</label>
                            <input name="baseInputPerMillion" type="number" step="0.001" defaultValue="3.0" className="w-full border border-[#242429] rounded-lg px-3 py-2 text-sm" required />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#B5B5BA] mb-1">Base Output $/1M tokens</label>
                            <input name="baseOutputPerMillion" type="number" step="0.001" defaultValue="15.0" className="w-full border border-[#242429] rounded-lg px-3 py-2 text-sm" required />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#B5B5BA] mb-1">Customer Input $/1M tokens</label>
                            <input name="customerInputPerMillion" type="number" step="0.001" defaultValue="3.0" className="w-full border border-[#242429] rounded-lg px-3 py-2 text-sm" required />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#B5B5BA] mb-1">Customer Output $/1M tokens</label>
                            <input name="customerOutputPerMillion" type="number" step="0.001" defaultValue="15.0" className="w-full border border-[#242429] rounded-lg px-3 py-2 text-sm" required />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[#B5B5BA] mb-1">Max Tokens</label>
                            <input name="maxTokens" type="number" defaultValue="8192" className="w-full border border-[#242429] rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <div className="flex items-end gap-2">
                            <button type="submit" className="px-4 py-2 bg-[#8B5CF6] text-white text-sm rounded-lg hover:bg-[#A78BFA]">
                                Save
                            </button>
                            <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 bg-[#141417] text-[#B5B5BA] text-sm rounded-lg hover:bg-[#1C1C1F]">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {providers.map((provider) => (
                <div key={provider} className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                    <div className="p-4 border-b border-[#242429] bg-[#101012]">
                        <h4 className="text-sm font-semibold text-[#EDEDED] capitalize">{provider}</h4>
                        <p className="text-xs text-[#8A8A90]">{grouped[provider].length} models</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[#1C1C1F]">
                                    <th className="text-left px-4 py-2 text-xs font-medium text-[#8A8A90]">Model</th>
                                    <th className="text-left px-4 py-2 text-xs font-medium text-[#8A8A90]">Category</th>
                                    <th className="text-right px-4 py-2 text-xs font-medium text-[#8A8A90]">Base $/1M tokens (In/Out)</th>
                                    <th className="text-right px-4 py-2 text-xs font-medium text-[#8A8A90]">Customer $/1M tokens (In/Out)</th>
                                    <th className="text-right px-4 py-2 text-xs font-medium text-[#8A8A90]">Markup</th>
                                    <th className="text-center px-4 py-2 text-xs font-medium text-[#8A8A90]">Active</th>
                                    <th className="text-right px-4 py-2 text-xs font-medium text-[#8A8A90]">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grouped[provider].map((model) => (
                                    editingId === model.id ? (
                                        <tr key={model.id} className="border-b border-[#1C1C1F]">
                                            <td colSpan={7} className="p-4">
                                                <form onSubmit={handleSave} className="grid grid-cols-4 gap-3">
                                                    <input type="hidden" name="provider" value={model.provider} />
                                                    <input type="hidden" name="modelId" value={model.modelId} />
                                                    <div>
                                                        <label className="block text-xs text-[#8A8A90] mb-1">Display Name</label>
                                                        <input name="displayName" defaultValue={model.displayName} className="w-full border border-[#242429] rounded px-2 py-1 text-sm" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-[#8A8A90] mb-1">Category</label>
                                                        <select name="category" defaultValue={model.category} className="w-full border border-[#242429] rounded px-2 py-1 text-sm">
                                                            <option value="flagship">Flagship</option>
                                                            <option value="fast">Fast</option>
                                                            <option value="reasoning">Reasoning</option>
                                                            <option value="passthrough">Passthrough</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-[#8A8A90] mb-1">Base Input $/1M</label>
                                                        <input name="baseInputPerMillion" type="number" step="0.001" defaultValue={model.baseInputPerMillion} className="w-full border border-[#242429] rounded px-2 py-1 text-sm" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-[#8A8A90] mb-1">Base Output $/1M</label>
                                                        <input name="baseOutputPerMillion" type="number" step="0.001" defaultValue={model.baseOutputPerMillion} className="w-full border border-[#242429] rounded px-2 py-1 text-sm" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-[#8A8A90] mb-1">Customer Input $/1M</label>
                                                        <input name="customerInputPerMillion" type="number" step="0.001" defaultValue={model.customerInputPerMillion} className="w-full border border-[#242429] rounded px-2 py-1 text-sm" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-[#8A8A90] mb-1">Customer Output $/1M</label>
                                                        <input name="customerOutputPerMillion" type="number" step="0.001" defaultValue={model.customerOutputPerMillion} className="w-full border border-[#242429] rounded px-2 py-1 text-sm" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-[#8A8A90] mb-1">Max Tokens</label>
                                                        <input name="maxTokens" type="number" defaultValue={model.maxTokens} className="w-full border border-[#242429] rounded px-2 py-1 text-sm" />
                                                    </div>
                                                    <div className="flex items-end gap-2">
                                                        <button type="submit" className="px-3 py-1 bg-[#8B5CF6] text-white text-xs rounded hover:bg-[#A78BFA]">Save</button>
                                                        <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1 bg-[#141417] text-[#B5B5BA] text-xs rounded hover:bg-[#1C1C1F]">Cancel</button>
                                                    </div>
                                                </form>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={model.id} className="border-b border-[#1C1C1F] hover:bg-[#101012]">
                                            <td className="px-4 py-2.5">
                                                <div className="font-medium text-[#EDEDED]">{model.displayName}</div>
                                                <div className="text-xs text-[#5A5A61] font-sans">{model.modelId}</div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                                    model.category === "flagship" ? "bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/40" :
                                                    model.category === "fast" ? "bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/40" :
                                                    model.category === "reasoning" ? "bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/40" :
                                                    "bg-[#141417] text-[#8A8A90] border border-[#242429]"
                                                }`}>
                                                    {model.category}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-sans text-xs text-[#B5B5BA]">
                                                {formatPrice(model.baseInputPerMillion)} / {formatPrice(model.baseOutputPerMillion)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-sans text-xs text-[#EDEDED] font-medium">
                                                {formatPrice(model.customerInputPerMillion)} / {formatPrice(model.customerOutputPerMillion)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className={`text-xs font-medium ${
                                                    model.customerInputPerMillion > model.baseInputPerMillion ? "text-[#3FB950]" : "text-[#5A5A61]"
                                                }`}>
                                                    {calcMarkup(model.baseInputPerMillion, model.customerInputPerMillion)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className={`w-2 h-2 rounded-full inline-block ${model.isActive ? "bg-[#3FB950]" : "bg-[#5A5A61]"}`} />
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <button
                                                    onClick={() => setEditingId(model.id)}
                                                    className="text-xs text-[#8B5CF6] hover:text-[#A78BFA] mr-2"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(model.id)}
                                                    className="text-xs text-[#F0503C] hover:text-[#F0503C]/80"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}

            {models.length === 0 && (
                <div className="text-center py-12 text-[#8A8A90]">
                    <p className="text-lg font-medium">No models configured</p>
                    <p className="text-sm mt-1">Click &quot;Sync&quot; to auto-discover models from your connected providers, or add them manually.</p>
                </div>
            )}

            {/* Profit Summary */}
            {models.length > 0 && (
                <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] p-6">
                    <h4 className="text-sm font-semibold text-[#EDEDED] mb-3">Pricing Summary</h4>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-[#101012] rounded-lg p-4">
                            <p className="text-xs text-[#8A8A90] mb-1">Total Models</p>
                            <p className="text-2xl font-bold text-[#EDEDED]">{models.length}</p>
                        </div>
                        <div className="bg-[#3FB950]/10 rounded-lg p-4">
                            <p className="text-xs text-[#3FB950] mb-1">Models with Markup</p>
                            <p className="text-2xl font-bold text-[#3FB950]">
                                {models.filter((m) => m.customerInputPerMillion > m.baseInputPerMillion || m.customerOutputPerMillion > m.baseOutputPerMillion).length}
                            </p>
                        </div>
                        <div className="bg-[#8B5CF6]/10 rounded-lg p-4">
                            <p className="text-xs text-[#8B5CF6] mb-1">Active Models</p>
                            <p className="text-2xl font-bold text-[#8B5CF6]">
                                {models.filter((m) => m.isActive).length}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Database & Security Tab ─────────────────────────────────── */
function DatabaseTab() {
    return (
        <div className="space-y-6">
            <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                <div className="p-6 border-b border-[#242429]">
                    <h2 className="text-lg font-semibold text-[#EDEDED]">PostgreSQL Connection</h2>
                </div>
                <div className="p-6">
                    <label className="block text-sm font-medium text-[#B5B5BA] mb-1">DATABASE_URL</label>
                    <input type="text" readOnly value="postgres://pulseadmin:******@localhost:5432/pulse"
                        className="w-full px-4 py-2 bg-[#101012] border border-[#242429] rounded-lg text-[#8A8A90] focus:outline-none font-sans text-sm" />
                    <div className="mt-4 flex gap-3">
                        <button className="px-4 py-2 text-sm bg-[#141417] text-[#B5B5BA] rounded-lg font-medium hover:bg-[#1C1C1F] transition-colors">
                            Test Connection
                        </button>
                        <button className="px-4 py-2 text-sm bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/40 rounded-lg font-medium hover:bg-[#8B5CF6]/20 transition-colors">
                            Run Migrations
                        </button>
                    </div>
                </div>
            </div>
            <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                <div className="p-6 border-b border-[#242429]">
                    <h2 className="text-lg font-semibold text-[#EDEDED]">Security & Encryption</h2>
                </div>
                <div className="p-6">
                    <div className="flex items-center justify-between p-4 bg-[#101012] rounded-lg border border-[#242429]">
                        <div>
                            <p className="font-medium text-[#EDEDED]">ENCRYPTION_KEY Status</p>
                            <p className="text-sm text-[#8A8A90]">Used for signing OAuth tokens and NextAuth sessions.</p>
                        </div>
                        <span className="px-3 py-1 bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/40 rounded-full text-xs font-semibold">Valid (64-byte Hex)</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Skills Defaults Tab ────────────────────────────────────────── */
function SkillsDefaultsTab({ defaultSkills }: { defaultSkills: string[] }) {
    const [enabled, setEnabled] = useState<string[]>(defaultSkills);
    const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });

    const allSkillNames = BUILTIN_SKILLS.map((s) => s.name);
    const noDefaultsSet = defaultSkills.length === 0;

    function toggle(name: string) {
        setEnabled((prev) =>
            prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
        );
    }

    function selectAll() {
        setEnabled([...allSkillNames]);
    }

    function clearAll() {
        setEnabled([]);
    }

    async function handleSave() {
        setStatus({ type: "saving", message: "" });
        const fd = new FormData();
        fd.set("defaultSkills", JSON.stringify(enabled));
        const result = await saveDefaultSkillsAction(fd);
        setStatus({
            type: result.success ? "success" : "error",
            message: result.message ?? "",
        });
    }

    const categories = [
        { id: "core" as const, label: "Core" },
        { id: "productivity" as const, label: "Productivity" },
        { id: "meta" as const, label: "Meta" },
    ];

    return (
        <div className="space-y-6">
            <div className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                <div className="p-6 border-b border-[#242429]">
                    <h2 className="text-lg font-semibold text-[#EDEDED]">Default Skills</h2>
                    <p className="text-sm text-[#8A8A90] mt-1">
                        Select which built-in skills are enabled by default for all agents.
                        Individual agents can override these settings.
                    </p>
                    {noDefaultsSet && (
                        <p className="text-xs text-[#8B5CF6] mt-2">
                            No defaults configured yet — all skills are enabled for all agents. Save to set explicit defaults.
                        </p>
                    )}
                </div>
                <div className="p-6 space-y-6">
                    <div className="flex gap-2">
                        <button onClick={selectAll} className="text-xs text-[#8B5CF6] hover:text-[#A78BFA] font-medium">
                            Select All
                        </button>
                        <span className="text-xs text-[#5A5A61]">|</span>
                        <button onClick={clearAll} className="text-xs text-[#8A8A90] hover:text-[#B5B5BA] font-medium">
                            Clear All
                        </button>
                    </div>

                    {categories.map((cat) => {
                        const skills = BUILTIN_SKILLS.filter((s) => s.category === cat.id);
                        if (skills.length === 0) return null;
                        return (
                            <div key={cat.id}>
                                <h3 className="text-xs font-semibold text-[#8A8A90] uppercase tracking-wider mb-3">{cat.label}</h3>
                                <div className="grid gap-3">
                                    {skills.map((skill) => {
                                        const isEnabled = enabled.includes(skill.name);
                                        return (
                                            <div
                                                key={skill.name}
                                                className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                                                    isEnabled
                                                        ? "border-[#8B5CF6]/40 bg-[#8B5CF6]/10"
                                                        : "border-[#242429] bg-[#101012]/50"
                                                }`}
                                            >
                                                <div>
                                                    <span className="text-sm font-medium text-[#EDEDED]">{skill.name}</span>
                                                    <p className="text-xs text-[#8A8A90] mt-0.5">{skill.description}</p>
                                                </div>
                                                <button
                                                    onClick={() => toggle(skill.name)}
                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                        isEnabled ? "bg-[#3FB950]" : "bg-[#242429]"
                                                    }`}
                                                >
                                                    <span
                                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                            isEnabled ? "translate-x-6" : "translate-x-1"
                                                        }`}
                                                    />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={status.type === "saving"}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-[#8B5CF6] rounded-lg hover:bg-[#A78BFA] transition-colors disabled:opacity-50"
                >
                    {status.type === "saving" ? "Saving..." : "Save Defaults"}
                </button>
                {status.type === "success" && (
                    <span className="text-sm text-[#3FB950]">{status.message}</span>
                )}
                {status.type === "error" && (
                    <span className="text-sm text-[#F0503C]">{status.message}</span>
                )}
            </div>
        </div>
    );
}
