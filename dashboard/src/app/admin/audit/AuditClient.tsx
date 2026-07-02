"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { exportAuditCsv } from "./actions";
import { ui, PageHeader, Panel, Badge } from "../../../components/admin/ui";

interface AuditLog {
    id: string;
    tenantId: string | null;
    actorId: string | null;
    actorEmail: string | null;
    actorRole: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    summary: string | null;
    ip: string | null;
    createdAt: string;
}

interface Props {
    logs: AuditLog[];
    total: number;
    page: number;
    pageSize: number;
    action: string;
    q: string;
    actions: string[];
}

function buildAuditUrl(params: { action: string; q: string; page: number }): string {
    const usp = new URLSearchParams();
    if (params.action) usp.set("action", params.action);
    if (params.q) usp.set("q", params.q);
    if (params.page) usp.set("page", String(params.page));
    const qs = usp.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
}

function formatTargetId(targetId: string | null): string {
    if (!targetId) return "—";
    return targetId.length > 12 ? `${targetId.slice(0, 8)}…` : targetId;
}

export default function AuditClient({ logs, total, page, pageSize, action, q, actions }: Props) {
    const router = useRouter();
    const [qInput, setQInput] = useState(q);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");

    const from = total === 0 ? 0 : page * pageSize + 1;
    const to = Math.min((page + 1) * pageSize, total);
    const hasPrev = page > 0;
    const hasNext = to < total;

    const handleActionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        router.push(buildAuditUrl({ action: e.target.value, q, page: 0 }));
    };

    const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        router.push(buildAuditUrl({ action, q: qInput.trim(), page: 0 }));
    };

    const goToPage = (nextPage: number) => {
        router.push(buildAuditUrl({ action, q, page: nextPage }));
    };

    const handleExport = async () => {
        setError("");
        setExporting(true);
        try {
            const csv = await exportAuditCsv(action, q);
            if (!csv) {
                setError("Failed to export audit log.");
                return;
            }
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "audit-log.csv";
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        } catch {
            setError("Failed to export audit log.");
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className={ui.page}>
            <PageHeader
                title="Audit Log"
                subtitle="Platform activity — who did what, when."
                action={
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={exporting}
                        className={ui.btnSecondary}
                    >
                        <ArrowDownTrayIcon aria-hidden="true" className="w-4 h-4" />
                        {exporting ? "Exporting…" : "Export CSV"}
                    </button>
                }
            />

            {error && (
                <div role="alert" className="p-3 bg-pulse-loss/10 border border-pulse-loss/40 rounded-lg text-[13px] text-pulse-loss flex items-center justify-between gap-2">
                    <span>{error}</span>
                    <button
                        onClick={() => setError("")}
                        className="text-pulse-loss hover:text-pulse-loss/80"
                        aria-label="Dismiss error"
                    >
                        &times;
                    </button>
                </div>
            )}

            <Panel bodyClassName="p-4">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="flex-1 min-w-0">
                        <label htmlFor="audit-action-filter" className={ui.label}>
                            Action
                        </label>
                        <select
                            id="audit-action-filter"
                            value={action}
                            onChange={handleActionChange}
                            className={ui.input}
                        >
                            <option value="">All actions</option>
                            {actions.map((a) => (
                                <option key={a} value={a}>
                                    {a}
                                </option>
                            ))}
                        </select>
                    </div>
                    <form onSubmit={handleSearchSubmit} className="flex-1 min-w-0 flex gap-2 items-end">
                        <div className="flex-1 min-w-0">
                            <label htmlFor="audit-actor-search" className={ui.label}>
                                Actor email
                            </label>
                            <input
                                id="audit-actor-search"
                                type="search"
                                value={qInput}
                                onChange={(e) => setQInput(e.target.value)}
                                placeholder="Search by actor email…"
                                className={ui.input}
                            />
                        </div>
                        <button type="submit" className={ui.btnSecondary}>
                            Search
                        </button>
                    </form>
                </div>
            </Panel>

            <Panel bodyClassName="">
                <div className="overflow-x-auto">
                    <table className={ui.table}>
                        <thead>
                            <tr>
                                <th className={ui.th}>Time</th>
                                <th className={ui.th}>Actor</th>
                                <th className={ui.th}>Action</th>
                                <th className={ui.th}>Target</th>
                                <th className={ui.th}>Summary</th>
                                <th className={ui.thRight}>IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id} className={ui.row}>
                                    <td className={`${ui.tdMuted} tabular-nums whitespace-nowrap`}>
                                        {log.createdAt
                                            ? new Date(log.createdAt).toLocaleString(undefined, {
                                                  dateStyle: "medium",
                                                  timeStyle: "short",
                                              })
                                            : "—"}
                                    </td>
                                    <td className={ui.td}>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[13px] font-medium text-pulse-text">
                                                {log.actorEmail || "System"}
                                            </span>
                                            {log.actorRole && (
                                                <Badge variant={log.actorRole === "ADMIN" ? "accent" : "neutral"}>
                                                    {log.actorRole}
                                                </Badge>
                                            )}
                                        </div>
                                    </td>
                                    <td className={ui.td}>
                                        <Badge variant="neutral">
                                            <span className="font-mono">{log.action}</span>
                                        </Badge>
                                    </td>
                                    <td className={ui.tdMuted}>
                                        <div className="text-[13px] text-pulse-muted">
                                            {log.targetType || "—"}
                                        </div>
                                        {log.targetId && (
                                            <div className="text-[11px] text-pulse-faint font-mono mt-0.5">
                                                {formatTargetId(log.targetId)}
                                            </div>
                                        )}
                                    </td>
                                    <td className={ui.td}>{log.summary || "—"}</td>
                                    <td className={`${ui.tdMuted} text-right tabular-nums`}>{log.ip || "—"}</td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-pulse-faint">
                                        No audit events.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <div className="flex items-center justify-between gap-4">
                <span className="text-[11px] text-pulse-faint">
                    Showing {from}–{to} of {total}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => goToPage(page - 1)}
                        disabled={!hasPrev}
                        className={ui.btnSecondary}
                    >
                        Prev
                    </button>
                    <button
                        type="button"
                        onClick={() => goToPage(page + 1)}
                        disabled={!hasNext}
                        className={ui.btnSecondary}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
