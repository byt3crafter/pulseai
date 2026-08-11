"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import { Card, EmptyState } from "../../../components/dashboard/ui";

interface AuditRow {
    id: string;
    actorEmail: string | null;
    actorRole: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    summary: string | null;
    createdAt: string;
}

interface Props {
    logs: AuditRow[];
    total: number;
    page: number;
    pageSize: number;
    action: string;
    actor: string;
}

function buildAuditUrl(params: { action: string; actor: string; page: number }): string {
    const usp = new URLSearchParams();
    if (params.action) usp.set("action", params.action);
    if (params.actor) usp.set("actor", params.actor);
    if (params.page) usp.set("page", String(params.page));
    const qs = usp.toString();
    return qs ? `/dashboard/audit?${qs}` : "/dashboard/audit";
}

function formatWhen(iso: string): { relative: string; absolute: string } {
    if (!iso) return { relative: "—", absolute: "" };
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return { relative: "—", absolute: "" };

    const absolute = date.toLocaleString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }) + " UTC";

    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    let relative: string;
    if (diffSec < 5) relative = "just now";
    else if (diffSec < 60) relative = `${diffSec}s ago`;
    else if (diffSec < 3600) relative = `${Math.floor(diffSec / 60)}m ago`;
    else if (diffSec < 86400) relative = `${Math.floor(diffSec / 3600)}h ago`;
    else if (diffSec < 604800) relative = `${Math.floor(diffSec / 86400)}d ago`;
    else relative = date.toLocaleDateString();

    return { relative, absolute };
}

function formatTargetId(targetId: string | null): string {
    if (!targetId) return "";
    return targetId.length > 12 ? `${targetId.slice(0, 8)}…` : targetId;
}

export default function AuditViewClient({ logs, total, page, pageSize, action, actor }: Props) {
    const router = useRouter();
    const [actionInput, setActionInput] = useState(action);
    const [actorInput, setActorInput] = useState(actor);

    const from = total === 0 ? 0 : page * pageSize + 1;
    const to = Math.min((page + 1) * pageSize, total);
    const hasPrev = page > 0;
    const hasNext = to < total;

    const handleFilterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        router.push(buildAuditUrl({ action: actionInput.trim(), actor: actorInput.trim(), page: 0 }));
    };

    const handleClear = () => {
        setActionInput("");
        setActorInput("");
        router.push("/dashboard/audit");
    };

    const goToPage = (nextPage: number) => {
        router.push(buildAuditUrl({ action, actor, page: nextPage }));
    };

    const hasFilters = !!action || !!actor;

    return (
        <div className="space-y-4">
            {/* Filter bar */}
            <form onSubmit={handleFilterSubmit} className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="relative flex-1 min-w-0 sm:max-w-xs">
                    <label htmlFor="audit-actor-search" className="sr-only">
                        Search by actor email
                    </label>
                    <MagnifyingGlassIcon
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pulse-faint pointer-events-none"
                        aria-hidden="true"
                    />
                    <input
                        id="audit-actor-search"
                        type="search"
                        value={actorInput}
                        onChange={(e) => setActorInput(e.target.value)}
                        placeholder="Search by actor email…"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>
                <div className="flex-1 min-w-0 sm:max-w-xs">
                    <label htmlFor="audit-action-filter" className="sr-only">
                        Filter by action
                    </label>
                    <input
                        id="audit-action-filter"
                        type="text"
                        value={actionInput}
                        onChange={(e) => setActionInput(e.target.value)}
                        placeholder="Filter by action (e.g. agent.update)…"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="submit"
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap"
                    >
                        Apply
                    </button>
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="px-3 py-2 rounded-lg text-sm font-medium text-pulse-muted hover:text-pulse-text hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 whitespace-nowrap"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </form>

            <Card>
                {logs.length === 0 ? (
                    <EmptyState
                        icon={ClipboardDocumentListIcon}
                        title="No activity recorded yet."
                        description={
                            hasFilters
                                ? "No events match your filters. Try clearing them."
                                : "Actions taken in this workspace — by you, your team, or your agents — will show up here."
                        }
                        action={
                            hasFilters ? (
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    className="text-sm font-medium text-indigo-500 hover:text-indigo-400 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
                                >
                                    Clear filters
                                </button>
                            ) : undefined
                        }
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-xs uppercase tracking-wide text-pulse-faint border-b border-pulse-border-subtle">
                                    <th scope="col" className="px-4 py-3 text-left font-medium">When</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Who</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Action</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => {
                                    const when = formatWhen(log.createdAt);
                                    const details =
                                        log.summary ||
                                        (log.targetType
                                            ? `${log.targetType}${log.targetId ? `:${formatTargetId(log.targetId)}` : ""}`
                                            : "—");
                                    return (
                                        <tr key={log.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            <td className="px-4 py-3 align-top whitespace-nowrap">
                                                <span
                                                    className="text-[13px] text-pulse-soft tabular-nums cursor-default"
                                                    title={when.absolute}
                                                >
                                                    {when.relative}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[13px] font-medium text-pulse-text">
                                                        {log.actorEmail || "System"}
                                                    </span>
                                                    {log.actorRole && (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-pulse-panel-alt text-pulse-faint border border-pulse-border-subtle">
                                                            {log.actorRole}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-pulse-panel-alt text-pulse-muted border border-pulse-border-subtle">
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 align-top text-[13px] text-pulse-muted">
                                                {details}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {total > 0 && (
                <div className="flex items-center justify-between gap-4">
                    <span className="text-[11px] text-pulse-faint">
                        Showing {from}–{to} of {total}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => goToPage(page - 1)}
                            disabled={!hasPrev}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-pulse-border bg-pulse-panel text-pulse-muted hover:text-pulse-text hover:border-pulse-border-strong transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Prev
                        </button>
                        <button
                            type="button"
                            onClick={() => goToPage(page + 1)}
                            disabled={!hasNext}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-pulse-border bg-pulse-panel text-pulse-muted hover:text-pulse-text hover:border-pulse-border-strong transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
