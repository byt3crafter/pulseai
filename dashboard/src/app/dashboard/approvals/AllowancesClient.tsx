"use client";

import { useState, useTransition } from "react";
import { revokeAllowanceAction } from "./actions";
import type { StandingAllowance } from "../../../utils/approval-queries";

/**
 * Standing "allow always" grants. Each row can be revoked — that only ever
 * tightens the gate (removes an exemption), so it's safe from the dashboard.
 * Note: a tool-kind allowance is stored under kind='user' (a known quirk); we
 * present the raw subject so it's never mislabeled as a person.
 */
export default function AllowancesClient({ allowances }: { allowances: StandingAllowance[] }) {
    const [items, setItems] = useState(allowances);
    const [pending, startTransition] = useTransition();
    const [busyId, setBusyId] = useState<string | null>(null);

    function revoke(id: string) {
        if (!confirm("Revoke this standing allowance? The agent will ask for approval again next time.")) return;
        setBusyId(id);
        startTransition(async () => {
            const res = await revokeAllowanceAction(id);
            if (res.success) setItems((prev) => prev.filter((a) => a.id !== id));
            setBusyId(null);
        });
    }

    if (items.length === 0) {
        return <p className="px-5 py-8 text-center text-sm text-pulse-muted">No standing allowances. Every gated action currently asks for approval each time.</p>;
    }

    return (
        <ul className="divide-y divide-pulse-border-subtle">
            {items.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="rounded-full border border-pulse-border bg-pulse-panel-alt px-2 py-0.5 text-[11px] font-medium capitalize text-pulse-muted">
                        {a.kind}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-pulse-text">{a.label || a.subject}</p>
                        <p className="truncate text-xs text-pulse-muted font-mono">{a.subject}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => revoke(a.id)}
                        disabled={pending && busyId === a.id}
                        className="shrink-0 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    >
                        {pending && busyId === a.id ? "Revoking…" : "Revoke"}
                    </button>
                </li>
            ))}
        </ul>
    );
}
