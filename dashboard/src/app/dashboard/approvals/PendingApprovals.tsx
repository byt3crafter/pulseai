"use client";

import { useState, useTransition } from "react";
import type { ApprovalItem } from "../../../utils/approval-queries";
import { relativeTime } from "../../../components/dashboard/run-ui";
import { decideApprovalAction } from "./actions";

const KIND_LABEL: Record<string, string> = {
    tool_call: "Tool call",
    user_request: "User request",
    command: "Server command",
};

export default function PendingApprovals({ items }: { items: ApprovalItem[] }) {
    const [list, setList] = useState(items);
    const [pending, startTransition] = useTransition();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    function decide(id: string, action: "allow" | "deny" | "allowall") {
        if (action === "deny" && !confirm("Deny this action? It will not run.")) return;
        setBusyId(id);
        setError(null);
        startTransition(async () => {
            const res = await decideApprovalAction(id, action);
            if (res.success) {
                setList((prev) => prev.filter((a) => a.id !== id));
            } else {
                setError(res.message);
            }
            setBusyId(null);
        });
    }

    if (list.length === 0) {
        return <p className="px-5 py-8 text-center text-sm text-pulse-muted">Nothing waiting. When an agent hits a gated action it appears here.</p>;
    }

    return (
        <div>
            {error && <div className="border-b border-pulse-border-subtle px-5 py-2 text-sm text-red-500">{error}</div>}
            <ul className="divide-y divide-pulse-border-subtle">
                {list.map((item) => {
                    const busy = pending && busyId === item.id;
                    return (
                        <li key={item.id} className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-400">
                                    Pending
                                </span>
                                <span className="rounded-full border border-pulse-border bg-pulse-panel-alt px-2 py-0.5 text-[11px] font-medium text-pulse-muted">
                                    {KIND_LABEL[item.kind] ?? item.kind}
                                </span>
                                {item.agentName && <span className="text-xs text-pulse-soft">{item.agentName}</span>}
                                <span className="ml-auto text-xs text-pulse-faint">requested {relativeTime(item.createdAt)}</span>
                            </div>
                            <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-pulse-border-subtle bg-pulse-panel-alt px-3 py-2 font-sans text-sm text-pulse-soft">
                                {item.summary}
                            </pre>
                            {item.requesterName && <p className="mt-1.5 text-xs text-pulse-muted">Requested by {item.requesterName}</p>}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => decide(item.id, "allow")}
                                    disabled={busy}
                                    className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                                >
                                    {busy ? "Working…" : "Allow"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => decide(item.id, "deny")}
                                    disabled={busy}
                                    className="rounded-lg border border-red-500/40 px-3.5 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                                >
                                    Deny
                                </button>
                                <button
                                    type="button"
                                    onClick={() => decide(item.id, "allowall")}
                                    disabled={busy}
                                    className="rounded-lg border border-pulse-border px-3.5 py-1.5 text-sm font-medium text-pulse-soft transition-colors hover:bg-pulse-hover disabled:opacity-50"
                                    title="Allow this, and stop asking for this tool"
                                >
                                    Allow always
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
