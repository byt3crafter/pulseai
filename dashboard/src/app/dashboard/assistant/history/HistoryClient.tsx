"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { PlusIcon, MagnifyingGlassIcon, TrashIcon, UserPlusIcon, UsersIcon } from "@heroicons/react/24/outline";
import { deleteSessionsAction } from "../actions";
import ShareDialog from "../../../../components/dashboard/ShareDialog";
import { useRouter } from "next/navigation";

type Row = {
    sessionId: string;
    title: string;
    updatedAt: string;
    preview?: string;
    agentName?: string | null;
    agentId?: string;
    shared?: boolean;
    conversationId?: string;
    /** Mine to give away. Ownership, not visibility — see listAllWebSessionsAction. */
    mine?: boolean;
    visibility?: string;
    /** Set when someone else shared this with me. */
    sharedBy?: string | null;
};

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
 * Date buckets, the way every chat history does it.
 *
 * A flat list of forty rows all reading "6d ago" gives the eye nothing to
 * anchor on. Grouping restores the thing people actually navigate by — roughly
 * when they had the conversation.
 */
const BUCKETS: { label: string; within: number }[] = [
    { label: "Today", within: 1 },
    { label: "Yesterday", within: 2 },
    { label: "Previous 7 days", within: 7 },
    { label: "Previous 30 days", within: 30 },
];

function bucketOf(iso: string): string {
    const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
    return BUCKETS.find((b) => days < b.within)?.label ?? "Older";
}

export default function HistoryClient({ sessions }: { sessions: Row[] }) {
    const [q, setQ] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [confirming, setConfirming] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [sharing, setSharing] = useState<Row | null>(null);
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    const rows = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return needle ? sessions.filter((s) => (s.title || "").toLowerCase().includes(needle)) : sessions;
    }, [sessions, q]);

    const grouped = useMemo(() => {
        const out: { label: string; items: Row[] }[] = [];
        for (const r of rows) {
            const label = bucketOf(r.updatedAt);
            const last = out[out.length - 1];
            if (last && last.label === label) last.items.push(r);
            else out.push({ label, items: [r] });
        }
        return out;
    }, [rows]);

    const allShown = rows.length > 0 && rows.every((r) => selected.has(r.sessionId));
    const selecting = selected.size > 0;

    const toggle = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    function doDelete(list: Row[]) {
        setNotice(null);
        startTransition(async () => {
            const res = await deleteSessionsAction(
                list.map((r) => ({ sessionId: r.sessionId, agentId: r.agentId ?? "", shared: !!r.shared })),
            );
            setNotice(res.message);
            setConfirming(false);
            if (res.success) setSelected(new Set());
        });
    }

    return (
        <div className="mx-auto w-full max-w-[1060px] px-6 py-7 sm:px-10 sm:py-9">
            <div className="mb-5 flex items-center gap-3">
                <h1 className="flex-1 text-2xl font-semibold tracking-[-0.02em] text-pulse-text">History</h1>
                <Link
                    href="/dashboard/assistant"
                    className="flex items-center gap-[7px] rounded-full bg-pulse-primary px-4 py-2 text-[13px] font-semibold text-pulse-primary-fg transition-colors motion-reduce:transition-none hover:bg-pulse-primary-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                >
                    <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    New chat
                </Link>
            </div>

            {/*
                One toolbar that swaps contents instead of a second bar appearing
                below it. Selecting a row used to insert a block that pushed the
                search field and the entire list down the page — the list moving
                under the cursor mid-selection is how you tick the wrong thing.
                Fixed height, so nothing shifts.
            */}
            <div className="mb-1 flex h-11 items-center gap-3 border-b border-pulse-border-subtle">
                {selecting ? (
                    <>
                        <span className="text-sm font-medium text-pulse-text">{selected.size} selected</span>
                        <button
                            type="button"
                            onClick={() => { setSelected(new Set()); setConfirming(false); }}
                            className="cursor-pointer rounded text-sm text-pulse-muted hover:text-pulse-text outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                        >
                            Clear
                        </button>
                        <div className="ml-auto flex items-center gap-2">
                            {confirming ? (
                                <>
                                    <span className="text-sm text-pulse-muted">
                                        Delete {selected.size} chat{selected.size === 1 ? "" : "s"} and their messages?
                                    </span>
                                    <button type="button" onClick={() => setConfirming(false)} disabled={pending}
                                        className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm text-pulse-text hover:bg-pulse-hover outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50">
                                        Cancel
                                    </button>
                                    <button type="button" onClick={() => doDelete(rows.filter((r) => selected.has(r.sessionId)))} disabled={pending}
                                        className="cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                                        {pending ? "Deleting…" : "Delete"}
                                    </button>
                                </>
                            ) : (
                                <button type="button" onClick={() => { setNotice(null); setConfirming(true); }}
                                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10 outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                                    <TrashIcon className="h-4 w-4" aria-hidden="true" />
                                    Delete
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="relative w-full max-w-sm">
                        <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-pulse-faint" />
                        <input
                            type="search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search chats"
                            aria-label="Search chats"
                            className="w-full bg-transparent py-2 pl-6 pr-3 text-sm text-pulse-text placeholder-pulse-faint outline-none"
                        />
                    </div>
                )}
            </div>

            {notice && <p className="py-2 text-sm text-pulse-muted">{notice}</p>}

            {rows.length === 0 ? (
                <p className="py-16 text-center text-sm text-pulse-muted">
                    {q ? "No chats match that." : "No chats yet. Start one and it will show up here."}
                </p>
            ) : (
                grouped.map((group) => (
                    <section key={group.label}>
                        <h2 className="px-2 pb-1.5 pt-5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-pulse-dim">
                            {group.label}
                        </h2>
                        {group.items.map((r) => {
                            const isOn = selected.has(r.sessionId);
                            return (
                                <div
                                    key={r.sessionId}
                                    className={`group flex items-center rounded-lg transition-colors motion-reduce:transition-none ${isOn ? "bg-pulse-panel-alt" : "hover:bg-pulse-hover"}`}
                                >
                                    {/*
                                        The tick appears on hover, or stays out once a
                                        selection is running. Fifteen permanently-drawn
                                        checkboxes are noise on a list you mostly read.
                                    */}
                                    <label className={`flex w-9 cursor-pointer items-center justify-center self-stretch ${isOn || selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
                                        <input
                                            type="checkbox"
                                            checked={isOn}
                                            onChange={() => toggle(r.sessionId)}
                                            aria-label={`Select ${r.title || "chat"}`}
                                            className="h-4 w-4 cursor-pointer rounded border-pulse-border bg-pulse-panel accent-indigo-600"
                                        />
                                    </label>
                                    <Link
                                        href={`/dashboard/assistant?session=${encodeURIComponent(r.sessionId)}${r.agentId ? `&agent=${encodeURIComponent(r.agentId)}` : ""}${r.shared ? "&shared=1" : ""}`}
                                        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pulse-accent/50"
                                    >
                                        <span className="min-w-0 flex-1 truncate text-pulse-text">{r.title || "New chat"}</span>
                                        {r.agentName && (
                                            <span className="hidden shrink-0 truncate text-xs text-pulse-muted sm:block">{r.agentName}</span>
                                        )}
                                        {r.sharedBy && (
                                            <span className="hidden shrink-0 items-center gap-1 text-xs text-pulse-faint sm:flex">
                                                <UsersIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                                {r.sharedBy}
                                            </span>
                                        )}
                                        <span className="w-16 shrink-0 text-right text-xs text-pulse-faint">{when(r.updatedAt)}</span>
                                    </Link>
                                    {/*
                                        Share sits next to delete and appears on the same
                                        hover. Only on your own chats: offering it on a
                                        chat someone shared with you would promise
                                        something the server then refuses.
                                    */}
                                    {r.mine && r.conversationId && (
                                        <button
                                            type="button"
                                            onClick={() => setSharing(r)}
                                            aria-label={`Share ${r.title || "chat"}`}
                                            className={`rounded-lg p-2 transition-colors motion-reduce:transition-none hover:bg-pulse-panel-alt hover:text-pulse-text group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50 ${
                                                r.visibility === "private" ? "text-pulse-faint opacity-0" : "text-pulse-accent opacity-100"
                                            }`}
                                        >
                                            <UserPlusIcon className="h-4 w-4" />
                                        </button>
                                    )}
                                    {/* Destructive actions do not sit permanently under the cursor. */}
                                    <button
                                        type="button"
                                        onClick={() => doDelete([r])}
                                        disabled={pending}
                                        aria-label={`Delete ${r.title || "chat"}`}
                                        className="mr-1 rounded-lg p-2 text-pulse-faint opacity-0 transition-colors motion-reduce:transition-none hover:bg-pulse-panel-alt hover:text-red-400 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                    >
                                        <TrashIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </section>
                ))
            )}

            {sharing?.conversationId && (
                <ShareDialog
                    resourceType="conversation"
                    resourceId={sharing.conversationId}
                    label="this chat"
                    visibility={sharing.visibility ?? "private"}
                    onClose={() => setSharing(null)}
                    onChanged={() => router.refresh()}
                />
            )}

            {rows.length > 0 && (
                <label className="mt-6 flex w-fit cursor-pointer items-center gap-2 px-2 text-xs text-pulse-faint hover:text-pulse-muted">
                    <input
                        type="checkbox"
                        aria-label="Select all shown chats"
                        checked={allShown}
                        onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.sessionId)) : new Set())}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-pulse-border bg-pulse-panel accent-indigo-600"
                    />
                    Select all {rows.length} shown
                </label>
            )}
        </div>
    );
}
