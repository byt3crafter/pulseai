"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";

type Row = { sessionId: string; title: string; updatedAt: string; preview?: string; agentName?: string | null; agentId?: string };

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
                        <Link
                            key={r.sessionId}
                            href={`/dashboard/assistant?session=${encodeURIComponent(r.sessionId)}${r.agentId ? `&agent=${encodeURIComponent(r.agentId)}` : ""}`}
                            className="grid cursor-pointer grid-cols-[1fr_130px_130px] items-center border-b border-pulse-border-subtle px-3 py-3.5 text-[13.5px] transition-colors motion-reduce:transition-none hover:bg-pulse-hover outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pulse-accent/50"
                        >
                            <span className="truncate pr-4 text-pulse-text">{r.title || "New chat"}</span>
                            <span className="truncate font-mono text-xs text-pulse-muted">{r.agentName ?? ""}</span>
                            <span className="text-pulse-faint">{when(r.updatedAt)}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
