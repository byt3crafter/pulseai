"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    BookmarkIcon,
    MagnifyingGlassIcon,
    PencilIcon,
    PlusIcon,
    TrashIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";
import { Card, EmptyState } from "../../../components/dashboard/ui";
import { deleteBookmarkAction, saveBookmarkAction, type BookmarkKind, type BookmarkRow } from "./actions";

type FormState = {
    id: string;
    url: string;
    title: string;
    notes: string;
    tags: string;
};

const EMPTY_FORM: FormState = { id: "", url: "", title: "", notes: "", tags: "" };

const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500";
const labelCls = "block text-xs font-medium text-pulse-muted mb-1.5";

const KIND_BADGE: Record<BookmarkKind, string> = {
    web: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    youtube: "bg-red-500/10 text-red-400 border-red-500/30",
};

const KIND_LABEL: Record<BookmarkKind, string> = {
    web: "Web",
    youtube: "YouTube",
};

function displayTitle(bookmark: BookmarkRow): string {
    return bookmark.title?.trim() || bookmark.url;
}

function formatDate(value: Date | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function BookmarksClient({ bookmarks }: { bookmarks: BookmarkRow[] }) {
    const router = useRouter();
    const [, startTransition] = useTransition();

    const [search, setSearch] = useState("");
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return bookmarks;
        return bookmarks.filter((b) => {
            const haystack = `${b.title ?? ""} ${b.url} ${b.tags ?? ""}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [bookmarks, search]);

    function openAddForm() {
        setForm(EMPTY_FORM);
        setFormError(null);
        setFormOpen(true);
    }

    function openEditForm(bookmark: BookmarkRow) {
        setForm({
            id: bookmark.id,
            url: bookmark.url,
            title: bookmark.title ?? "",
            notes: bookmark.notes ?? "",
            tags: bookmark.tags ?? "",
        });
        setFormError(null);
        setFormOpen(true);
    }

    function closeForm() {
        setFormOpen(false);
        setFormError(null);
    }

    function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!form.url.trim()) {
            setFormError("URL is required.");
            return;
        }
        setFormSaving(true);
        setFormError(null);
        const fd = new FormData();
        fd.set("id", form.id);
        fd.set("url", form.url);
        fd.set("title", form.title);
        fd.set("notes", form.notes);
        fd.set("tags", form.tags);
        startTransition(async () => {
            const res = await saveBookmarkAction(fd);
            setFormSaving(false);
            if (res.success) {
                setFormOpen(false);
                setMessage({ type: "success", text: res.message || "Bookmark saved." });
                router.refresh();
            } else {
                setFormError(res.message || "Failed to save bookmark.");
            }
        });
    }

    function handleDelete(bookmark: BookmarkRow) {
        if (!confirm(`Delete bookmark "${displayTitle(bookmark)}"? This cannot be undone.`)) return;
        setBusyRows((prev) => ({ ...prev, [bookmark.id]: true }));
        startTransition(async () => {
            const res = await deleteBookmarkAction(bookmark.id);
            setBusyRows((prev) => ({ ...prev, [bookmark.id]: false }));
            setMessage({ type: res.success ? "success" : "error", text: res.message || "" });
            if (res.success) router.refresh();
        });
    }

    return (
        <div>
            {message && (
                <div
                    role="status"
                    className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
                        message.type === "success"
                            ? "bg-green-500/10 text-green-500 border-green-500/30"
                            : "bg-red-500/10 text-red-500 border-red-500/30"
                    }`}
                >
                    {message.text}
                </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-0 sm:max-w-xs">
                    <MagnifyingGlassIcon
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pulse-faint pointer-events-none"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search bookmarks…"
                        aria-label="Search bookmarks by title, URL, or tags"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>
                <button
                    type="button"
                    onClick={openAddForm}
                    className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap sm:ml-auto"
                >
                    <PlusIcon className="w-4 h-4" aria-hidden="true" />
                    Add bookmark
                </button>
            </div>

            {/* Add/edit form */}
            {formOpen && (
                <Card className="mb-4">
                    <form onSubmit={handleFormSubmit}>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-pulse-border-subtle">
                            <h2 className="text-sm font-semibold text-pulse-text">{form.id ? "Edit bookmark" : "Add bookmark"}</h2>
                            <button
                                type="button"
                                onClick={closeForm}
                                aria-label="Close form"
                                className="p-1 rounded-lg text-pulse-faint hover:text-pulse-text hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                <XMarkIcon className="w-4 h-4" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                                <label htmlFor="bookmark-url" className={labelCls}>
                                    URL <span className="text-pulse-faint">(required)</span>
                                </label>
                                <input
                                    id="bookmark-url"
                                    type="url"
                                    required
                                    placeholder="https://example.com/article"
                                    value={form.url}
                                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="bookmark-title" className={labelCls}>Title</label>
                                <input
                                    id="bookmark-title"
                                    type="text"
                                    placeholder="Optional display title"
                                    value={form.title}
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="bookmark-tags" className={labelCls}>Tags</label>
                                <input
                                    id="bookmark-tags"
                                    type="text"
                                    placeholder="e.g. research, reading"
                                    value={form.tags}
                                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="bookmark-notes" className={labelCls}>Notes</label>
                                <textarea
                                    id="bookmark-notes"
                                    rows={3}
                                    value={form.notes}
                                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                    className={`${inputCls} resize-none`}
                                />
                            </div>
                        </div>
                        {formError && (
                            <div className="px-4 pb-2">
                                <p className="text-xs text-red-500">{formError}</p>
                            </div>
                        )}
                        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-pulse-border-subtle">
                            <button
                                type="button"
                                onClick={closeForm}
                                className="text-sm font-medium text-pulse-muted hover:text-pulse-text transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md px-3 py-2"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={formSaving}
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {formSaving ? "Saving…" : form.id ? "Save changes" : "Add bookmark"}
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Table */}
            <Card>
                {bookmarks.length === 0 ? (
                    <EmptyState
                        icon={BookmarkIcon}
                        title="No bookmarks yet"
                        description="Save links you want to keep handy — web pages and YouTube videos are tagged automatically."
                        action={
                            <button
                                type="button"
                                onClick={openAddForm}
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            >
                                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                                Add bookmark
                            </button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={MagnifyingGlassIcon}
                        title="No matching bookmarks"
                        description="Try a different search term."
                        action={
                            <button
                                type="button"
                                onClick={() => setSearch("")}
                                className="text-sm font-medium text-indigo-500 hover:text-indigo-400 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
                            >
                                Clear search
                            </button>
                        }
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-xs uppercase tracking-wide text-pulse-faint border-b border-pulse-border-subtle">
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Title</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">URL</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Kind</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Tags</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Updated</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((bookmark) => {
                                    const busy = !!busyRows[bookmark.id];
                                    return (
                                        <tr key={bookmark.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            <td className="px-4 py-3 align-top font-medium text-pulse-text max-w-xs truncate">{displayTitle(bookmark)}</td>
                                            <td className="px-4 py-3 align-top max-w-xs truncate">
                                                <a
                                                    href={bookmark.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-indigo-500 hover:text-indigo-400 hover:underline transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm"
                                                >
                                                    {bookmark.url}
                                                </a>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <span className={`inline-flex items-center text-xs font-medium rounded-full border px-2 py-0.5 ${KIND_BADGE[bookmark.kind]}`}>
                                                    {KIND_LABEL[bookmark.kind]}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 align-top text-pulse-soft">{bookmark.tags || <span className="text-pulse-faint">—</span>}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft whitespace-nowrap">{formatDate(bookmark.updatedAt)}</td>
                                            <td className="px-4 py-3 align-top text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditForm(bookmark)}
                                                        aria-label={`Edit ${displayTitle(bookmark)}`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-indigo-500 hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                    >
                                                        <PencilIcon className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(bookmark)}
                                                        disabled={busy}
                                                        aria-label={`Delete ${displayTitle(bookmark)}`}
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
                )}
            </Card>
        </div>
    );
}
