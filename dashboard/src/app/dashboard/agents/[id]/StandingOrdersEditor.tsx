"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilSquareIcon, TrashIcon, PlusIcon } from "@heroicons/react/24/outline";
import {
    getStandingOrdersAction,
    createStandingOrderAction,
    updateStandingOrderAction,
    toggleStandingOrderAction,
    deleteStandingOrderAction,
    StandingOrderDTO,
} from "./standing-orders-actions";

const FIELDS: { key: keyof Omit<StandingOrderDTO, "id" | "name" | "enabled">; label: string; placeholder: string }[] = [
    { key: "scope", label: "What it's allowed to do", placeholder: "e.g. Prepare and send the weekly sales summary to the team channel." },
    { key: "trigger", label: "When", placeholder: "e.g. Every Friday at 4pm, or when a new order file arrives." },
    { key: "steps", label: "Steps", placeholder: "e.g. 1) Pull this week's orders from ERPNext  2) Total by product  3) Post to the Sales channel." },
    { key: "approvalGates", label: "Ask me before", placeholder: "e.g. Issuing any refund over P500, or emailing a customer directly." },
    { key: "escalation", label: "Stop and escalate to me if", placeholder: "e.g. The data looks wrong, a total is negative, or a step fails twice." },
    { key: "boundaries", label: "Never", placeholder: "e.g. Never delete records. Never share pricing with anyone outside the company." },
];

const EMPTY: StandingOrderDTO = { id: "", name: "", enabled: true, scope: "", trigger: "", steps: "", approvalGates: "", escalation: "", boundaries: "" };

export default function StandingOrdersEditor({ agentId }: { agentId: string }) {
    const router = useRouter();
    const [orders, setOrders] = useState<StandingOrderDTO[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<StandingOrderDTO | null>(null); // null = form closed
    const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string }>({ type: "idle", message: "" });
    const [saving, startSaving] = useTransition();
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setOrders(await getStandingOrdersAction(agentId));
        setLoading(false);
    };
    useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [agentId]);

    const openNew = () => { setEditing({ ...EMPTY }); setStatus({ type: "idle", message: "" }); };
    const openEdit = (o: StandingOrderDTO) => { setEditing({ ...o }); setStatus({ type: "idle", message: "" }); };

    const save = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editing) return;
        const fd = new FormData();
        fd.set("agentId", agentId);
        if (editing.id) fd.set("id", editing.id);
        fd.set("name", editing.name);
        for (const f of FIELDS) fd.set(f.key, editing[f.key]);
        startSaving(async () => {
            const res = editing.id ? await updateStandingOrderAction(fd) : await createStandingOrderAction(fd);
            setStatus({ type: res.success ? "success" : "error", message: res.message });
            if (res.success) { setEditing(null); await load(); router.refresh(); }
        });
    };

    const toggle = async (o: StandingOrderDTO) => {
        setBusyId(o.id);
        await toggleStandingOrderAction(o.id, agentId, !o.enabled);
        await load();
        setBusyId(null);
        router.refresh();
    };

    const remove = async (o: StandingOrderDTO) => {
        if (!confirm(`Delete standing order "${o.name}"?`)) return;
        setBusyId(o.id);
        await deleteStandingOrderAction(o.id, agentId);
        await load();
        setBusyId(null);
        router.refresh();
    };

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-pulse-text">Standing Orders</h2>
                        <p className="text-sm text-pulse-muted mt-1 max-w-2xl">
                            Give this agent a standing job it runs on its own — like a role description for an employee.
                            Define what it may do, when, the steps, what needs your sign-off, and its limits. The agent follows
                            these in every conversation and escalates the exceptions to you.
                        </p>
                    </div>
                    {!editing && (
                        <button
                            type="button"
                            onClick={openNew}
                            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none cursor-pointer flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            <PlusIcon className="w-4 h-4" /> New program
                        </button>
                    )}
                </div>
            </div>

            {/* Editor form */}
            {editing && (
                <form onSubmit={save} className="rounded-xl border border-pulse-border bg-pulse-panel p-5 space-y-4">
                    <div>
                        <label htmlFor="so-name" className="block text-sm font-medium text-pulse-text-soft mb-1.5">Program name</label>
                        <input
                            id="so-name"
                            type="text"
                            value={editing.name}
                            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                            placeholder="e.g. Weekly sales report"
                            className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-pulse-panel text-pulse-text"
                        />
                    </div>
                    {FIELDS.map((f) => (
                        <div key={f.key}>
                            <label htmlFor={`so-${f.key}`} className="block text-sm font-medium text-pulse-text-soft mb-1.5">{f.label}</label>
                            <textarea
                                id={`so-${f.key}`}
                                rows={2}
                                value={editing[f.key]}
                                onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                                placeholder={f.placeholder}
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-pulse-panel text-pulse-text resize-y"
                            />
                        </div>
                    ))}
                    {status.type !== "idle" && (
                        <p className={`text-sm ${status.type === "success" ? "text-green-400" : "text-red-400"}`}>{status.message}</p>
                    )}
                    <div className="flex items-center gap-3">
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            {saving ? "Saving..." : editing.id ? "Save program" : "Create program"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="px-4 py-2 text-sm font-medium text-pulse-muted hover:text-pulse-text transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* List */}
            {loading ? (
                <p className="text-sm text-pulse-muted">Loading…</p>
            ) : orders.length === 0 && !editing ? (
                <div className="rounded-xl border border-dashed border-pulse-border p-8 text-center">
                    <p className="text-sm text-pulse-muted">No standing orders yet. Add one to give this agent a routine it runs on its own.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {orders.map((o) => (
                        <div key={o.id} className="rounded-xl border border-pulse-border bg-pulse-panel p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-pulse-text truncate">{o.name}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full border ${o.enabled ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-pulse-panel-alt text-pulse-faint border-pulse-border"}`}>
                                            {o.enabled ? "Active" : "Off"}
                                        </span>
                                    </div>
                                    {o.scope && <p className="text-sm text-pulse-muted mt-1 line-clamp-2">{o.scope}</p>}
                                    {o.trigger && <p className="text-xs text-pulse-faint mt-1">When: {o.trigger}</p>}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => toggle(o)}
                                        disabled={busyId === o.id}
                                        className="px-2.5 py-1.5 text-xs font-medium text-pulse-muted hover:text-pulse-text hover:bg-pulse-hover rounded-lg transition-colors cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    >
                                        {o.enabled ? "Disable" : "Enable"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openEdit(o)}
                                        aria-label="Edit"
                                        className="p-1.5 text-pulse-muted hover:text-pulse-text hover:bg-pulse-hover rounded-lg transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    >
                                        <PencilSquareIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => remove(o)}
                                        disabled={busyId === o.id}
                                        aria-label="Delete"
                                        className="p-1.5 text-pulse-muted hover:text-red-400 hover:bg-pulse-hover rounded-lg transition-colors cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
