"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeftIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    XCircleIcon,
} from "@heroicons/react/24/outline";
import { saveServerAction, testServerConnectionAction } from "./actions";
import { PageHeader, Card, CardHeader, SettingRow, Toggle, InfoTip, SelectMenu } from "../../../components/dashboard/ui";

type AuthType = "key" | "password";
type Environment = "production" | "staging" | "dev";
type SafetyMode = "observe" | "safe" | "full";
type ApprovalMode = "off" | "writes" | "all";
type Agent = { id: string; name: string };

export type ServerData = {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    authType: AuthType;
    environment: Environment;
    safetyMode: SafetyMode;
    instructions: string;
    allowedAgentIds: string[];
    approvalMode: ApprovalMode;
    enabled: boolean;
};

const SAFETY_OPTIONS: { value: SafetyMode; title: string; description: string }[] = [
    { value: "observe", title: "Observe", description: "Read-only diagnostics. The agent can check status, logs, and resource usage — nothing that changes state." },
    { value: "safe", title: "Safe", description: "Anything except destructive commands. Deletes of the root filesystem, disk wipes, shutdowns, and similar operations are blocked in code." },
    { value: "full", title: "Full", description: "No restrictions. The agent can run any command, including destructive ones — only for servers you fully trust the agent with." },
];

export default function ServerEditor({ agents, server }: { agents: Agent[]; server?: ServerData }) {
    const router = useRouter();
    const isEdit = !!server;

    const [name, setName] = useState(server?.name ?? "");
    const [host, setHost] = useState(server?.host ?? "");
    const [port, setPort] = useState(String(server?.port ?? 22));
    const [username, setUsername] = useState(server?.username ?? "");
    const [authType, setAuthType] = useState<AuthType>(server?.authType ?? "key");
    const [secret, setSecret] = useState("");
    const [environment, setEnvironment] = useState<Environment>(server?.environment ?? "dev");
    const [safetyMode, setSafetyMode] = useState<SafetyMode>(server?.safetyMode ?? "observe");
    const [instructions, setInstructions] = useState(server?.instructions ?? "");
    const [allowed, setAllowed] = useState<string[]>(server?.allowedAgentIds ?? []);
    const [approvalMode, setApprovalMode] = useState<ApprovalMode>(server?.approvalMode ?? "off");
    const [enabled, setEnabled] = useState(server?.enabled ?? false);
    const [riskAcknowledged, setRiskAcknowledged] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [testState, setTestState] = useState<{ status: "idle" | "testing" | "ok" | "error"; message?: string }>({ status: "idle" });

    const isProductionFull = environment === "production" && safetyMode === "full";
    const canSave = !isProductionFull || riskAcknowledged;

    const currentFormValues = useMemo(
        () => ({ host, port, username, authType, secret }),
        [host, port, username, authType, secret]
    );

    async function handleTestConnection() {
        setTestState({ status: "testing" });
        const fd = new FormData();
        if (server) fd.set("serverId", server.id);
        fd.set("host", currentFormValues.host);
        fd.set("port", currentFormValues.port);
        fd.set("username", currentFormValues.username);
        fd.set("authType", currentFormValues.authType);
        fd.set("secret", currentFormValues.secret);
        const res = await testServerConnectionAction(fd);
        setTestState({ status: res.success ? "ok" : "error", message: res.message });
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        if (isProductionFull && !riskAcknowledged) {
            setError("Check 'I understand the risk' to enable full access on a production server.");
            return;
        }

        setLoading(true);
        const fd = new FormData(e.currentTarget);
        if (server) fd.set("serverId", server.id);
        fd.set("allowedAgentIdsJson", JSON.stringify(allowed));
        fd.set("enabled", String(enabled));
        fd.set("riskAcknowledged", String(riskAcknowledged));

        const result = await saveServerAction(fd);
        if (!result.success) {
            setError(result.message || "Could not save the server — please try again.");
            setLoading(false);
        } else {
            router.push("/dashboard/servers");
            router.refresh();
        }
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
            <Link href="/dashboard/servers" className="inline-flex items-center gap-1.5 text-sm text-pulse-muted hover:text-pulse-text transition-colors motion-reduce:transition-none mb-4 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" /> Servers
            </Link>

            <PageHeader
                title={isEdit ? "Edit server" : "Add server"}
                description="Give agents controlled SSH access to your infrastructure — with guardrails."
            />

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                    <div role="alert" className="p-3 text-sm text-red-500 bg-red-500/10 rounded-lg border border-red-500/30 flex items-start gap-2">
                        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Connection */}
                <Card>
                    <CardHeader title="Connection" description="Where the server lives and how to authenticate." />
                    <div className="p-5 space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="srv-name" className="block text-sm font-medium text-pulse-text-soft mb-1.5">Name <span className="text-red-500">*</span></label>
                                <input id="srv-name" name="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="prod-api-01"
                                    className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow motion-reduce:transition-none" />
                            </div>
                            <div>
                                <label htmlFor="srv-username" className="block text-sm font-medium text-pulse-text-soft mb-1.5">Username <span className="text-red-500">*</span></label>
                                <input id="srv-username" name="username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="deploy"
                                    className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm font-mono bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow motion-reduce:transition-none" />
                            </div>
                        </div>

                        <div className="grid sm:grid-cols-[3fr_1fr] gap-4">
                            <div>
                                <label htmlFor="srv-host" className="block text-sm font-medium text-pulse-text-soft mb-1.5">Host <span className="text-red-500">*</span></label>
                                <input id="srv-host" name="host" type="text" required value={host} onChange={(e) => setHost(e.target.value)} placeholder="203.0.113.10 or vps.example.com"
                                    className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm font-mono bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow motion-reduce:transition-none" />
                            </div>
                            <div>
                                <label htmlFor="srv-port" className="block text-sm font-medium text-pulse-text-soft mb-1.5">Port</label>
                                <input id="srv-port" name="port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)}
                                    className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow motion-reduce:transition-none" />
                            </div>
                        </div>

                        <div>
                            <span className="block text-sm font-medium text-pulse-text-soft mb-1.5">Authentication</span>
                            <div className="inline-flex rounded-lg border border-pulse-border p-1 bg-pulse-panel-alt" role="radiogroup" aria-label="Authentication type">
                                {(["key", "password"] as AuthType[]).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        role="radio"
                                        aria-checked={authType === t}
                                        onClick={() => setAuthType(t)}
                                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${authType === t ? "bg-indigo-600 text-white" : "text-pulse-muted hover:text-pulse-text"}`}
                                    >
                                        {t === "key" ? "SSH key" : "Password"}
                                    </button>
                                ))}
                            </div>
                            <input type="hidden" name="authType" value={authType} />
                        </div>

                        <div>
                            <label htmlFor="srv-secret" className="block text-sm font-medium text-pulse-text-soft mb-1.5">
                                {authType === "key" ? "Private key" : "Password"} {!isEdit && <span className="text-red-500">*</span>}
                            </label>
                            {authType === "key" ? (
                                <textarea id="srv-secret" name="secret" rows={5} value={secret} onChange={(e) => setSecret(e.target.value)}
                                    required={!isEdit}
                                    placeholder={isEdit ? "unchanged — leave blank to keep the current key" : "-----BEGIN OPENSSH PRIVATE KEY-----\n…"}
                                    className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm font-mono bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow motion-reduce:transition-none resize-y" />
                            ) : (
                                <input id="srv-secret" name="secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
                                    required={!isEdit}
                                    placeholder={isEdit ? "unchanged — leave blank to keep the current password" : "SSH password"}
                                    className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm font-mono bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow motion-reduce:transition-none" />
                            )}
                            <p className="text-xs text-pulse-faint mt-1">Encrypted at rest. Never shown in plaintext after saving.</p>
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                            <button
                                type="button"
                                onClick={handleTestConnection}
                                disabled={testState.status === "testing" || !host || !username}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-pulse-text-soft bg-pulse-panel-alt border border-pulse-border rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {testState.status === "testing" && (
                                    <svg className="animate-spin motion-reduce:animate-none h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                                )}
                                Test connection
                            </button>
                            {testState.status === "ok" && (
                                <span className="inline-flex items-center gap-1.5 text-sm text-green-500"><CheckCircleIcon className="w-4 h-4" aria-hidden="true" />{testState.message}</span>
                            )}
                            {testState.status === "error" && (
                                <span className="inline-flex items-center gap-1.5 text-sm text-red-500"><XCircleIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />{testState.message}</span>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Guardrails */}
                <Card>
                    <CardHeader title="Guardrails" description="What kind of server this is, and what the agent is allowed to do on it." />
                    <div className="p-5 space-y-5">
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-sm font-medium text-pulse-text-soft">Environment</span>
                                <InfoTip text="Production servers get extra confirmation before granting unrestricted (Full) access." />
                            </div>
                            <div className="max-w-xs">
                                <SelectMenu
                                    id="srv-environment"
                                    name="environment"
                                    ariaLabel="Environment"
                                    value={environment}
                                    onChange={(v) => setEnvironment(v as Environment)}
                                    groups={[{ label: "Environment", options: [
                                        { value: "production", label: "Production" },
                                        { value: "staging", label: "Staging" },
                                        { value: "dev", label: "Dev" },
                                    ] }]}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-sm font-medium text-pulse-text-soft">Safety mode</span>
                                <InfoTip text="Enforced in code, not just by prompt — destructive commands are actually blocked before they ever reach the server, unless Full is selected." />
                            </div>
                            <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Safety mode">
                                {SAFETY_OPTIONS.map((opt) => {
                                    const checked = safetyMode === opt.value;
                                    return (
                                        <label
                                            key={opt.value}
                                            className={`relative flex flex-col gap-1 rounded-lg border p-3.5 cursor-pointer transition-colors motion-reduce:transition-none ${checked ? "border-indigo-500 ring-1 ring-indigo-500 bg-pulse-tint/40" : "border-pulse-border hover:border-pulse-border-strong"}`}
                                        >
                                            <input
                                                type="radio"
                                                name="safetyMode"
                                                value={opt.value}
                                                checked={checked}
                                                onChange={() => setSafetyMode(opt.value)}
                                                className="sr-only"
                                            />
                                            <span className={`text-sm font-semibold ${checked ? "text-indigo-500" : "text-pulse-text"}`}>
                                                {opt.title}
                                                {opt.value === "full" && <ExclamationTriangleIcon className="inline w-3.5 h-3.5 ml-1 mb-0.5" aria-hidden="true" />}
                                            </span>
                                            <span className="text-xs text-pulse-muted leading-snug">{opt.description}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-sm font-medium text-pulse-text-soft">Require approval</span>
                                <InfoTip text="Holds a command until a designated approver taps Allow/Deny on a Telegram DM card. Mark someone as an approver on the People page first." />
                            </div>
                            <div className="max-w-xs">
                                <SelectMenu
                                    id="srv-approval-mode"
                                    name="approvalMode"
                                    ariaLabel="Require approval"
                                    value={approvalMode}
                                    onChange={(v) => setApprovalMode(v as ApprovalMode)}
                                    groups={[{ label: "Require approval", options: [
                                        { value: "off", label: "Off" },
                                        { value: "writes", label: "Writes only" },
                                        { value: "all", label: "Everything" },
                                    ] }]}
                                />
                            </div>
                        </div>

                        {isProductionFull && (
                            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 space-y-3">
                                <div className="flex items-start gap-2 text-sm text-red-500">
                                    <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                    <p><strong>Full access on a production server</strong> — the agent can run ANY command, including destructive ones. Guardrails are disabled.</p>
                                </div>
                                <label className="flex items-center gap-2 text-sm text-red-500 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={riskAcknowledged}
                                        onChange={(e) => setRiskAcknowledged(e.target.checked)}
                                        className="h-4 w-4 rounded border-red-400 text-red-600 focus:ring-red-500 cursor-pointer"
                                    />
                                    I understand the risk
                                </label>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Operating instructions */}
                <Card>
                    <CardHeader title="Operating instructions" description="Guidance shown to the agent verbatim before it runs any command." />
                    <div className="p-5">
                        <textarea
                            name="instructions"
                            rows={4}
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            placeholder="This is production. Never restart the database. Deploy only via ./deploy.sh. Logs live in /var/log/app/."
                            className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow motion-reduce:transition-none resize-y"
                        />
                    </div>
                </Card>

                {/* Agent access */}
                <Card>
                    <CardHeader title="Agent access" description="Only selected agents can see or use this server." />
                    <div className="p-5">
                        {agents.length === 0 ? (
                            <p className="text-sm text-pulse-faint italic">No agents yet — create an agent first, then come back to grant it access.</p>
                        ) : (
                            <div className="divide-y divide-pulse-border-subtle">
                                {agents.map((a) => {
                                    const checked = allowed.includes(a.id);
                                    return (
                                        <label key={a.id} className="flex items-center gap-3 py-2.5 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => setAllowed(checked ? allowed.filter((id) => id !== a.id) : [...allowed, a.id])}
                                                className="h-4 w-4 rounded border-pulse-border text-indigo-600 focus:ring-indigo-600 focus:ring-offset-2 focus:ring-offset-pulse-panel cursor-pointer"
                                            />
                                            <span className="text-sm text-pulse-text">{a.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                        <p className="text-xs text-pulse-faint mt-3">
                            {allowed.length === 0 ? "No agent has access yet — select at least one above." : `${allowed.length} agent${allowed.length > 1 ? "s" : ""} selected.`}
                        </p>
                    </div>
                </Card>

                {/* Enabled + Save */}
                <Card>
                    <SettingRow
                        title="Enabled"
                        description="Disabled servers are hidden from all agents, even if they're listed above."
                        control={<Toggle checked={enabled} onChange={setEnabled} label="Enable this server" />}
                    />
                </Card>

                <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end border-t border-pulse-border-subtle pt-5">
                    <Link href="/dashboard/servers" className="px-4 py-2 text-sm font-medium text-pulse-text-soft bg-pulse-panel border border-pulse-border rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none text-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Cancel</Link>
                    <button type="submit" disabled={loading || !canSave}
                        className="inline-flex items-center justify-center gap-1.5 px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                        {loading && <svg className="animate-spin motion-reduce:animate-none h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>}
                        {loading ? "Saving…" : isEdit ? "Save changes" : "Add server"}
                    </button>
                </div>
            </form>
        </div>
    );
}
