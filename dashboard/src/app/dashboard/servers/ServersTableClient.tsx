"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ServerIcon, PlusIcon, TrashIcon, PencilSquareIcon, LockClosedIcon, ShieldCheckIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { PageHeader, Card, EmptyState, Toggle } from "../../../components/dashboard/ui";
import { deleteServerAction, toggleServerEnabledAction } from "./actions";

interface ServerRow {
    id: string;
    name: string;
    host: string;
    port: number;
    environment: string;
    safetyMode: string;
    enabled: boolean;
    agentNames: string[];
}

const ENV_STYLES: Record<string, string> = {
    production: "bg-red-500/10 text-red-500 border-red-500/30",
    staging: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    dev: "bg-green-500/10 text-green-500 border-green-500/30",
};

const SAFETY_META: Record<string, { label: string; icon: typeof LockClosedIcon; className: string }> = {
    observe: { label: "Observe", icon: LockClosedIcon, className: "bg-pulse-panel-alt text-pulse-muted border-pulse-border-subtle" },
    safe: { label: "Safe", icon: ShieldCheckIcon, className: "bg-indigo-500/10 text-indigo-500 border-indigo-500/30" },
    full: { label: "Full", icon: ExclamationTriangleIcon, className: "bg-red-500/10 text-red-500 border-red-500/30" },
};

export default function ServersTableClient({ servers }: { servers: ServerRow[] }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    function setBusy(id: string, busy: boolean) {
        setBusyRows((prev) => ({ ...prev, [id]: busy }));
    }

    function handleToggle(server: ServerRow, next: boolean) {
        setBusy(server.id, true);
        startTransition(async () => {
            const res = await toggleServerEnabledAction(server.id, next);
            setBusy(server.id, false);
            setMessage({ ok: res.success, text: res.message });
            if (res.success) router.refresh();
        });
    }

    function handleDelete(server: ServerRow) {
        if (!confirm(`Delete server "${server.name}"? Agents will immediately lose SSH access to it.`)) return;
        setBusy(server.id, true);
        const fd = new FormData();
        fd.set("serverId", server.id);
        startTransition(async () => {
            const res = await deleteServerAction(fd);
            setBusy(server.id, false);
            setMessage({ ok: res.success, text: res.message });
            if (res.success) router.refresh();
        });
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-[1060px] mx-auto">
            <PageHeader
                title="Servers"
                description="Give agents controlled SSH access to your infrastructure — with guardrails."
                action={
                    <Link
                        href="/dashboard/servers/new"
                        className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 self-start sm:self-auto"
                    >
                        <PlusIcon className="h-4 w-4" aria-hidden="true" /> Add server
                    </Link>
                }
            />

            {message && (
                <div role="status" className={`mb-4 rounded-lg px-4 py-2 text-sm border ${message.ok ? "bg-green-500/10 border-green-500/30 text-green-500" : "bg-red-500/10 border-red-500/30 text-red-500"}`}>
                    {message.text}
                </div>
            )}

            {servers.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={ServerIcon}
                        title="No servers yet"
                        description="Register a VPS or server so your agents can run guarded diagnostics and operations over SSH."
                        action={
                            <Link
                                href="/dashboard/servers/new"
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            >
                                <PlusIcon className="w-4 h-4" aria-hidden="true" /> Add server
                            </Link>
                        }
                    />
                </Card>
            ) : (
                <Card>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-xs uppercase tracking-wide text-pulse-faint border-b border-pulse-border-subtle">
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Server</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Environment</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Safety mode</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Agents</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Enabled</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {servers.map((s) => {
                                    const busy = !!busyRows[s.id];
                                    const envClass = ENV_STYLES[s.environment] || ENV_STYLES.dev;
                                    const safety = SAFETY_META[s.safetyMode] || SAFETY_META.observe;
                                    const SafetyIcon = safety.icon;

                                    return (
                                        <tr key={s.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            {/* Server */}
                                            <td className="px-4 py-3 align-top">
                                                <div className={`flex items-center gap-3 ${!s.enabled ? "opacity-60" : ""}`}>
                                                    <div aria-hidden="true" className="w-8 h-8 rounded-full bg-pulse-tint text-pulse-accent-hi flex items-center justify-center flex-shrink-0">
                                                        <ServerIcon className="w-4 h-4" aria-hidden="true" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <Link
                                                            href={`/dashboard/servers/${s.id}/edit`}
                                                            className="font-medium text-pulse-text hover:text-indigo-500 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                                        >
                                                            {s.name}
                                                        </Link>
                                                        <p className="text-xs text-pulse-faint font-mono truncate max-w-[220px]">{s.host}:{s.port}</p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Environment */}
                                            <td className="px-4 py-3 align-top">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium uppercase tracking-wide ${envClass}`}>
                                                    {s.environment}
                                                </span>
                                            </td>

                                            {/* Safety mode */}
                                            <td className="px-4 py-3 align-top">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${safety.className}`}>
                                                    <SafetyIcon className="w-3 h-3" aria-hidden="true" />
                                                    {safety.label}
                                                </span>
                                            </td>

                                            {/* Agents */}
                                            <td className="px-4 py-3 align-top">
                                                {s.agentNames.length === 0 ? (
                                                    <span className="text-sm text-pulse-muted">— none</span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1.5 max-w-xs">
                                                        {s.agentNames.map((name, i) => (
                                                            <span key={`${name}-${i}`} className="inline-flex items-center px-2 py-0.5 rounded-full bg-pulse-panel-alt text-pulse-muted text-xs whitespace-nowrap">
                                                                {name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Enabled */}
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex items-center gap-2">
                                                    <Toggle
                                                        checked={s.enabled}
                                                        onChange={(next) => handleToggle(s, next)}
                                                        label={`${s.enabled ? "Disable" : "Enable"} ${s.name}`}
                                                        disabled={busy}
                                                    />
                                                    <span className={`text-xs font-medium ${s.enabled ? "text-green-500" : "text-pulse-muted"}`}>
                                                        {s.enabled ? "Active" : "Disabled"}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-4 py-3 align-top text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <Link
                                                        href={`/dashboard/servers/${s.id}/edit`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-indigo-500 hover:bg-pulse-tint transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                        title="Edit"
                                                        aria-label={`Edit ${s.name}`}
                                                    >
                                                        <PencilSquareIcon className="w-4 h-4" aria-hidden="true" />
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(s)}
                                                        disabled={busy || pending}
                                                        aria-label={`Delete ${s.name}`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-red-500 hover:bg-red-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <TrashIcon className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}
