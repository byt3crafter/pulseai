"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import SaveButton from "../../../components/SaveButton";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { ui, PageHeader, Panel, Badge, StatusDot } from "../../../components/admin/ui";
import TwoFactorCard from "../../../components/TwoFactorCard";
import ChangePasswordCard from "../../../components/ChangePasswordCard";
import { PLATFORM_ROLES, TENANT_ROLES, ROLE_LABELS } from "../../../utils/permissions";
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
    saveSsoSettingsAction,
    setBillingModeAction,
    saveBrandingAction,
    type EmailSettingsView,
    type SsoSettingsView,
} from "./actions";
import { BUILTIN_SKILLS } from "../../../utils/skills-registry";
import {
    saveExecSafetySettings,
    addPolicyRule,
    deletePolicyRule,
} from "./exec-safety/actions";

const TABS = [
    { id: "branding", label: "Branding" },
    { id: "providers", label: "AI Providers" },
    { id: "billing", label: "Billing" },
    { id: "model-pricing", label: "Model Pricing" },
    { id: "system", label: "System Services" },
    { id: "email", label: "Email (SMTP)" },
    { id: "sso", label: "SSO (OIDC)" },
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
    ssoSettings: SsoSettingsView | null;
    canWrite: boolean;
    canBilling: boolean;
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

/* ─── Shared field-level helpers ─────────────────────────────────
   Small presentational-only helpers local to this file so every
   tab renders identical toggle switches and inline alert boxes. */

function Toggle({
    name,
    checked,
    defaultChecked,
    onChange,
    label,
    description,
}: {
    name?: string;
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (checked: boolean) => void;
    label: string;
    description?: string;
}) {
    const inputProps = onChange
        ? { checked: checked ?? false, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked) }
        : { defaultChecked };

    return (
        <label className="flex items-center gap-3 cursor-pointer">
            <span className="relative inline-flex h-5 w-9 flex-shrink-0 items-center">
                <input type="checkbox" name={name} className="peer sr-only" {...inputProps} />
                <span
                    className="absolute inset-0 rounded-full bg-pulse-border transition-colors motion-reduce:transition-none peer-checked:bg-pulse-profit"
                    aria-hidden="true"
                />
                <span
                    className="absolute left-0.5 h-4 w-4 rounded-full bg-white transition-transform motion-reduce:transition-none peer-checked:translate-x-4"
                    aria-hidden="true"
                />
            </span>
            <span>
                <span className="block text-[13px] font-medium text-pulse-text">{label}</span>
                {description && <span className="block text-[11px] text-pulse-muted mt-0.5">{description}</span>}
            </span>
        </label>
    );
}

function InlineMessage({ variant, text }: { variant: "success" | "danger" | "accent"; text: string }) {
    const styles: Record<string, string> = {
        success: "bg-pulse-profit/10 text-pulse-profit border-pulse-profit/30",
        danger: "bg-pulse-loss/10 text-pulse-loss border-pulse-loss/30",
        accent: "bg-pulse-accent/10 text-pulse-accent border-pulse-accent/30",
    };
    return <div className={`text-[13px] rounded-md border px-3 py-2 ${styles[variant]}`}>{text}</div>;
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
    ssoSettings,
    canWrite,
    canBilling,
}: Props) {
    return (
        <div className={ui.page}>
            <PageHeader
                title="Global Settings"
                subtitle="Manage platform configuration, providers, security, and services."
            />

            <div className="flex gap-6">
                {/* Left tab nav */}
                <nav className="w-44 flex-shrink-0">
                    <ul className="space-y-0.5">
                        {TABS.map((t) => (
                            <li key={t.id}>
                                <Link
                                    href={`/admin/settings?tab=${t.id}`}
                                    className={`relative block text-[13px] font-medium px-3 py-2 rounded-md transition-colors motion-reduce:transition-none ${
                                        tab === t.id
                                            ? "bg-pulse-tint text-pulse-accent"
                                            : "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text"
                                    }`}
                                >
                                    {tab === t.id && (
                                        <span
                                            className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-pulse-accent"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {t.label}
                                </Link>
                            </li>
                        ))}
                        <li className="mt-2 pt-2 border-t border-pulse-border-subtle">
                            <Link
                                href="/admin/plugins"
                                className="block text-[13px] font-medium px-3 py-2 rounded-md text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text transition-colors motion-reduce:transition-none"
                            >
                                Plugins
                            </Link>
                        </li>
                    </ul>
                </nav>

                {/* Tab content */}
                <div className="flex-1 min-w-0">
                    {tab === "branding" && <BrandingTab initial={(settings as any)?.config?.branding ?? {}} canWrite={canWrite} />}
                    {tab === "providers" && <ProvidersTab providerStatuses={providerStatuses} canWrite={canWrite} />}
                    {tab === "billing" && <BillingTab initialMode={((settings as any)?.config?.billingMode === "unlimited") ? "unlimited" : "credits"} canWrite={canBilling || canWrite} />}
                    {tab === "system" && <SystemTab settings={settings} canWrite={canWrite} />}
                    {tab === "email" && <EmailTab settings={emailSettings} canWrite={canWrite} />}
                    {tab === "sso" && <SsoTab settings={ssoSettings} canWrite={canWrite} />}
                    {tab === "exec-safety" && (
                        <ExecSafetyTab execSafety={execSafety} auditLogs={auditLogs} policyRules={policyRules} />
                    )}
                    {tab === "memory" && <MemoryTab config={memoryConfig} canWrite={canWrite} />}
                    {tab === "sandbox" && <SandboxTab config={sandboxConfig} canWrite={canWrite} />}
                    {tab === "scheduling" && <SchedulingTab config={schedulingConfig} allJobs={allJobs} canWrite={canWrite} />}
                    {tab === "skills" && <SkillsDefaultsTab defaultSkills={defaultSkills} canWrite={canWrite} />}
                    {tab === "model-pricing" && <ModelPricingTab models={modelPricing} canBilling={canBilling} />}
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

function BrandingTab({ initial, canWrite }: { initial: any; canWrite: boolean }) {
    const [productName, setProductName] = useState(initial?.productName ?? "Pulse AI");
    const [companyName, setCompanyName] = useState(initial?.companyName ?? "Runstate Ltd");
    const [supportEmail, setSupportEmail] = useState(initial?.supportEmail ?? "");
    const [logo, setLogo] = useState<string | null>(initial?.logoDataUrl ?? null);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    async function onLogo(file: File) {
        // Downscale to a small square PNG data URL, entirely client-side.
        const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(); r.readAsDataURL(file); });
        if (file.type === "image/svg+xml") { setLogo(dataUrl); return; }
        const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(); i.src = dataUrl; });
        const S = 128; const c = document.createElement("canvas"); c.width = S; c.height = S;
        const ctx = c.getContext("2d"); if (!ctx) { setLogo(dataUrl); return; }
        const scale = Math.min(S / img.width, S / img.height); const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        setLogo(c.toDataURL("image/png"));
    }

    async function save() {
        setSaving(true); setMsg(null);
        const res = await saveBrandingAction({ productName, companyName, logoDataUrl: logo, supportEmail: supportEmail || null });
        setMsg({ ok: res.success, text: res.message });
        setSaving(false);
    }

    return (
        <Panel bodyClassName="p-6">
            <h2 className="text-[15px] font-semibold text-pulse-text mb-1">Branding</h2>
            <p className="text-[13px] text-pulse-muted mb-4">White-label this deployment. These apply everywhere the product name and logo appear — admin, login, the customer dashboard. No code change needed.</p>
            <div className="space-y-4 max-w-lg">
                <div>
                    <label className="block text-xs font-medium text-pulse-text-soft mb-1">Product name</label>
                    <input value={productName} onChange={(e) => setProductName(e.target.value)} disabled={!canWrite} maxLength={60} placeholder="Pulse AI" className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-pulse-text-soft mb-1">Company name (footer)</label>
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={!canWrite} maxLength={100} placeholder="Runstate Ltd" className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-pulse-text-soft mb-1">Support email (optional)</label>
                    <input value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} disabled={!canWrite} maxLength={160} placeholder="support@company.com" className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-pulse-text-soft mb-1">Logo (optional, square, PNG/SVG)</label>
                    <div className="flex items-center gap-3">
                        {logo
                            ? <img src={logo} alt="logo" className="h-12 w-12 rounded-lg border border-pulse-border object-contain bg-pulse-panel" />
                            : <div className="h-12 w-12 rounded-lg border border-pulse-border-subtle bg-pulse-panel-alt" />}
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={!canWrite} onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogo(f); }} className="text-xs text-pulse-muted" />
                        {logo && <button type="button" onClick={() => setLogo(null)} className="text-xs text-red-500">Remove</button>}
                    </div>
                    <p className="mt-1 text-xs text-pulse-faint">Replaces the default mark. Downscaled to 128px. Leave empty to keep the default logo.</p>
                </div>
                <button type="button" onClick={save} disabled={!canWrite || saving} className="rounded-lg bg-pulse-accent px-4 py-2 text-sm font-medium text-white hover:bg-pulse-accent-hi disabled:opacity-50">
                    {saving ? "Saving…" : "Save branding"}
                </button>
                {!canWrite && <p className="text-[12px] text-pulse-faint">You don&apos;t have permission to change branding.</p>}
                {msg && <p className={`text-[13px] ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</p>}
            </div>
        </Panel>
    );
}

function BillingTab({ initialMode, canWrite }: { initialMode: "credits" | "unlimited"; canWrite: boolean }) {
    const [mode, setMode] = useState<"credits" | "unlimited">(initialMode);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const save = async (m: "credits" | "unlimited") => {
        setSaving(true); setMsg(null);
        const res = await setBillingModeAction(m);
        setMsg(res.message);
        if (res.success) setMode(m);
        setSaving(false);
    };

    const options: Array<{ id: "credits" | "unlimited"; title: string; desc: string }> = [
        { id: "unlimited", title: "Unlimited (BYOK)", desc: "Dedicated deployment — the client runs on their own API key. No credit metering; the credits & top-up UI is hidden. Bill the software separately (one-off or licence)." },
        { id: "credits", title: "Managed credits", desc: "You provide the API key and meter usage. Clients see a credit balance and top up. Use for hosted/managed customers." },
    ];

    return (
        <Panel bodyClassName="p-6">
            <h2 className="text-[15px] font-semibold text-pulse-text mb-1">Billing Mode</h2>
            <p className="text-[13px] text-pulse-muted mb-4">Controls how this deployment bills for AI usage and whether the credits/top-up UI is shown to the workspace.</p>
            <div className="space-y-3">
                {options.map((o) => (
                    <label key={o.id} className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${mode === o.id ? "border-pulse-accent bg-pulse-accent/5" : "border-pulse-border hover:bg-pulse-hover"}`}>
                        <input
                            type="radio"
                            name="billingMode"
                            checked={mode === o.id}
                            disabled={!canWrite || saving}
                            onChange={() => save(o.id)}
                            className="mt-1 accent-pulse-accent"
                        />
                        <div>
                            <div className="text-[13px] font-medium text-pulse-text">{o.title}{mode === o.id && <span className="ml-2 text-[11px] text-pulse-accent">current</span>}</div>
                            <p className="text-[12px] text-pulse-muted mt-0.5">{o.desc}</p>
                        </div>
                    </label>
                ))}
            </div>
            {!canWrite && <p className="text-[12px] text-pulse-faint mt-3">You don&apos;t have permission to change billing settings.</p>}
            {msg && <p className="text-[13px] text-pulse-text-soft mt-3">{msg}</p>}
        </Panel>
    );
}

function ProvidersTab({ providerStatuses, canWrite }: { providerStatuses: Array<{ provider: string; hasKey: boolean }>; canWrite: boolean }) {
    const statusMap = Object.fromEntries(providerStatuses.map((s) => [s.provider, s.hasKey]));

    return (
        <Panel label="AI Model Providers">
            <p className="text-[13px] text-pulse-muted mb-4">
                Configure global API keys. Platform-mode tenants use these keys automatically.
            </p>
            {!canWrite && (
                <div className="mb-4">
                    <InlineMessage variant="accent" text="Read-only access — you do not have permission to modify provider keys." />
                </div>
            )}
            <div className="space-y-3">
                {PROVIDER_CARDS.map((pc) => (
                    <ProviderKeyCard
                        key={pc.id}
                        provider={pc.id}
                        name={pc.name}
                        description={pc.description}
                        placeholder={pc.placeholder}
                        hasKey={statusMap[pc.id] ?? false}
                        required={pc.required}
                        canWrite={canWrite}
                    />
                ))}
            </div>
        </Panel>
    );
}

function ProviderKeyCard({ provider, name, description, placeholder, hasKey, required, canWrite }: {
    provider: string;
    name: string;
    description: string;
    placeholder: string;
    hasKey: boolean;
    required?: boolean;
    canWrite: boolean;
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
        <div className="border border-pulse-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2.5">
                <div>
                    <span className="text-[13px] font-medium text-pulse-text">{name}</span>
                    <span className="text-[11px] text-pulse-muted ml-2">{description}</span>
                    {required && <span className="text-[11px] text-pulse-loss ml-1">*</span>}
                </div>
                <StatusDot variant={hasKey ? "success" : "neutral"}>{hasKey ? "Active" : "Not configured"}</StatusDot>
            </div>
            <div className="flex gap-2">
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setMessage(null); }}
                    placeholder={hasKey ? "•••••••••••• (enter new key to replace)" : placeholder}
                    disabled={!canWrite}
                    className={`${ui.input} flex-1 disabled:opacity-50 disabled:cursor-not-allowed`}
                />
                <button
                    type="button"
                    onClick={handleTest}
                    disabled={!apiKey.trim() || testing || !canWrite}
                    className={`${ui.btnGhost} px-1 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                    {testing ? "Testing…" : "Test"}
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!apiKey.trim() || saving || !canWrite}
                    className={ui.btnPrimary}
                >
                    {saving ? "Saving…" : "Save"}
                </button>
            </div>
            {message && (
                <div className="mt-2.5">
                    <InlineMessage variant={message.type === "success" ? "success" : "danger"} text={message.text} />
                </div>
            )}
        </div>
    );
}

/* ─── Email (SMTP) Tab ────────────────────────────────────────── */
function EmailTab({ settings, canWrite }: { settings: EmailSettingsView | null; canWrite: boolean }) {
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

    return (
        <Panel label="Email (SMTP)">
            <p className="text-[13px] text-pulse-muted mb-4">
                Used for account emails — password resets and user invitations. The password is encrypted at rest.
            </p>
            {!canWrite && (
                <div className="mb-4">
                    <InlineMessage variant="accent" text="Read-only access — you do not have permission to modify email settings." />
                </div>
            )}
            <fieldset disabled={!canWrite} className="space-y-4 border-0 p-0 m-0 min-w-0">
                <Toggle checked={enabled} onChange={setEnabled} label="Enable email sending" />

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>SMTP Host</label>
                        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" className={ui.input} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>Port</label>
                        <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" className={ui.input} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>Username</label>
                        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="you@example.com" className={ui.input} autoComplete="off" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={s.hasPassword ? "•••••••• (enter to replace)" : "SMTP password"} className={ui.input} autoComplete="new-password" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>From Address</label>
                        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="no-reply@example.com" className={ui.input} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>From Name <span className="text-pulse-faint font-normal">(optional)</span></label>
                        <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Pulse AI" className={ui.input} />
                    </div>
                </div>

                <Toggle
                    checked={secure}
                    onChange={setSecure}
                    label="Use implicit TLS (port 465)"
                    description="Leave off for STARTTLS (port 587)."
                />

                <div className="flex items-center gap-2 pt-2">
                    <button type="button" onClick={handleSave} disabled={saving} className={ui.btnPrimary}>
                        {saving ? "Saving…" : "Save settings"}
                    </button>
                </div>

                <div className="border-t border-pulse-border pt-4 mt-2">
                    <label className={ui.label}>Send a test email</label>
                    <div className="flex gap-2">
                        <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="recipient@example.com" className={ui.input} />
                        <button
                            type="button"
                            onClick={handleTest}
                            disabled={testing}
                            className={`${ui.btnSecondary} whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {testing ? "Sending…" : "Send test"}
                        </button>
                    </div>
                    <p className="text-[11px] text-pulse-faint mt-1.5">Uses the values above (saving first is not required).</p>
                </div>

                {message && <InlineMessage variant={message.type === "success" ? "success" : "danger"} text={message.text} />}
            </fieldset>
        </Panel>
    );
}

/* ─── SSO (OIDC) Tab ──────────────────────────────────────────── */
function SsoTab({ settings, canWrite }: { settings: SsoSettingsView | null; canWrite: boolean }) {
    const s = settings ?? {
        enabled: false, name: "SSO", issuer: "", clientId: "", hasSecret: false,
        allowedDomains: "", groupClaim: "groups", groupRoleMap: {} as Record<string, string>,
        defaultRole: "auditor", plane: "platform" as const, tenantId: null,
    };

    const [enabled, setEnabled] = useState(s.enabled);
    const [name, setName] = useState(s.name);
    const [issuer, setIssuer] = useState(s.issuer);
    const [clientId, setClientId] = useState(s.clientId);
    const [clientSecret, setClientSecret] = useState("");
    const [allowedDomains, setAllowedDomains] = useState(s.allowedDomains);
    const [groupClaim, setGroupClaim] = useState(s.groupClaim);
    const [groupRoleMap, setGroupRoleMap] = useState(
        Object.entries(s.groupRoleMap).map(([g, r]) => `${g}=${r}`).join("\n")
    );
    const [defaultRole, setDefaultRole] = useState(s.defaultRole);
    const [plane, setPlane] = useState<"platform" | "tenant">(s.plane);
    const [tenantId, setTenantId] = useState(s.tenantId || "");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [redirectUrl, setRedirectUrl] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setRedirectUrl(`${window.location.origin}/api/auth/callback/sso`);
        }
    }, []);

    const roleOptions = plane === "tenant" ? TENANT_ROLES : PLATFORM_ROLES;

    const handleCopy = async () => {
        if (!redirectUrl) return;
        try {
            await navigator.clipboard.writeText(redirectUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard unavailable — ignore */
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        const fd = new FormData();
        if (enabled) fd.set("enabled", "on");
        fd.set("name", name);
        fd.set("issuer", issuer);
        fd.set("clientId", clientId);
        if (clientSecret) fd.set("clientSecret", clientSecret);
        fd.set("allowedDomains", allowedDomains);
        fd.set("groupClaim", groupClaim);
        fd.set("groupRoleMap", groupRoleMap);
        fd.set("defaultRole", defaultRole);
        fd.set("plane", plane);
        fd.set("tenantId", tenantId);
        const result = await saveSsoSettingsAction(fd);
        setSaving(false);
        setMessage(result.success
            ? { type: "success", text: result.message || "Saved" }
            : { type: "error", text: result.message || "Failed to save" });
        if (result.success) setClientSecret("");
    };

    return (
        <Panel label="SSO (OIDC)">
            <p className="text-[13px] text-pulse-muted mb-4">
                Let users sign in via an external identity provider. Existing email/password login is unaffected unless you enable this.
            </p>

            <div className="mb-4 rounded-md border border-pulse-border bg-pulse-panel-alt px-3.5 py-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-pulse-muted mb-1.5">Redirect / callback URL</p>
                <div className="flex items-center gap-2">
                    <code className="flex-1 text-[13px] text-pulse-text font-mono break-all">{redirectUrl || "…"}</code>
                    <button
                        type="button"
                        onClick={handleCopy}
                        disabled={!redirectUrl}
                        className={`${ui.btnSecondary} whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {copied ? "Copied" : "Copy"}
                    </button>
                </div>
                <p className="text-[11px] text-pulse-faint mt-1.5">
                    Configure this in your identity provider (Okta, Entra ID, Google, Auth0).
                </p>
            </div>

            {!canWrite && (
                <div className="mb-4">
                    <InlineMessage variant="accent" text="Read-only access — you do not have permission to modify SSO settings." />
                </div>
            )}

            <fieldset disabled={!canWrite} className="space-y-4 border-0 p-0 m-0 min-w-0">
                <Toggle
                    checked={enabled}
                    onChange={setEnabled}
                    label="Enable SSO"
                    description="Shows a 'Sign in with…' button on the login pages."
                />

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>Display name</label>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Okta" className={ui.input} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>Issuer URL</label>
                        <input
                            value={issuer}
                            onChange={(e) => setIssuer(e.target.value)}
                            placeholder="https://your-org.okta.com"
                            className={ui.input}
                        />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>Client ID</label>
                        <input value={clientId} onChange={(e) => setClientId(e.target.value)} className={ui.input} autoComplete="off" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>Client Secret</label>
                        <input
                            type="password"
                            value={clientSecret}
                            onChange={(e) => setClientSecret(e.target.value)}
                            placeholder={s.hasSecret ? "•••• (enter to replace)" : "Client secret"}
                            className={ui.input}
                            autoComplete="new-password"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className={ui.label}>
                            Allowed email domains <span className="text-pulse-faint font-normal">(optional, comma-separated)</span>
                        </label>
                        <input
                            value={allowedDomains}
                            onChange={(e) => setAllowedDomains(e.target.value)}
                            placeholder="acme.com, acme.io"
                            className={ui.input}
                        />
                        <p className="text-[11px] text-pulse-faint mt-1">Leave blank to allow any email domain.</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>Group claim</label>
                        <input value={groupClaim} onChange={(e) => setGroupClaim(e.target.value)} placeholder="groups" className={ui.input} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>Plane</label>
                        <select value={plane} onChange={(e) => setPlane(e.target.value as "platform" | "tenant")} className={ui.input}>
                            <option value="platform">Platform (admin)</option>
                            <option value="tenant">Tenant</option>
                        </select>
                    </div>
                    {plane === "tenant" && (
                        <div className="col-span-2 sm:col-span-1">
                            <label className={ui.label}>Tenant ID</label>
                            <input
                                value={tenantId}
                                onChange={(e) => setTenantId(e.target.value)}
                                placeholder="Tenant UUID"
                                className={`${ui.input} font-mono`}
                            />
                        </div>
                    )}
                    <div className="col-span-2 sm:col-span-1">
                        <label className={ui.label}>Default role</label>
                        <select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)} className={ui.input}>
                            {roleOptions.map((r) => (
                                <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                            ))}
                        </select>
                        <p className="text-[11px] text-pulse-faint mt-1">Assigned when a user&apos;s groups match nothing below.</p>
                    </div>
                    <div className="col-span-2">
                        <label className={ui.label}>Group → role map</label>
                        <textarea
                            value={groupRoleMap}
                            onChange={(e) => setGroupRoleMap(e.target.value)}
                            rows={4}
                            placeholder={"One per line, e.g.:\nengineering=owner\nsupport-team=support"}
                            className={`${ui.input} font-mono`}
                        />
                        <p className="text-[11px] text-pulse-faint mt-1">
                            Valid roles: {roleOptions.map((r) => ROLE_LABELS[r] || r).join(", ")}.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                    <button type="button" onClick={handleSave} disabled={saving} className={ui.btnPrimary}>
                        {saving ? "Saving…" : "Save settings"}
                    </button>
                </div>

                {message && <InlineMessage variant={message.type === "success" ? "success" : "danger"} text={message.text} />}
            </fieldset>
        </Panel>
    );
}

/* ─── System Services Tab ─────────────────────────────────────── */
function SystemTab({ settings, canWrite }: { settings: any; canWrite: boolean }) {
    return (
        <form action={saveGlobalSettingsAction}>
            <input type="hidden" name="section" value="pulse_system" />
            <Panel label="Pulse System Services">
                <p className="text-[13px] text-pulse-muted mb-4">
                    Enable advanced features like hot-reload, trusted proxies, local discovery, and CLI backends.
                </p>
                {!canWrite && (
                    <div className="mb-4">
                        <InlineMessage variant="accent" text="Read-only access — you do not have permission to modify system services." />
                    </div>
                )}
                <fieldset disabled={!canWrite} className="space-y-6 border-0 p-0 m-0 min-w-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Toggle
                            name="enableHotReload"
                            defaultChecked={settings.gatewayConfig?.enable_hot_reload ?? true}
                            label="Enable Hot-Reload"
                            description="Apply config changes without restarting"
                        />
                        <Toggle
                            name="lanDiscovery"
                            defaultChecked={settings.gatewayConfig?.lan_discovery ?? false}
                            label="LAN Discovery / Bonjour"
                            description="Allow mDNS local gateway discovery"
                        />
                        <div>
                            <label className={ui.label}>Trusted Proxy Network</label>
                            <input
                                type="text"
                                name="trustedProxy"
                                placeholder="10.0.0.0/8, 192.168.0.0/16"
                                defaultValue={settings.gatewayConfig?.trusted_proxy || ""}
                                className={`${ui.input} font-mono`}
                            />
                            <p className="text-[11px] text-pulse-faint mt-1">Comma-separated CIDR list for trusted LB proxies.</p>
                        </div>
                        <div>
                            <label className={ui.label}>CLI Backends Integration</label>
                            <select
                                name="cliBackends"
                                defaultValue={settings.gatewayConfig?.cli_backends || "disabled"}
                                className={ui.input}
                            >
                                <option value="disabled">Disabled</option>
                                <option value="enabled">Enabled (Local Only)</option>
                                <option value="all">Enabled (All Interfaces)</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <SaveButton label="Save System Services" className={ui.btnPrimary} />
                    </div>
                </fieldset>
            </Panel>
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
        <div className="space-y-5">
            {/* Global Settings */}
            <form action={saveExecSafetySettings}>
                <Panel label="Global Policy">
                    <p className="text-[13px] text-pulse-muted mb-4">These settings apply to all tenants as defaults.</p>
                    <div className="space-y-6">
                        <Toggle
                            name="enabled"
                            defaultChecked={execSafety.enabled}
                            label="Enable Exec Safety"
                            description="When disabled, all commands are allowed without checks."
                        />
                        <div>
                            <label className={ui.label}>Default Policy</label>
                            <select name="defaultPolicy" defaultValue={execSafety.defaultPolicy} className={ui.input}>
                                <option value="allow_all">Allow All (log everything)</option>
                                <option value="allowlist_only">Allowlist Only (safe commands only)</option>
                                <option value="deny_all">Deny All (block everything)</option>
                            </select>
                        </div>
                        <div>
                            <label className={ui.label}>Global Deny Patterns</label>
                            <textarea
                                name="denyPatterns"
                                rows={3}
                                defaultValue={execSafety.globalDenyPatterns}
                                placeholder={"One pattern per line, e.g.:\nrm -rf *\n/DROP\\s+TABLE/i"}
                                className={`${ui.input} font-mono`}
                            />
                        </div>
                        <div>
                            <label className={ui.label}>Global Allow Patterns</label>
                            <textarea
                                name="allowPatterns"
                                rows={3}
                                defaultValue={execSafety.globalAllowPatterns}
                                placeholder={"One pattern per line, e.g.:\npython3 *\nls *"}
                                className={`${ui.input} font-mono`}
                            />
                        </div>
                        <div className="flex justify-end">
                            <SaveButton label="Save Policy" className={ui.btnPrimary} />
                        </div>
                    </div>
                </Panel>
            </form>

            {/* Policy Rules */}
            <Panel label="Global Policy Rules" meta="Evaluated by priority, highest first">
                <form action={addPolicyRule} className="grid grid-cols-1 md:grid-cols-5 gap-3 pb-4 mb-4 border-b border-pulse-border">
                    <select name="ruleType" className={ui.input}>
                        <option value="deny">Deny</option>
                        <option value="allow">Allow</option>
                    </select>
                    <input
                        type="text"
                        name="pattern"
                        placeholder="Pattern (glob or /regex/)"
                        required
                        className={`${ui.input} font-mono md:col-span-2`}
                    />
                    <input type="text" name="description" placeholder="Description" className={ui.input} />
                    <div className="flex gap-2">
                        <input type="number" name="priority" placeholder="Priority" defaultValue="0" className={`${ui.input} w-20`} />
                        <SaveButton label="Add" className={ui.btnPrimary} />
                    </div>
                </form>
                <div className="overflow-x-auto -mx-4 -mb-4">
                    <table className={ui.table}>
                        <thead>
                            <tr>
                                <th className={ui.th}>Type</th>
                                <th className={ui.th}>Pattern</th>
                                <th className={ui.th}>Description</th>
                                <th className={ui.th}>Priority</th>
                                <th className={ui.thRight}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {policyRules.length === 0 && (
                                <tr>
                                    <td colSpan={5} className={`${ui.tdMuted} text-center py-8`}>
                                        No custom policy rules configured. Built-in patterns are always active.
                                    </td>
                                </tr>
                            )}
                            {policyRules.map((rule: any) => (
                                <tr key={rule.id} className={ui.row}>
                                    <td className={ui.td}>
                                        <Badge variant={rule.ruleType === "deny" ? "danger" : "success"}>{rule.ruleType}</Badge>
                                    </td>
                                    <td className={`${ui.td} font-mono`}>{rule.pattern}</td>
                                    <td className={ui.tdMuted}>{rule.description || "—"}</td>
                                    <td className={ui.tdMuted}>{rule.priority}</td>
                                    <td className={ui.tdRight}>
                                        <button
                                            onClick={() => setDeleteRuleId(rule.id)}
                                            className="text-[13px] font-medium text-pulse-loss hover:text-pulse-loss/80 transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>

            {/* Audit Log */}
            <Panel label="Audit Log" meta={`${auditLogs.total} total entries`}>
                <div className="overflow-x-auto -m-4">
                    <table className={ui.table}>
                        <thead>
                            <tr>
                                <th className={ui.th}>Time</th>
                                <th className={ui.th}>Decision</th>
                                <th className={ui.th}>Command</th>
                                <th className={ui.th}>Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {auditLogs.logs.length === 0 && (
                                <tr>
                                    <td colSpan={4} className={`${ui.tdMuted} text-center py-8`}>
                                        No audit log entries yet. Exec events will appear here once agents run commands.
                                    </td>
                                </tr>
                            )}
                            {auditLogs.logs.map((log: any) => (
                                <tr key={log.id} className={ui.row}>
                                    <td className={`${ui.tdMuted} whitespace-nowrap`}>
                                        {log.executedAt ? new Date(log.executedAt).toLocaleString() : "—"}
                                    </td>
                                    <td className={ui.td}>
                                        <Badge variant={
                                            log.decision === "denied" ? "danger"
                                                : log.decision === "sandboxed" ? "accent"
                                                    : "success"
                                        }>
                                            {log.decision}
                                        </Badge>
                                    </td>
                                    <td className={`${ui.tdMuted} font-mono max-w-xs truncate`}>
                                        {log.command.length > 100 ? log.command.substring(0, 100) + "..." : log.command}
                                    </td>
                                    <td className={`${ui.tdMuted} max-w-xs truncate`}>{log.reason || "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <ConfirmDialog
                theme="pulse"
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
function MemoryTab({ config, canWrite }: { config: any; canWrite: boolean }) {
    return (
        <form action={saveMemorySettingsAction}>
            <Panel label="Memory System">
                <p className="text-[13px] text-pulse-muted mb-4">Configure agent long-term memory and vector search.</p>
                {!canWrite && (
                    <div className="mb-4">
                        <InlineMessage variant="accent" text="Read-only access — you do not have permission to modify memory settings." />
                    </div>
                )}
                <fieldset disabled={!canWrite} className="space-y-6 border-0 p-0 m-0 min-w-0">
                    <Toggle
                        name="enabled"
                        defaultChecked={config.enabled !== false}
                        label="Enable Memory System"
                        description="When disabled, agents cannot store or recall memories."
                    />
                    <div>
                        <label className={ui.label}>Embedding Model</label>
                        <select name="embeddingModel" defaultValue={config.embedding_model || "text-embedding-3-small"} className={ui.input}>
                            <option value="text-embedding-3-small">text-embedding-3-small (1536d, fast)</option>
                            <option value="text-embedding-3-large">text-embedding-3-large (3072d, more accurate)</option>
                        </select>
                        <p className="text-[11px] text-pulse-faint mt-1">Requires OPENAI_API_KEY. Falls back to keyword-only search without it.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className={ui.label}>Max Memories per Agent</label>
                            <input type="number" name="maxMemories" defaultValue={config.max_memories_per_agent || 10000} className={ui.input} />
                        </div>
                        <div>
                            <label className={ui.label}>Decay Half-Life (days)</label>
                            <input type="number" name="decayHalfLife" defaultValue={config.decay_half_life_days || 30} className={ui.input} />
                            <p className="text-[11px] text-pulse-faint mt-1">After this many days, a memory&apos;s relevance score halves.</p>
                        </div>
                        <div>
                            <label className={ui.label}>MMR Lambda (0.0-1.0)</label>
                            <input type="number" name="mmrLambda" step="0.1" min="0" max="1" defaultValue={config.mmr_lambda || 0.7} className={ui.input} />
                            <p className="text-[11px] text-pulse-faint mt-1">1.0 = pure relevance, 0.0 = max diversity.</p>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <SaveButton label="Save Memory Settings" className={ui.btnPrimary} />
                    </div>
                </fieldset>
            </Panel>
        </form>
    );
}

/* ─── Sandbox Tab ─────────────────────────────────────────────── */
function SandboxTab({ config, canWrite }: { config: any; canWrite: boolean }) {
    return (
        <form action={saveSandboxSettingsAction}>
            <Panel label="Python Sandbox">
                <p className="text-[13px] text-pulse-muted mb-4">
                    Docker image, resource limits, timeouts, and network access for agent code execution.
                </p>
                {!canWrite && (
                    <div className="mb-4">
                        <InlineMessage variant="accent" text="Read-only access — you do not have permission to modify sandbox settings." />
                    </div>
                )}
                <fieldset disabled={!canWrite} className="space-y-6 border-0 p-0 m-0 min-w-0">
                    <div>
                        <label className={ui.label}>Python Docker Image</label>
                        <input
                            type="text"
                            name="pythonImage"
                            defaultValue={config.image || "pulse-python-sandbox:latest"}
                            className={`${ui.input} font-mono`}
                        />
                        <p className="text-[11px] text-pulse-faint mt-1">Build with: docker build -t pulse-python-sandbox pulse/docker/python-sandbox/</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className={ui.label}>Memory Limit</label>
                            <select name="memoryLimit" defaultValue={config.memory_limit || "256m"} className={ui.input}>
                                <option value="128m">128 MB</option>
                                <option value="256m">256 MB</option>
                                <option value="512m">512 MB</option>
                                <option value="1g">1 GB</option>
                            </select>
                        </div>
                        <div>
                            <label className={ui.label}>CPU Limit</label>
                            <select name="cpuLimit" defaultValue={config.cpu_limit || "1.0"} className={ui.input}>
                                <option value="0.5">0.5 CPU</option>
                                <option value="1.0">1.0 CPU</option>
                                <option value="2.0">2.0 CPU</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className={ui.label}>Default Timeout (seconds)</label>
                            <input type="number" name="defaultTimeout" defaultValue={config.default_timeout || 60} className={ui.input} />
                        </div>
                        <div>
                            <label className={ui.label}>Max Timeout (seconds)</label>
                            <input type="number" name="maxTimeout" defaultValue={config.max_timeout || 300} className={ui.input} />
                        </div>
                    </div>
                    <Toggle
                        name="networkEnabled"
                        defaultChecked={config.network_enabled !== false}
                        label="Network Access"
                        description="Allow sandbox containers to make outbound API calls"
                    />
                    <div className="flex justify-end">
                        <SaveButton label="Save Sandbox Settings" className={ui.btnPrimary} />
                    </div>
                </fieldset>
            </Panel>
        </form>
    );
}

/* ─── Scheduling Tab ──────────────────────────────────────────── */
function SchedulingTab({ config, allJobs, canWrite }: { config: any; allJobs: any[]; canWrite: boolean }) {
    const enabledCount = allJobs.filter((j: any) => j.enabled).length;

    return (
        <div className="space-y-5">
            <form action={saveSchedulingSettingsAction}>
                <Panel label="Scheduling Settings">
                    <p className="text-[13px] text-pulse-muted mb-4">
                        Configure global scheduling settings for cron jobs and scheduled tasks.
                    </p>
                    {!canWrite && (
                        <div className="mb-4">
                            <InlineMessage variant="accent" text="Read-only access — you do not have permission to modify scheduling settings." />
                        </div>
                    )}
                    <fieldset disabled={!canWrite} className="space-y-6 border-0 p-0 m-0 min-w-0">
                        <Toggle
                            name="enabled"
                            defaultChecked={config.enabled !== false}
                            label="Enable Scheduling System"
                            description="When disabled, no scheduled jobs will execute."
                        />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className={ui.label}>Max Jobs per Tenant</label>
                                <input type="number" name="maxJobsPerTenant" defaultValue={config.max_jobs_per_tenant || 50} min={1} className={ui.input} />
                            </div>
                            <div>
                                <label className={ui.label}>Max Jobs per Agent</label>
                                <input type="number" name="maxJobsPerAgent" defaultValue={config.max_jobs_per_agent || 10} min={1} className={ui.input} />
                            </div>
                            <div>
                                <label className={ui.label}>Min Interval (seconds)</label>
                                <input type="number" name="minInterval" defaultValue={config.min_interval_seconds || 300} min={60} className={ui.input} />
                                <p className="text-[11px] text-pulse-faint mt-1">Minimum seconds between runs. Default: 300 (5 min).</p>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <SaveButton label="Save Scheduling Settings" className={ui.btnPrimary} />
                        </div>
                    </fieldset>
                </Panel>
            </form>

            {/* Active Jobs Overview */}
            <Panel label="All Scheduled Jobs" meta={`${allJobs.length} total · ${enabledCount} enabled`}>
                <div className="overflow-x-auto -m-4">
                    <table className={ui.table}>
                        <thead>
                            <tr>
                                <th className={ui.th}>Name</th>
                                <th className={ui.th}>Agent</th>
                                <th className={ui.th}>Schedule</th>
                                <th className={ui.th}>Timezone</th>
                                <th className={ui.th}>Status</th>
                                <th className={ui.th}>Last Run</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allJobs.length === 0 && (
                                <tr>
                                    <td colSpan={6} className={`${ui.tdMuted} text-center py-10`}>
                                        No scheduled jobs across any tenant.
                                    </td>
                                </tr>
                            )}
                            {allJobs.map((job: any) => {
                                const schedule = job.cronExpression
                                    || (job.intervalSeconds ? `every ${job.intervalSeconds}s` : `once at ${job.runAt ? new Date(job.runAt).toLocaleString() : "—"}`);
                                return (
                                    <tr key={job.id} className={ui.row}>
                                        <td className={`${ui.td} font-medium`}>{job.name}</td>
                                        <td className={ui.tdMuted}>{job.agentName || "—"}</td>
                                        <td className={ui.td}>
                                            <code className="text-[11px] bg-pulse-hover text-pulse-text-soft px-2 py-1 rounded">{schedule}</code>
                                        </td>
                                        <td className={ui.tdMuted}>{job.timezone || "UTC"}</td>
                                        <td className={ui.td}>
                                            <Badge variant={job.enabled ? "success" : "neutral"}>{job.enabled ? "Enabled" : "Disabled"}</Badge>
                                        </td>
                                        <td className={ui.tdMuted}>
                                            {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "Never"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Panel>
        </div>
    );
}

/* ─── Model Pricing Tab ──────────────────────────────────────── */
function ModelPricingTab({ models, canBilling }: { models: ModelPricingEntry[]; canBilling: boolean }) {
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
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-[13px] font-semibold text-pulse-text">Model Pricing</h2>
                    <p className="text-[13px] text-pulse-muted mt-1">
                        Set base cost (what you pay) and customer price (what you charge). The difference is your profit.
                    </p>
                </div>
                {canBilling && (
                    <div className="flex flex-wrap gap-2">
                        {["anthropic", "openai", "google", "openrouter", "minimax"].map((p) => (
                            <button key={p} onClick={() => handleSync(p)} className={ui.btnSecondary}>
                                Sync {p.charAt(0).toUpperCase() + p.slice(1)}
                            </button>
                        ))}
                        <button onClick={() => setShowAddForm(!showAddForm)} className={ui.btnPrimary}>
                            + Add Model
                        </button>
                    </div>
                )}
            </div>

            {!canBilling && (
                <InlineMessage variant="accent" text="Read-only access — you do not have permission to modify model pricing." />
            )}

            {syncStatus && <InlineMessage variant="accent" text={syncStatus} />}

            {showAddForm && canBilling && (
                <Panel label="Add New Model">
                    <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={ui.label}>Provider</label>
                            <select name="provider" className={ui.input} required>
                                <option value="anthropic">Anthropic</option>
                                <option value="openai">OpenAI</option>
                                <option value="google">Google</option>
                                <option value="openrouter">OpenRouter</option>
                            </select>
                        </div>
                        <div>
                            <label className={ui.label}>Model ID</label>
                            <input name="modelId" type="text" placeholder="claude-sonnet-4-6" className={`${ui.input} font-mono`} required />
                        </div>
                        <div>
                            <label className={ui.label}>Display Name</label>
                            <input name="displayName" type="text" placeholder="Claude Sonnet 4.6" className={ui.input} required />
                        </div>
                        <div>
                            <label className={ui.label}>Category</label>
                            <select name="category" className={ui.input}>
                                <option value="flagship">Flagship</option>
                                <option value="fast">Fast</option>
                                <option value="reasoning">Reasoning</option>
                                <option value="passthrough">Passthrough</option>
                            </select>
                        </div>
                        <div>
                            <label className={ui.label}>Base Input $/1M tokens</label>
                            <input name="baseInputPerMillion" type="number" step="0.001" defaultValue="3.0" className={ui.input} required />
                        </div>
                        <div>
                            <label className={ui.label}>Base Output $/1M tokens</label>
                            <input name="baseOutputPerMillion" type="number" step="0.001" defaultValue="15.0" className={ui.input} required />
                        </div>
                        <div>
                            <label className={ui.label}>Customer Input $/1M tokens</label>
                            <input name="customerInputPerMillion" type="number" step="0.001" defaultValue="3.0" className={ui.input} required />
                        </div>
                        <div>
                            <label className={ui.label}>Customer Output $/1M tokens</label>
                            <input name="customerOutputPerMillion" type="number" step="0.001" defaultValue="15.0" className={ui.input} required />
                        </div>
                        <div>
                            <label className={ui.label}>Max Tokens</label>
                            <input name="maxTokens" type="number" defaultValue="8192" className={ui.input} />
                        </div>
                        <div className="flex items-end gap-2">
                            <button type="submit" className={ui.btnPrimary}>Save</button>
                            <button type="button" onClick={() => setShowAddForm(false)} className={ui.btnSecondary}>Cancel</button>
                        </div>
                    </form>
                </Panel>
            )}

            {providers.map((provider) => (
                <Panel key={provider} label={provider} meta={`${grouped[provider].length} models`}>
                    <div className="overflow-x-auto -m-4">
                        <table className={ui.table}>
                            <thead>
                                <tr>
                                    <th className={ui.th}>Model</th>
                                    <th className={ui.th}>Category</th>
                                    <th className={ui.thRight}>Base $/1M tokens (In/Out)</th>
                                    <th className={ui.thRight}>Customer $/1M tokens (In/Out)</th>
                                    <th className={ui.thRight}>Markup</th>
                                    <th className={ui.thRight}>Active</th>
                                    <th className={ui.thRight}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grouped[provider].map((model) => (
                                    editingId === model.id ? (
                                        <tr key={model.id} className={ui.row}>
                                            <td colSpan={7} className="p-4">
                                                <form onSubmit={handleSave} className="grid grid-cols-4 gap-3">
                                                    <input type="hidden" name="provider" value={model.provider} />
                                                    <input type="hidden" name="modelId" value={model.modelId} />
                                                    <div>
                                                        <label className={ui.label}>Display Name</label>
                                                        <input name="displayName" defaultValue={model.displayName} className={ui.input} />
                                                    </div>
                                                    <div>
                                                        <label className={ui.label}>Category</label>
                                                        <select name="category" defaultValue={model.category} className={ui.input}>
                                                            <option value="flagship">Flagship</option>
                                                            <option value="fast">Fast</option>
                                                            <option value="reasoning">Reasoning</option>
                                                            <option value="passthrough">Passthrough</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className={ui.label}>Base Input $/1M</label>
                                                        <input name="baseInputPerMillion" type="number" step="0.001" defaultValue={model.baseInputPerMillion} className={ui.input} />
                                                    </div>
                                                    <div>
                                                        <label className={ui.label}>Base Output $/1M</label>
                                                        <input name="baseOutputPerMillion" type="number" step="0.001" defaultValue={model.baseOutputPerMillion} className={ui.input} />
                                                    </div>
                                                    <div>
                                                        <label className={ui.label}>Customer Input $/1M</label>
                                                        <input name="customerInputPerMillion" type="number" step="0.001" defaultValue={model.customerInputPerMillion} className={ui.input} />
                                                    </div>
                                                    <div>
                                                        <label className={ui.label}>Customer Output $/1M</label>
                                                        <input name="customerOutputPerMillion" type="number" step="0.001" defaultValue={model.customerOutputPerMillion} className={ui.input} />
                                                    </div>
                                                    <div>
                                                        <label className={ui.label}>Max Tokens</label>
                                                        <input name="maxTokens" type="number" defaultValue={model.maxTokens} className={ui.input} />
                                                    </div>
                                                    <div className="flex items-end gap-2">
                                                        <button type="submit" className={ui.btnPrimary}>Save</button>
                                                        <button type="button" onClick={() => setEditingId(null)} className={ui.btnSecondary}>Cancel</button>
                                                    </div>
                                                </form>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={model.id} className={ui.row}>
                                            <td className={ui.td}>
                                                <div className="font-medium text-pulse-text">{model.displayName}</div>
                                                <div className="text-[11px] text-pulse-faint font-mono">{model.modelId}</div>
                                            </td>
                                            <td className={ui.td}>
                                                <Badge variant={
                                                    model.category === "flagship" || model.category === "reasoning" ? "accent"
                                                        : model.category === "fast" ? "success"
                                                            : "neutral"
                                                }>
                                                    {model.category}
                                                </Badge>
                                            </td>
                                            <td className={`${ui.tdRight} font-mono`}>
                                                {formatPrice(model.baseInputPerMillion)} / {formatPrice(model.baseOutputPerMillion)}
                                            </td>
                                            <td className={`${ui.tdRight} font-mono font-medium`}>
                                                {formatPrice(model.customerInputPerMillion)} / {formatPrice(model.customerOutputPerMillion)}
                                            </td>
                                            <td className={ui.tdRight}>
                                                <span className={model.customerInputPerMillion > model.baseInputPerMillion ? "text-pulse-profit" : "text-pulse-faint"}>
                                                    {calcMarkup(model.baseInputPerMillion, model.customerInputPerMillion)}
                                                </span>
                                            </td>
                                            <td className={ui.tdRight}>
                                                <span className="inline-flex justify-end">
                                                    <StatusDot variant={model.isActive ? "success" : "neutral"} />
                                                </span>
                                            </td>
                                            <td className={ui.tdRight}>
                                                {canBilling ? (
                                                    <div className="inline-flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingId(model.id)}
                                                            aria-label="Edit model pricing"
                                                            title="Edit"
                                                            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-pulse-muted hover:text-pulse-accent hover:bg-pulse-hover transition-colors"
                                                        >
                                                            <PencilSquareIcon aria-hidden="true" className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(model.id)}
                                                            aria-label="Delete model"
                                                            title="Delete"
                                                            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-pulse-muted hover:text-pulse-loss hover:bg-pulse-loss/10 transition-colors"
                                                        >
                                                            <TrashIcon aria-hidden="true" className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-pulse-faint">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            ))}

            {models.length === 0 && (
                <Panel>
                    <div className="text-center py-10">
                        <p className="text-[13px] font-medium text-pulse-text">No models configured</p>
                        <p className="text-[13px] text-pulse-muted mt-1">
                            Click &quot;Sync&quot; to auto-discover models from your connected providers, or add them manually.
                        </p>
                    </div>
                </Panel>
            )}

            {/* Profit Summary */}
            {models.length > 0 && (
                <Panel label="Pricing Summary">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-pulse-panel-alt border border-pulse-border-subtle rounded-lg p-4">
                            <p className={ui.labelMicro}>Total Models</p>
                            <p className="text-2xl font-semibold tabular-nums mt-1.5 text-pulse-text">{models.length}</p>
                        </div>
                        <div className="bg-pulse-panel-alt border border-pulse-border-subtle rounded-lg p-4">
                            <p className="text-[11px] uppercase tracking-[0.12em] text-pulse-profit">Models with Markup</p>
                            <p className="text-2xl font-semibold tabular-nums mt-1.5 text-pulse-profit">
                                {models.filter((m) => m.customerInputPerMillion > m.baseInputPerMillion || m.customerOutputPerMillion > m.baseOutputPerMillion).length}
                            </p>
                        </div>
                        <div className="bg-pulse-panel-alt border border-pulse-border-subtle rounded-lg p-4">
                            <p className="text-[11px] uppercase tracking-[0.12em] text-pulse-accent">Active Models</p>
                            <p className="text-2xl font-semibold tabular-nums mt-1.5 text-pulse-accent">
                                {models.filter((m) => m.isActive).length}
                            </p>
                        </div>
                    </div>
                </Panel>
            )}
        </div>
    );
}

/* ─── Database & Security Tab ─────────────────────────────────── */
function DatabaseTab() {
    return (
        <div className="space-y-5">
            <Panel label="My Account Security">
                <div className="space-y-4">
                    <ChangePasswordCard variant="pulse" />
                    <TwoFactorCard variant="pulse" />
                </div>
            </Panel>
            <Panel label="PostgreSQL Connection">
                <label className={ui.label}>DATABASE_URL</label>
                <input
                    type="text"
                    readOnly
                    value="postgres://pulseadmin:******@localhost:5432/pulse"
                    className={`${ui.input} font-mono text-pulse-muted`}
                />
                <div className="mt-4 flex gap-2">
                    <button className={ui.btnSecondary}>Test Connection</button>
                    <button className={ui.btnSecondary}>Run Migrations</button>
                </div>
            </Panel>
            <Panel label="Security & Encryption">
                <div className="flex items-center justify-between px-4 py-3 bg-pulse-panel-alt rounded-md border border-pulse-border">
                    <div>
                        <p className="text-[13px] font-medium text-pulse-text">ENCRYPTION_KEY Status</p>
                        <p className="text-[13px] text-pulse-muted">Used for signing OAuth tokens and NextAuth sessions.</p>
                    </div>
                    <Badge variant="success">Valid (64-byte Hex)</Badge>
                </div>
            </Panel>
        </div>
    );
}

/* ─── Skills Defaults Tab ────────────────────────────────────────── */
function SkillsDefaultsTab({ defaultSkills, canWrite }: { defaultSkills: string[]; canWrite: boolean }) {
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
        <fieldset disabled={!canWrite} className="space-y-5 border-0 p-0 m-0 min-w-0">
            <Panel label="Default Skills">
                <p className="text-[13px] text-pulse-muted">
                    Select which built-in skills are enabled by default for all agents.
                    Individual agents can override these settings.
                </p>
                {!canWrite && (
                    <p className="text-[13px] text-pulse-accent mt-2">
                        Read-only access — you do not have permission to modify default skills.
                    </p>
                )}
                {noDefaultsSet && (
                    <p className="text-[13px] text-pulse-accent mt-2">
                        No defaults configured yet — all skills are enabled for all agents. Save to set explicit defaults.
                    </p>
                )}

                <div className="flex items-center gap-2 mt-4 mb-5">
                    <button onClick={selectAll} className={ui.btnGhost}>Select All</button>
                    <span className="text-pulse-faint">|</span>
                    <button onClick={clearAll} className={`${ui.btnGhost} !text-pulse-muted hover:!text-pulse-text-soft`}>Clear All</button>
                </div>

                <div className="space-y-5">
                    {categories.map((cat) => {
                        const skills = BUILTIN_SKILLS.filter((s) => s.category === cat.id);
                        if (skills.length === 0) return null;
                        return (
                            <div key={cat.id}>
                                <h3 className={`${ui.labelMicro} mb-2.5`}>{cat.label}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                    {skills.map((skill) => {
                                        const isEnabled = enabled.includes(skill.name);
                                        return (
                                            <div
                                                key={skill.name}
                                                className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-md border ${
                                                    isEnabled
                                                        ? "border-pulse-accent/40 bg-pulse-accent/10"
                                                        : "border-pulse-border bg-pulse-panel-alt"
                                                }`}
                                            >
                                                <div className="min-w-0">
                                                    <span className="block text-[13px] font-medium text-pulse-text truncate">{skill.name}</span>
                                                    <p className="text-[11px] text-pulse-muted mt-0.5 truncate" title={skill.description}>{skill.description}</p>
                                                </div>
                                                <button
                                                    onClick={() => toggle(skill.name)}
                                                    role="switch"
                                                    aria-checked={isEnabled}
                                                    aria-label={`${isEnabled ? "Disable" : "Enable"} ${skill.name}`}
                                                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none ${
                                                        isEnabled ? "bg-pulse-profit" : "bg-pulse-border"
                                                    }`}
                                                >
                                                    <span
                                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform motion-reduce:transition-none ${
                                                            isEnabled ? "translate-x-4" : "translate-x-0.5"
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
            </Panel>

            <div className="flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={status.type === "saving" || !canWrite}
                    className={ui.btnPrimary}
                >
                    {status.type === "saving" ? "Saving…" : "Save Defaults"}
                </button>
                {status.type === "success" && (
                    <span className="text-[13px] text-pulse-profit">{status.message}</span>
                )}
                {status.type === "error" && (
                    <span className="text-[13px] text-pulse-loss">{status.message}</span>
                )}
            </div>
        </fieldset>
    );
}
