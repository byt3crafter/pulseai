"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAgentEmailConfigAction, testAgentEmailConnectionAction } from "./actions";
import SignatureEditor, { DEFAULT_SIGNATURE, type SignatureValue } from "../../../../components/dashboard/SignatureEditor";

interface EmailConfig {
    useCustom?: boolean;
    smtp?: {
        host: string;
        port: number;
        username: string;
        encryptedPassword?: string;
        tls: boolean;
        fromAddress: string;
        fromName?: string;
        defaultCc?: string;
    };
    imap?: {
        host: string;
        port: number;
        username: string;
        encryptedPassword?: string;
        tls: boolean;
    };
    signature?: SignatureValue;
}

interface Props {
    agentId: string;
    emailConfig: EmailConfig;
    hasTenantEmail: boolean;
}

export default function EmailConfigEditor({ agentId, emailConfig, hasTenantEmail }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [useCustom, setUseCustom] = useState(emailConfig.useCustom ?? false);
    const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });

    // SMTP state
    const [smtpHost, setSmtpHost] = useState(emailConfig.smtp?.host ?? "");
    const [smtpPort, setSmtpPort] = useState(emailConfig.smtp?.port?.toString() ?? "587");
    const [smtpUsername, setSmtpUsername] = useState(emailConfig.smtp?.username ?? "");
    const [smtpPassword, setSmtpPassword] = useState("");
    const [smtpTls, setSmtpTls] = useState(emailConfig.smtp?.tls ?? true);
    const [smtpFrom, setSmtpFrom] = useState(emailConfig.smtp?.fromAddress ?? "");
    const [smtpFromName, setSmtpFromName] = useState(emailConfig.smtp?.fromName ?? "");
    const [smtpDefaultCc, setSmtpDefaultCc] = useState(emailConfig.smtp?.defaultCc ?? "");

    // IMAP state
    const [imapHost, setImapHost] = useState(emailConfig.imap?.host ?? "");
    const [imapPort, setImapPort] = useState(emailConfig.imap?.port?.toString() ?? "993");
    const [imapUsername, setImapUsername] = useState(emailConfig.imap?.username ?? "");
    const [imapPassword, setImapPassword] = useState("");
    const [imapTls, setImapTls] = useState(emailConfig.imap?.tls ?? true);

    const hasExistingSmtpPassword = !!emailConfig.smtp?.encryptedPassword;
    const hasExistingImapPassword = !!emailConfig.imap?.encryptedPassword;

    // Signature — independent of useCustom: an agent can keep its own signature
    // even while sending through the company mailbox.
    const [signature, setSignature] = useState<SignatureValue>(emailConfig.signature ?? DEFAULT_SIGNATURE);

    // Result of the last "Test connection" run — a per-protocol ✅/❌.
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<null | {
        ok: boolean; smtp?: boolean; imap?: boolean; hasSmtp?: boolean; hasImap?: boolean; message?: string;
    }>(null);

    // Build the config payload from the current form — shared by Save and Test
    // so they always agree on what's being configured.
    function buildConfig(): any {
        const config: any = { useCustom, signature };
        if (useCustom) {
            config.smtp = {
                host: smtpHost,
                port: parseInt(smtpPort) || 587,
                username: smtpUsername,
                tls: smtpTls,
                fromAddress: smtpFrom,
                fromName: smtpFromName || undefined,
                defaultCc: smtpDefaultCc || undefined,
            };
            if (smtpPassword) config.smtp.password = smtpPassword; // encrypted server-side
            if (imapHost) {
                config.imap = {
                    host: imapHost,
                    port: parseInt(imapPort) || 993,
                    username: imapUsername,
                    tls: imapTls,
                };
                if (imapPassword) config.imap.password = imapPassword;
            }
        }
        return config;
    }

    function handleSave() {
        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("emailConfig", JSON.stringify(buildConfig()));

        startTransition(async () => {
            const result = await updateAgentEmailConfigAction(fd);
            setStatus({
                type: result.success ? "success" : "error",
                message: result.message ?? "",
            });
            if (result.success) {
                router.refresh();
            }
        });
    }

    function handleTest() {
        setTestResult(null);
        setTesting(true);
        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("emailConfig", JSON.stringify(buildConfig()));
        (async () => {
            try {
                const r = await testAgentEmailConnectionAction(fd);
                setTestResult(r);
            } finally {
                setTesting(false);
            }
        })();
    }

    return (
        <div className="space-y-6">
            {/* Mode toggle */}
            <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-pulse-border-subtle">
                    <h2 className="text-sm font-semibold text-pulse-text">Email Configuration</h2>
                    <p className="text-xs text-pulse-faint mt-0.5">
                        Configure email access for this agent. Use company-wide settings or set custom credentials.
                    </p>
                </div>
                <div className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <button
                            onClick={() => setUseCustom(false)}
                            className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                !useCustom
                                    ? "border-indigo-500/30 bg-pulse-tint text-pulse-accent-hi"
                                    : "border-pulse-border-subtle bg-pulse-panel text-pulse-muted hover:bg-pulse-hover"
                            }`}
                        >
                            Use Company Email
                            {!hasTenantEmail && (
                                <span className="block text-xs font-normal text-amber-400 mt-1">
                                    Not configured yet
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setUseCustom(true)}
                            className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                useCustom
                                    ? "border-indigo-500/30 bg-pulse-tint text-pulse-accent-hi"
                                    : "border-pulse-border-subtle bg-pulse-panel text-pulse-muted hover:bg-pulse-hover"
                            }`}
                        >
                            Use Custom Email
                        </button>
                    </div>
                </div>
            </div>

            {/* Custom email form */}
            {useCustom && (
                <>
                    {/* SMTP Config */}
                    <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-pulse-border-subtle">
                            <h3 className="text-sm font-semibold text-pulse-text">SMTP (Outgoing)</h3>
                            <p className="text-xs text-pulse-faint mt-0.5">Configure outgoing email via SMTP.</p>
                        </div>
                        <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Host</label>
                                <input
                                    type="text"
                                    value={smtpHost}
                                    onChange={(e) => setSmtpHost(e.target.value)}
                                    placeholder="smtp.gmail.com"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Port</label>
                                <input
                                    type="number"
                                    value={smtpPort}
                                    onChange={(e) => setSmtpPort(e.target.value)}
                                    placeholder="587"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Username</label>
                                <input
                                    type="text"
                                    value={smtpUsername}
                                    onChange={(e) => setSmtpUsername(e.target.value)}
                                    placeholder="user@company.com"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Password</label>
                                <input
                                    type="password"
                                    value={smtpPassword}
                                    onChange={(e) => setSmtpPassword(e.target.value)}
                                    placeholder={hasExistingSmtpPassword ? "••••••••" : "App password or SMTP password"}
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">From Address</label>
                                <input
                                    type="email"
                                    value={smtpFrom}
                                    onChange={(e) => setSmtpFrom(e.target.value)}
                                    placeholder="agent@company.com"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Sender Name</label>
                                <input
                                    type="text"
                                    value={smtpFromName}
                                    onChange={(e) => setSmtpFromName(e.target.value)}
                                    placeholder="Natalie Harrington"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                                <p className="text-xs text-pulse-faint mt-1">Display name recipients see. Leave blank to use the agent&apos;s name.</p>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Always CC</label>
                                <input
                                    type="text"
                                    value={smtpDefaultCc}
                                    onChange={(e) => setSmtpDefaultCc(e.target.value)}
                                    placeholder="dovik@runstate.mu, thierry@runstate.mu"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                                <p className="text-xs text-pulse-faint mt-1">Comma-separated addresses copied on every email this agent sends. Leave blank for none. The agent can also CC per-email when you ask.</p>
                            </div>
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 text-sm text-pulse-text-soft">
                                    <input
                                        type="checkbox"
                                        checked={smtpTls}
                                        onChange={(e) => setSmtpTls(e.target.checked)}
                                        className="rounded border-pulse-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                    Use TLS
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* IMAP Config */}
                    <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-pulse-border-subtle">
                            <h3 className="text-sm font-semibold text-pulse-text">IMAP (Incoming)</h3>
                            <p className="text-xs text-pulse-faint mt-0.5">Configure incoming email via IMAP. Optional.</p>
                        </div>
                        <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Host</label>
                                <input
                                    type="text"
                                    value={imapHost}
                                    onChange={(e) => setImapHost(e.target.value)}
                                    placeholder="imap.gmail.com"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Port</label>
                                <input
                                    type="number"
                                    value={imapPort}
                                    onChange={(e) => setImapPort(e.target.value)}
                                    placeholder="993"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Username</label>
                                <input
                                    type="text"
                                    value={imapUsername}
                                    onChange={(e) => setImapUsername(e.target.value)}
                                    placeholder="user@company.com"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Password</label>
                                <input
                                    type="password"
                                    value={imapPassword}
                                    onChange={(e) => setImapPassword(e.target.value)}
                                    placeholder={hasExistingImapPassword ? "••••••••" : "App password or IMAP password"}
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                            </div>
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 text-sm text-pulse-text-soft">
                                    <input
                                        type="checkbox"
                                        checked={imapTls}
                                        onChange={(e) => setImapTls(e.target.checked)}
                                        className="rounded border-pulse-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                    Use TLS
                                </label>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Signature — independent of which mailbox is used above */}
            <SignatureEditor value={signature} onChange={setSignature} />

            {/* Save + Test buttons */}
            <div className="flex flex-wrap items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={pending}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                    {pending ? "Saving..." : "Save Email Config"}
                </button>
                {useCustom && (smtpHost || imapHost) && (
                    <button
                        onClick={handleTest}
                        disabled={testing}
                        className="px-5 py-2.5 text-sm font-medium text-pulse-text-soft border border-pulse-border rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                    >
                        {testing ? "Testing…" : "Test connection"}
                    </button>
                )}
                {status.type === "success" && (
                    <span className="text-sm text-green-400">{status.message || "Saved!"}</span>
                )}
                {status.type === "error" && (
                    <span className="text-sm text-red-400">{status.message || "Failed to save."}</span>
                )}
            </div>

            {/* Test connection result — a per-protocol pass/fail + the exact error. */}
            {testResult && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${testResult.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
                    <div className="flex flex-wrap items-center gap-4">
                        {testResult.hasSmtp && (
                            <span className={testResult.smtp ? "text-emerald-400" : "text-red-400"}>
                                {testResult.smtp ? "✓" : "✕"} SMTP (send)
                            </span>
                        )}
                        {testResult.hasImap && (
                            <span className={testResult.imap ? "text-emerald-400" : "text-red-400"}>
                                {testResult.imap ? "✓" : "✕"} IMAP (read)
                            </span>
                        )}
                        {testResult.ok && <span className="text-emerald-400 font-medium">Mailbox login works.</span>}
                    </div>
                    {testResult.message && (
                        <p className="mt-1.5 text-[13px] text-pulse-muted break-words">{testResult.message}</p>
                    )}
                    {!testResult.ok && !testResult.message && (
                        <p className="mt-1.5 text-[13px] text-pulse-muted">The mailbox rejected the login. Check the username, password, host and port.</p>
                    )}
                </div>
            )}
        </div>
    );
}
