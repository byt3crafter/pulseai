"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    DocumentTextIcon,
    MagnifyingGlassIcon,
    PencilIcon,
    PlusIcon,
    StarIcon as StarOutlineIcon,
    TrashIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { Card, EmptyState } from "../../../components/dashboard/ui";
import { deleteNoteAction, saveNoteAction, type NoteRow } from "./actions";
import ShareDialog from "../../../components/dashboard/ShareDialog";
import { UserPlusIcon } from "@heroicons/react/24/outline";

type FormState = {
    id: string;
    title: string;
    body: string;
    tags: string;
    pinned: boolean;
};

const EMPTY_FORM: FormState = { id: "", title: "", body: "", tags: "", pinned: false };

const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500";
const labelCls = "block text-xs font-medium text-pulse-muted mb-1.5";

function displayTitle(note: NoteRow): string {
    if (note.title && note.title.trim()) return note.title.trim();
    const firstLine = note.body.split("\n")[0]?.trim() || "";
    return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine || "Untitled note";
}

function bodyPreview(body: string): string {
    const flat = body.replace(/\s+/g, " ").trim();
    return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

function formatDate(value: Date | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function NotesClient({ notes }: { notes: NoteRow[] }) {
    const router = useRouter();
    const [, startTransition] = useTransition();

    const [search, setSearch] = useState("");
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});
    const [sharing, setSharing] = useState<NoteRow | null>(null);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return notes;
        return notes.filter((n) => {
            const haystack = `${n.title ?? ""} ${n.body} ${n.tags ?? ""}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [notes, search]);

    function openAddForm() {
        setForm(EMPTY_FORM);
        setFormError(null);
        setFormOpen(true);
    }

    function openEditForm(note: NoteRow) {
        setForm({
            id: note.id,
            title: note.title ?? "",
            body: note.body,
            tags: note.tags ?? "",
            pinned: note.pinned,
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
        if (!form.body.trim()) {
            setFormError("Note body is required.");
            return;
        }
        setFormSaving(true);
        setFormError(null);
        const fd = new FormData();
        fd.set("id", form.id);
        fd.set("title", form.title);
        fd.set("body", form.body);
        fd.set("tags", form.tags);
        fd.set("pinned", form.pinned ? "true" : "false");
        startTransition(async () => {
            const res = await saveNoteAction(fd);
            setFormSaving(false);
            if (res.success) {
                setFormOpen(false);
                setMessage({ type: "success", text: res.message || "Note saved." });
                router.refresh();
            } else {
                setFormError(res.message || "Failed to save note.");
            }
        });
    }

    function handleDelete(note: NoteRow) {
        if (!confirm(`Delete note "${displayTitle(note)}"? This cannot be undone.`)) return;
        setBusyRows((prev) => ({ ...prev, [note.id]: true }));
        startTransition(async () => {
            const res = await deleteNoteAction(note.id);
            setBusyRows((prev) => ({ ...prev, [note.id]: false }));
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
                        placeholder="Search notes…"
                        aria-label="Search notes by title, body, or tags"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>
                <button
                    type="button"
                    onClick={openAddForm}
                    className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap sm:ml-auto"
                >
                    <PlusIcon className="w-4 h-4" aria-hidden="true" />
                    Add note
                </button>
            </div>

            {/* Add/edit form */}
            {formOpen && (
                <Card className="mb-4">
                    <form onSubmit={handleFormSubmit}>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-pulse-border-subtle">
                            <h2 className="text-sm font-semibold text-pulse-text">{form.id ? "Edit note" : "Add note"}</h2>
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
                            <div>
                                <label htmlFor="note-title" className={labelCls}>Title</label>
                                <input
                                    id="note-title"
                                    type="text"
                                    placeholder="Untitled note"
                                    value={form.title}
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="note-tags" className={labelCls}>Tags</label>
                                <input
                                    id="note-tags"
                                    type="text"
                                    placeholder="e.g. ideas, meeting"
                                    value={form.tags}
                                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="note-body" className={labelCls}>
                                    Body <span className="text-pulse-faint">(required)</span>
                                </label>
                                <textarea
                                    id="note-body"
                                    rows={6}
                                    required
                                    value={form.body}
                                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                                    className={`${inputCls} resize-none`}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.pinned}
                                        onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
                                        className="w-4 h-4 rounded border-pulse-border text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                                    />
                                    <span className="text-sm text-pulse-text">Pin this note</span>
                                </label>
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
                                {formSaving ? "Saving…" : form.id ? "Save changes" : "Add note"}
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Table */}
            <Card>
                {notes.length === 0 ? (
                    <EmptyState
                        icon={DocumentTextIcon}
                        title="No notes yet"
                        description="Jot down anything you want to keep handy — your agents can read these too."
                        action={
                            <button
                                type="button"
                                onClick={openAddForm}
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            >
                                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                                Add note
                            </button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={MagnifyingGlassIcon}
                        title="No matching notes"
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
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Body</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Pinned</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Updated</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((note) => {
                                    const busy = !!busyRows[note.id];
                                    return (
                                        <tr key={note.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            <td className="px-4 py-3 align-top font-medium text-pulse-text max-w-xs truncate">{displayTitle(note)}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft max-w-md truncate">{bodyPreview(note.body)}</td>
                                            <td className="px-4 py-3 align-top">
                                                {note.pinned ? (
                                                    <StarSolidIcon className="w-4 h-4 text-amber-500" aria-label="Pinned" />
                                                ) : (
                                                    <StarOutlineIcon className="w-4 h-4 text-pulse-faint" aria-label="Not pinned" />
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top text-pulse-soft whitespace-nowrap">{formatDate(note.updatedAt)}</td>
                                            <td className="px-4 py-3 align-top text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    {/*
                                                        Only on your own notes. Offering share on a
                                                        note someone shared with you would promise
                                                        something the server then refuses.
                                                    */}
                                                    {note.mine && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSharing(note)}
                                                            aria-label={`Share ${displayTitle(note)}`}
                                                            className={`p-1.5 rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                                                note.visibility === "private" ? "text-pulse-faint hover:text-indigo-500" : "text-pulse-accent"
                                                            }`}
                                                        >
                                                            <UserPlusIcon className="w-4 h-4" aria-hidden="true" />
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditForm(note)}
                                                        aria-label={`Edit ${displayTitle(note)}`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-indigo-500 hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                    >
                                                        <PencilIcon className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(note)}
                                                        disabled={busy}
                                                        aria-label={`Delete ${displayTitle(note)}`}
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

            {sharing && (
                <ShareDialog
                    resourceType="note"
                    resourceId={sharing.id}
                    label="this note"
                    visibility={sharing.visibility}
                    onClose={() => setSharing(null)}
                    onChanged={() => router.refresh()}
                />
            )}
        </div>
    );
}
