"use client";

/**
 * The share sheet, shared by every shareable thing.
 *
 * One component rather than a per-feature dialog: sharing is where a UI
 * inconsistency turns into a real mistake — if the chat sheet says "Anyone in
 * the workspace" and the notes sheet says "Public", people will eventually
 * click the wrong one. The wording lives here once.
 */

import { useEffect, useState, useTransition } from "react";
import { XMarkIcon, GlobeAltIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import {
    getSharingAction,
    shareAction,
    unshareAction,
    setWorkspaceVisibilityAction,
} from "../../app/dashboard/share-actions";

type Person = { userId: string; name: string | null; email: string; access: string };

export default function ShareDialog({
    resourceType,
    resourceId,
    label,
    visibility,
    onClose,
    onChanged,
}: {
    resourceType: "conversation" | "note" | "todo" | "bookmark" | "document";
    resourceId: string;
    /** What is being shared, in the user's words — "this chat", "this note". */
    label: string;
    visibility: string;
    onClose: () => void;
    onChanged?: () => void;
}) {
    const [shares, setShares] = useState<Person[]>([]);
    const [candidates, setCandidates] = useState<Person[]>([]);
    const [allowed, setAllowed] = useState(true);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState<string | null>(null);
    const [openToAll, setOpenToAll] = useState(visibility === "workspace");
    const [pending, startTransition] = useTransition();

    async function load() {
        const res = await getSharingAction(resourceType, resourceId);
        setShares(res.shares);
        setCandidates(res.candidates);
        setAllowed(res.canShare);
        setLoading(false);
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resourceType, resourceId]);

    // Escape closes, as it does in every other sheet in the product.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    function run(action: (fd: FormData) => Promise<{ success: boolean; message: string }>, fd: FormData) {
        setNotice(null);
        startTransition(async () => {
            const res = await action(fd);
            setNotice(res.message);
            if (res.success) {
                await load();
                onChanged?.();
            }
        });
    }

    function add(userId: string) {
        const fd = new FormData();
        fd.set("resourceType", resourceType);
        fd.set("resourceId", resourceId);
        fd.set("userId", userId);
        run(shareAction, fd);
    }

    function remove(userId: string) {
        const fd = new FormData();
        fd.set("resourceType", resourceType);
        fd.set("resourceId", resourceId);
        fd.set("userId", userId);
        run(unshareAction, fd);
    }

    function toggleWorkspace(next: boolean) {
        setOpenToAll(next);
        const fd = new FormData();
        fd.set("resourceType", resourceType);
        fd.set("resourceId", resourceId);
        fd.set("open", next ? "true" : "false");
        run(setWorkspaceVisibilityAction, fd);
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="w-full max-w-md rounded-2xl border border-pulse-border bg-pulse-panel shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={`Share ${label}`}
            >
                <div className="flex items-center gap-3 border-b border-pulse-border-subtle px-5 py-4">
                    <h2 className="flex-1 text-[15px] font-semibold text-pulse-text">Share {label}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="cursor-pointer rounded-lg p-1.5 text-pulse-faint hover:bg-pulse-hover hover:text-pulse-text outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                    >
                        <XMarkIcon className="h-4 w-4" />
                    </button>
                </div>

                {loading ? (
                    <p className="px-5 py-8 text-center text-sm text-pulse-muted">Loading…</p>
                ) : !allowed ? (
                    <p className="px-5 py-8 text-center text-sm text-pulse-muted">
                        Only the owner can change who this is shared with.
                    </p>
                ) : (
                    <div className="px-5 py-4">
                        {/* Workspace-wide first: it is the coarse, consequential switch. */}
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-pulse-border-subtle p-3">
                            <input
                                type="checkbox"
                                checked={openToAll}
                                disabled={pending}
                                onChange={(e) => toggleWorkspace(e.target.checked)}
                                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-pulse-border bg-pulse-panel accent-indigo-600"
                            />
                            <span className="min-w-0">
                                <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-pulse-text">
                                    {openToAll ? (
                                        <GlobeAltIcon className="h-4 w-4 text-pulse-muted" aria-hidden="true" />
                                    ) : (
                                        <LockClosedIcon className="h-4 w-4 text-pulse-muted" aria-hidden="true" />
                                    )}
                                    Anyone in this workspace
                                </span>
                                <span className="mt-0.5 block text-xs text-pulse-muted">
                                    {openToAll
                                        ? "Everyone here can open it, including people who join later."
                                        : "Only you and the people you name below."}
                                </span>
                            </span>
                        </label>

                        <h3 className="px-1 pb-1.5 pt-5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-pulse-dim">
                            People with access
                        </h3>
                        {shares.length === 0 ? (
                            <p className="px-1 pb-1 text-xs text-pulse-faint">Just you.</p>
                        ) : (
                            shares.map((p) => (
                                <div key={p.userId} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-pulse-text">
                                        {p.name || p.email}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => remove(p.userId)}
                                        disabled={pending}
                                        className="cursor-pointer rounded text-xs text-pulse-muted hover:text-red-400 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))
                        )}

                        {candidates.length > 0 && (
                            <>
                                <h3 className="px-1 pb-1.5 pt-5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-pulse-dim">
                                    Add someone
                                </h3>
                                <div className="max-h-44 overflow-y-auto">
                                    {candidates.map((p) => (
                                        <button
                                            key={p.userId}
                                            type="button"
                                            onClick={() => add(p.userId)}
                                            disabled={pending}
                                            className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-pulse-hover disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                                        >
                                            <span className="min-w-0 flex-1 truncate text-[13.5px] text-pulse-text">
                                                {p.name || p.email}
                                            </span>
                                            <span className="shrink-0 text-xs text-pulse-muted">Share</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}

                        {notice && <p className="pt-4 text-xs text-pulse-muted">{notice}</p>}
                    </div>
                )}
            </div>
        </div>
    );
}
