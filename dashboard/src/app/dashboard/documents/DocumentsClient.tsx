"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    FolderOpenIcon,
    MagnifyingGlassIcon,
    TrashIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";
import { Card, EmptyState } from "../../../components/dashboard/ui";
import { deleteDocumentAction, uploadDocumentAction, type DocumentRow } from "./actions";

const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500";
const labelCls = "block text-xs font-medium text-pulse-muted mb-1.5";

const SOURCE_BADGE: Record<string, string> = {
    upload: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    receipt: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    generated: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

function sourceBadgeCls(source: string | null): string {
    return SOURCE_BADGE[source || "upload"] || "bg-pulse-panel-alt text-pulse-muted border-pulse-border-subtle";
}

function displayTitle(doc: DocumentRow): string {
    return (doc.title && doc.title.trim()) || doc.filename;
}

/** Read a File to base64 via arrayBuffer (chunked, so large files don't blow the call stack). */
export async function fileToBase64(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function formatFileSize(bytes: number | null): string {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: Date | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function DocumentsClient({ documents }: { documents: DocumentRow[] }) {
    const router = useRouter();
    const [, startTransition] = useTransition();

    const [search, setSearch] = useState("");
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [tags, setTags] = useState("");
    const [fileName, setFileName] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return documents;
        return documents.filter((d) => {
            const haystack = `${d.title ?? ""} ${d.filename} ${d.tags ?? ""} ${d.mimeType ?? ""}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [documents, search]);

    function openUploadForm() {
        setTitle("");
        setTags("");
        setFileName("");
        setFormError(null);
        setFormOpen(true);
    }

    function closeForm() {
        setFormOpen(false);
        setFormError(null);
    }

    function handleUpload(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
            setFormError("Please choose a file to upload.");
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setFormError("File is too large. The limit is 10 MB.");
            return;
        }
        setFormSaving(true);
        setFormError(null);
        // Send the file as a base64 string field — multipart File parts fail
        // through the reverse proxy for server actions.
        startTransition(async () => {
            let dataBase64: string;
            try {
                dataBase64 = await fileToBase64(file);
            } catch {
                setFormSaving(false);
                setFormError("Could not read the file.");
                return;
            }
            const fd = new FormData();
            fd.set("dataBase64", dataBase64);
            fd.set("filename", file.name || "untitled");
            fd.set("mimeType", file.type || "application/octet-stream");
            fd.set("title", title);
            fd.set("tags", tags);
            const res = await uploadDocumentAction(fd);
            setFormSaving(false);
            if (res.success) {
                setFormOpen(false);
                setMessage({ type: "success", text: res.message || "Document uploaded." });
                router.refresh();
            } else {
                setFormError(res.message || "Failed to upload document.");
            }
        });
    }

    function handleDelete(doc: DocumentRow) {
        if (!confirm(`Delete "${displayTitle(doc)}"? This cannot be undone.`)) return;
        setBusyRows((prev) => ({ ...prev, [doc.id]: true }));
        startTransition(async () => {
            const res = await deleteDocumentAction(doc.id);
            setBusyRows((prev) => ({ ...prev, [doc.id]: false }));
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
                        placeholder="Search documents…"
                        aria-label="Search documents by title, filename, tags, or type"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>
                <button
                    type="button"
                    onClick={openUploadForm}
                    className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap sm:ml-auto"
                >
                    <ArrowUpTrayIcon className="w-4 h-4" aria-hidden="true" />
                    Upload document
                </button>
            </div>

            {/* Upload form */}
            {formOpen && (
                <Card className="mb-4">
                    <form onSubmit={handleUpload}>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-pulse-border-subtle">
                            <h2 className="text-sm font-semibold text-pulse-text">Upload document</h2>
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
                                <label htmlFor="doc-file" className={labelCls}>
                                    File <span className="text-pulse-faint">(required, max 10 MB)</span>
                                </label>
                                <input
                                    id="doc-file"
                                    ref={fileInputRef}
                                    type="file"
                                    required
                                    onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
                                    className="block w-full text-sm text-pulse-text file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-pulse-panel-alt file:text-pulse-text hover:file:bg-pulse-hover file:cursor-pointer cursor-pointer"
                                />
                                {fileName && <p className="text-xs text-pulse-muted mt-1.5">Selected: {fileName}</p>}
                            </div>
                            <div>
                                <label htmlFor="doc-title" className={labelCls}>Title</label>
                                <input
                                    id="doc-title"
                                    type="text"
                                    placeholder="Optional display name"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="doc-tags" className={labelCls}>Tags</label>
                                <input
                                    id="doc-tags"
                                    type="text"
                                    placeholder="e.g. contract, 2026"
                                    value={tags}
                                    onChange={(e) => setTags(e.target.value)}
                                    className={inputCls}
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
                                {formSaving ? "Uploading…" : "Upload"}
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Table */}
            <Card>
                {documents.length === 0 ? (
                    <EmptyState
                        icon={FolderOpenIcon}
                        title="No documents yet"
                        description="Upload contracts, quotes, receipts, or anything else you want your agents to be able to find and read."
                        action={
                            <button
                                type="button"
                                onClick={openUploadForm}
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            >
                                <ArrowUpTrayIcon className="w-4 h-4" aria-hidden="true" />
                                Upload document
                            </button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={MagnifyingGlassIcon}
                        title="No matching documents"
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
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Title / Filename</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Type</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Size</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Source</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Uploaded</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((doc) => {
                                    const busy = !!busyRows[doc.id];
                                    const label = displayTitle(doc);
                                    return (
                                        <tr key={doc.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            <td className="px-4 py-3 align-top max-w-xs">
                                                <p className="font-medium text-pulse-text truncate">{label}</p>
                                                {doc.title && <p className="text-xs text-pulse-faint truncate">{doc.filename}</p>}
                                            </td>
                                            <td className="px-4 py-3 align-top text-pulse-soft whitespace-nowrap">{doc.mimeType || "—"}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft whitespace-nowrap tabular-nums">{formatFileSize(doc.sizeBytes)}</td>
                                            <td className="px-4 py-3 align-top">
                                                <span className={`inline-flex items-center text-[11px] font-medium uppercase tracking-wide rounded-full px-2 py-0.5 border ${sourceBadgeCls(doc.source)}`}>
                                                    {doc.source || "upload"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 align-top text-pulse-soft whitespace-nowrap">{formatDate(doc.createdAt)}</td>
                                            <td className="px-4 py-3 align-top text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <a
                                                        href={`/dashboard/documents/${doc.id}/download`}
                                                        aria-label={`Download ${label}`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-indigo-500 hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 inline-flex"
                                                    >
                                                        <ArrowDownTrayIcon className="w-4 h-4" aria-hidden="true" />
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(doc)}
                                                        disabled={busy}
                                                        aria-label={`Delete ${label}`}
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
