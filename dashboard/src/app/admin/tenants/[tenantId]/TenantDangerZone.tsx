"use client";

import { useState } from "react";
import { resetTenantDataAction } from "./actions";
import { ui, Panel } from "../../../../components/admin/ui";

type Scope = "chat" | "memory" | "all";

const SCOPES: { id: Scope; title: string; desc: string }[] = [
    { id: "chat", title: "Conversations & messages", desc: "All chat threads and message history. Agents, channels, users and config are kept." },
    { id: "memory", title: "+ Agent memory", desc: "Also clears vector / auto-memory so agents remember nothing from past chats." },
    { id: "all", title: "+ Usage & execution logs", desc: "Also clears usage records and agent command-execution logs (billing/activity stats). Security audit trail is preserved." },
];

export default function TenantDangerZone({
    tenantId,
    tenantName,
}: {
    tenantId: string;
    tenantName: string;
}) {
    const [scope, setScope] = useState<Scope>("memory");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

    const armed = confirm.trim() === tenantName && !busy;

    const handleReset = async () => {
        if (!armed) return;
        setBusy(true);
        setResult(null);
        const res = await resetTenantDataAction(tenantId, scope, confirm);
        if (res.success && res.counts) {
            const c = res.counts;
            setResult({
                ok: true,
                text: `Done — removed ${c.conversations} conversations, ${c.messages} messages`
                    + (scope !== "chat" ? `, ${c.memoryEntries} memories` : "")
                    + (scope === "all" ? `, ${c.usageRecords} usage records, ${c.execAuditLog} exec logs` : "")
                    + ".",
            });
            setConfirm("");
        } else {
            setResult({ ok: false, text: res.message || "Failed to reset workspace data." });
        }
        setBusy(false);
    };

    return (
        <Panel bodyClassName="p-6 border border-pulse-loss/30">
            <h2 className="text-[15px] font-semibold text-pulse-loss mb-1">Danger Zone — Reset Workspace Data</h2>
            <p className="text-[13px] text-pulse-muted mb-4">
                Permanently delete this workspace&apos;s operational data. Configuration (agents, channels,
                users, credentials, provider keys) is always kept. <span className="text-pulse-loss">This cannot be undone.</span>
            </p>

            <div className="space-y-2.5 mb-5">
                {SCOPES.map((s) => (
                    <label key={s.id} className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="radio"
                            name="reset-scope"
                            checked={scope === s.id}
                            onChange={() => setScope(s.id)}
                            className="mt-0.5 w-4 h-4 accent-pulse-loss"
                        />
                        <div>
                            <span className="text-[13px] font-medium text-pulse-text">{s.title}</span>
                            <p className="text-[11px] text-pulse-muted">{s.desc}</p>
                        </div>
                    </label>
                ))}
            </div>

            <label className={ui.label}>
                Type the workspace name <span className="font-mono text-pulse-text">{tenantName}</span> to confirm
            </label>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={tenantName}
                    className={`${ui.input} max-w-[320px]`}
                    autoComplete="off"
                    spellCheck={false}
                />
                <button onClick={handleReset} disabled={!armed} className={ui.btnDanger}>
                    {busy ? "Resetting…" : "Reset workspace data"}
                </button>
            </div>

            {result && (
                <p className={`mt-3 text-[13px] ${result.ok ? "text-pulse-profit" : "text-pulse-loss"}`}>
                    {result.text}
                </p>
            )}
        </Panel>
    );
}
