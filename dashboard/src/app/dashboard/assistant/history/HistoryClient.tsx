"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { PlusIcon, MagnifyingGlassIcon, TrashIcon } from "@heroicons/react/24/outline";
import { deleteSessionsAction } from "../actions";

type Row = { sessionId: string; title: string; updatedAt: string; preview?: string; agentName?: string | null; agentId?: string; shared?: boolean };

function when(iso: string) {
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    return days < 30 ? `${days}d ago` : d.toLocaleDateString();
}

/**
 * v4's history view: title, agent, when — three columns, one row per chat.
 *
 * Search matches the title, which is only as good as the titles are. They are
 * currently the first message of each chat, so this finds what you asked, not
 * what came back.
 */
export default function HistoryClient({ sessions }: { sessions: Row[] }) {
    const [q, setQ] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [confirming, setConfirming] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const toggle = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    function doDelete(rowsToDelete: Row[]) {
        setNotice(null);
        startTransition(async () => {
            const res = await deleteSessionsAction(
                rowsToDelete.map((r) => ({ sessionId: r.sessionId, agentId: r.agentId ?? "", shared: !!r.shared })),
            );
            setNotice(res.message);
            setConfirming(false);
            if (res.success) setSelected(new Set());
        });
    }
    const rows = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return sessions;
        return sessions.filter((s) => (s.title || "").toLowerCase().includes(needle));
    }, [sessions, q]);

    return (
        <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-[26px] px-10 py-9">
            <div className="flex items-center gap-3">
                <h1 className="flex-1 text-2xl font-semibold tracking-[-0.02em] text-pulse-text">History</h1>
                <Link
                    href="/dashboard/assistant"
                    className="flex items-center gap-[7px] rounded-full bg-pulse-primary px-4 py-2 text-[13px] font-semibold text-pulse-primary-fg transition-colors motion-reduce:transition-none hover:bg-pulse-primary-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                >
                    <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    New chat
                </Link>
            </div>

            {notice && <p className="text-sm text-pulse-muted">{notice}</p>}

            {rows.length > 0 && (
                <label className="flex w-fit cursor-pointer items-center gap-2 px-1 text-sm text-pulse-muted hover:text-pulse-text">
                    <input
                        type="checkbox"
                        aria-label="Select all shown chats"
                        checked={rows.length > 0 && rows.every((r) => selected.has(r.sessionId))}
                        onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.sessionId)) : new Set())}
                        className="h-4 w-4 cursor-pointer rounded border-pulse-border bg-pulse-panel accent-indigo-600"
                    />
                    {/* "shown" not "all": with a search active, selecting rows you
                        cannot see is how people delete more than they meant to. */}
                    Select all {rows.length} shown
                </label>
            )}

            {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-pulse-border bg-pulse-panel-alt px-4 py-2.5">
                    <span className="text-sm text-pulse-text">{selected.size} selected</span>
                    <button type="button" onClick={() => setSelected(new Set())}
                        className="cursor-pointer text-sm text-pulse-muted hover:text-pulse-text outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50 rounded">
                        Clear
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                        {confirming ? (
                            <>
                                <span className="text-sm text-pulse-text">
                                    Delete {selected.size} chat{selected.size === 1 ? "" : "s"} and every message in them? This cannot be undone.
                                </span>
                                <button type="button" onClick={() => setConfirming(false)} disabled={pending}
                                    className="cursor-pointer rounded-lg border border-pulse-border px-3 py-1.5 text-sm text-pulse-text hover:bg-pulse-hover outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50">
                                    Cancel
                                </button>
                                <button type="button" onClick={() => doDelete(rows.filter((r) => selected.has(r.sessionId)))} disabled={pending}
                                    className="cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                                    {pending ? "Deleting…" : "Delete"}
                                </button>
                            </>
                        ) : (
                            <button type="button" onClick={() => { setNotice(null); setConfirming(true); }}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                                <TrashIcon className="h-4 w-4" aria-hidden="true" />
                                Delete
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="relative max-w-sm">
                <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pulse-faint" />
                <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search chats"
                    aria-label="Search chats"
                    className="w-full rounded-lg border border-pulse-border bg-pulse-panel py-2 pl-9 pr-3 text-sm text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                />
            </div>

            {rows.length === 0 ? (
                <p className="py-16 text-center text-sm text-pulse-muted">
                    {q ? "No chats match that." : "No chats yet. Start one and it will show up here."}
                </p>
            ) : (
                <div>
                    {rows.map((r) => (
                        <div
                            key={r.sessionId}
                            className="flex items-center border-b border-pulse-border-subtle transition-colors motion-reduce:transition-none hover:bg-pulse-hover"
                        >
                            <label className="cursor-pointer pl-3 pr-1 py-3.5">
                                <input
                                    type="checkbox"
                                    checked={selected.has(r.sessionId)}
                                    onChange={() => toggle(r.sessionId)}
                                    aria-label={`Select ${r.title || "chat"}`}
                                    className="h-4 w-4 cursor-pointer rounded border-pulse-border bg-pulse-panel accent-indigo-600"
                                />
                            </label>
                            <Link
                                href={`/dashboard/assistant?session=${encodeURIComponent(r.sessionId)}${r.agentId ? `&agent=${encodeURIComponent(r.agentId)}` : ""}${r.shared ? "&shared=1" : ""}`}
                                className="grid flex-1 cursor-pointer grid-cols-[1fr_130px_120px] items-center px-2 py-3.5 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pulse-accent/50"
                            >
                                <span className="truncate pr-4 text-pulse-text">{r.title || "New chat"}</span>
                                <span className="truncate font-mono text-xs text-pulse-muted">{r.agentName ?? ""}</span>
                                <span className="text-pulse-faint">{when(r.updatedAt)}</span>
                            </Link>
                            <button
                                type="button"
                                onClick={() => doDelete([r])}
                                disabled={pending}
                                aria-label={`Delete ${r.title || "chat"}`}
                                className="mr-2 rounded-lg p-2 text-pulse-faint transition-colors motion-reduce:transition-none hover:bg-pulse-panel-alt hover:text-red-400 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            >
                                <TrashIcon className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
