"use client";

import { Fragment, useState } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import type { RunRow } from "../../../utils/run-queries";
import { RunStatusBadge, triggerLabel, formatDuration, relativeTime } from "../../../components/dashboard/run-ui";

export default function TasksTable({ rows }: { rows: RunRow[] }) {
    const [open, setOpen] = useState<string | null>(null);

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-pulse-border-subtle text-left text-xs uppercase tracking-wider text-pulse-faint">
                        <th className="px-4 py-3 font-medium">Task</th>
                        <th className="px-4 py-3 font-medium">Agent</th>
                        <th className="px-4 py-3 font-medium">Trigger</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium text-right">Duration</th>
                        <th className="px-4 py-3 font-medium text-right">Tokens</th>
                        <th className="px-4 py-3 font-medium text-right">Started</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-pulse-border-subtle">
                    {rows.map((r) => {
                        const isOpen = open === r.id;
                        return (
                            <Fragment key={r.id}>
                                <tr
                                    onClick={() => setOpen(isOpen ? null : r.id)}
                                    className="cursor-pointer hover:bg-pulse-hover"
                                >
                                    <td className="max-w-xs px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <ChevronRightIcon className={`h-3.5 w-3.5 shrink-0 text-pulse-faint transition-transform ${isOpen ? "rotate-90" : ""}`} />
                                            <span className="truncate text-pulse-text">{r.title || "(untitled task)"}</span>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-pulse-soft">{r.agentName || "—"}</td>
                                    <td className="whitespace-nowrap px-4 py-3 text-pulse-muted">{triggerLabel(r.trigger)}</td>
                                    <td className="whitespace-nowrap px-4 py-3"><RunStatusBadge status={r.status} /></td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-pulse-soft">{formatDuration(r.durationMs)}</td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-pulse-soft">
                                        {r.inputTokens + r.outputTokens > 0 ? (r.inputTokens + r.outputTokens).toLocaleString() : "—"}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right text-pulse-faint">{relativeTime(r.startedAt)}</td>
                                </tr>
                                {isOpen && (
                                    <tr className="bg-pulse-panel-alt/50">
                                        <td colSpan={7} className="px-6 py-4">
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="space-y-1.5 text-xs">
                                                    <DetailRow label="Model" value={r.model || "—"} />
                                                    <DetailRow label="Input tokens" value={r.inputTokens.toLocaleString()} />
                                                    <DetailRow label="Output tokens" value={r.outputTokens.toLocaleString()} />
                                                    <DetailRow label="Metered cost" value={r.costUsd > 0 ? `$${r.costUsd.toFixed(6)}` : "$0 (flat-rate model)"} />
                                                    <DetailRow label="Tool calls" value={String(r.toolCallCount)} />
                                                </div>
                                                <div className="text-xs">
                                                    <p className="mb-1.5 font-medium uppercase tracking-wider text-pulse-faint">Tool trace</p>
                                                    {r.toolCalls.length === 0 ? (
                                                        <p className="text-pulse-muted">No tools called.</p>
                                                    ) : (
                                                        <ol className="space-y-1">
                                                            {r.toolCalls.map((t, i) => (
                                                                <li key={i} className="flex items-center gap-2">
                                                                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${t.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                                                                    <span className="font-mono text-pulse-soft">{t.name}</span>
                                                                    <span className="text-pulse-faint">{formatDuration(t.ms)}</span>
                                                                </li>
                                                            ))}
                                                        </ol>
                                                    )}
                                                    {r.error && (
                                                        <div className="mt-3">
                                                            <p className="mb-1 font-medium uppercase tracking-wider text-red-500">Error</p>
                                                            <p className="whitespace-pre-wrap break-words font-mono text-red-400">{r.error}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-pulse-faint">{label}</span>
            <span className="tabular-nums text-pulse-soft">{value}</span>
        </div>
    );
}
