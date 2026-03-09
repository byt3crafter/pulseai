"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAgentEmailConfigAction } from "./actions";

interface EmailConfig {
    useCustom?: boolean;
    smtp?: {
        host: string;
        port: number;
        username: string;
        encryptedPassword?: string;
        tls: boolean;
        fromAddress: string;
    };
    imap?: {
        host: string;
        port: number;
        username: string;
        encryptedPassword?: string;
        tls: boolean;
    };
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

    // IMAP state
    const [imapHost, setImapHost] = useState(emailConfig.imap?.host ?? "");
    const [imapPort, setImapPort] = useState(emailConfig.imap?.port?.toString() ?? "993");
    const [imapUsername, setImapUsername] = useState(emailConfig.imap?.username ?? "");
    const [imapPassword, setImapPassword] = useState("");
    const [imapTls, setImapTls] = useState(emailConfig.imap?.tls ?? true);

    const hasExistingSmtpPassword = !!emailConfig.smtp?.encryptedPassword;
    const hasExistingImapPassword = !!emailConfig.imap?.encryptedPassword;

    function handleSave() {
        const config: any = { useCustom };

        if (useCustom) {
            config.smtp = {
                host: smtpHost,
                port: parseInt(smtpPort) || 587,
                username: smtpUsername,
                tls: smtpTls,
                fromAddress: smtpFrom,
            };
            if (smtpPassword) {
                config.smtp.password = smtpPassword; // Will be encrypted server-side
            }

            if (imapHost) {
                config.imap = {
                    host: imapHost,
                    port: parseInt(imapPort) || 993,
                    username: imapUsername,
                    tls: imapTls,
                };
                if (imapPassword) {
                    config.imap.password = imapPassword;
                }
            }
        }

        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("emailConfig", JSON.stringify(config));

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

    return (
        <div className="space-y-6">
            {/* Mode toggle */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-900">Email Configuration</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        Configure email access for this agent. Use company-wide settings or set custom credentials.
                    </p>
                </div>
                <div className="p-6">
                    <div className="flex gap-4">
                        <button
                            onClick={() => setUseCustom(false)}
                            className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                                !useCustom
                                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                        >
                            Use Company Email
                            {!hasTenantEmail && (
                                <span className="block text-xs font-normal text-amber-600 mt-1">
                                    Not configured yet
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setUseCustom(true)}
                            className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                                useCustom
                                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h3 className="text-sm font-semibold text-slate-900">SMTP (Outgoing)</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Configure outgoing email via SMTP.</p>
                        </div>
                        <div className="p-6 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Host</label>
                                <input
                                    type="text"
                                    value={smtpHost}
                                    onChange={(e) => setSmtpHost(e.target.value)}
                                    placeholder="smtp.gmail.com"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Port</label>
                                <input
                                    type="number"
                                    value={smtpPort}
                                    onChange={(e) => setSmtpPort(e.target.value)}
                                    placeholder="587"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
                                <input
                                    type="text"
                                    value={smtpUsername}
                                    onChange={(e) => setSmtpUsername(e.target.value)}
                                    placeholder="user@company.com"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                                <input
                                    type="password"
                                    value={smtpPassword}
                                    onChange={(e) => setSmtpPassword(e.target.value)}
                                    placeholder={hasExistingSmtpPassword ? "••••••••" : "App password or SMTP password"}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">From Address</label>
                                <input
                                    type="email"
                                    value={smtpFrom}
                                    onChange={(e) => setSmtpFrom(e.target.value)}
                                    placeholder="agent@company.com"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800"
                                />
                            </div>
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={smtpTls}
                                        onChange={(e) => setSmtpTls(e.target.checked)}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    Use TLS
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* IMAP Config */}
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h3 className="text-sm font-semibold text-slate-900">IMAP (Incoming)</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Configure incoming email via IMAP. Optional.</p>
                        </div>
                        <div className="p-6 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Host</label>
                                <input
                                    type="text"
                                    value={imapHost}
                                    onChange={(e) => setImapHost(e.target.value)}
                                    placeholder="imap.gmail.com"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Port</label>
                                <input
                                    type="number"
                                    value={imapPort}
                                    onChange={(e) => setImapPort(e.target.value)}
                                    placeholder="993"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
                                <input
                                    type="text"
                                    value={imapUsername}
                                    onChange={(e) => setImapUsername(e.target.value)}
                                    placeholder="user@company.com"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                                <input
                                    type="password"
                                    value={imapPassword}
                                    onChange={(e) => setImapPassword(e.target.value)}
                                    placeholder={hasExistingImapPassword ? "••••••••" : "App password or IMAP password"}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800"
                                />
                            </div>
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={imapTls}
                                        onChange={(e) => setImapTls(e.target.checked)}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    Use TLS
                                </label>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Save button */}
            <div className="flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={pending}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                    {pending ? "Saving..." : "Save Email Config"}
                </button>
                {status.type === "success" && (
                    <span className="text-sm text-emerald-600">{status.message || "Saved!"}</span>
                )}
                {status.type === "error" && (
                    <span className="text-sm text-red-600">{status.message || "Failed to save."}</span>
                )}
            </div>
        </div>
    );
}
