"use client";

import { useState, useTransition } from "react";
import {
    ArrowDownTrayIcon, CheckCircleIcon, ExclamationTriangleIcon,
    TrashIcon, PlusIcon, ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { PageHeader, Card, CardHeader } from "../../../components/dashboard/ui";
import { addPackAction, importPackAction, approvePackAction, revokePackAction, deletePackAction, type PackRow } from "./actions";

type Result = { success: boolean; message: string };

export default function AdminSkillsClient({ packs }: { packs: PackRow[] }) {
    const [pending, startTransition] = useTransition();
    const [notice, setNotice] = useState<Result | null>(null);
    const [adding, setAdding] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);

    function run(action: (fd: FormData) => Promise<Result>, fd: FormData) {
        setNotice(null);
        startTransition(async () => setNotice(await action(fd)));
    }
    const withPack = (action: (fd: FormData) => Promise<Result>, id: string) => () => {
        const fd = new FormData();
        fd.set("packId", id);
        run(action, fd);
    };

    return (
        <div className="mx-auto w-full max-w-[1060px] px-6 py-7 sm:px-10 sm:py-9">
            <PageHeader
                title="Agent Skills"
                description="Skill packs available to workspaces. A pack must be imported and approved before any workspace can use it."
            />

            {notice && (
                <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                    notice.success
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
                    {notice.message}
                </div>
            )}

            <Card>
                <CardHeader
                    title="Skill packs"
                    description="Importing pulls SKILL.md files from the repository. Approving pins the content it has right now."
                    action={
                        <button type="button" onClick={() => setAdding((v) => !v)}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-pulse-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-pulse-accent-hi">
                            <PlusIcon className="h-4 w-4" /> Add pack
                        </button>
                    }
                />

                {adding && (
                    <form
                        className="border-b border-pulse-border-subtle px-5 py-4"
                        action={(fd) => { run(addPackAction, fd); setAdding(false); }}
                    >
                        <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto_auto]">
                            <input name="name" required placeholder="Legal skills" aria-label="Pack name"
                                className="rounded-lg border border-pulse-border bg-pulse-panel px-3 py-2 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-pulse-accent/40" />
                            <input name="sourceUrl" required placeholder="https://github.com/owner/repo" aria-label="Repository URL"
                                className="rounded-lg border border-pulse-border bg-pulse-panel px-3 py-2 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-pulse-accent/40" />
                            <input name="sourceRef" defaultValue="main" aria-label="Branch"
                                className="w-28 rounded-lg border border-pulse-border bg-pulse-panel px-3 py-2 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-pulse-accent/40" />
                            <button type="submit" disabled={pending}
                                className="cursor-pointer rounded-lg bg-pulse-accent px-4 py-2 text-sm font-medium text-white hover:bg-pulse-accent-hi disabled:opacity-50">
                                Add
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-pulse-faint">GitHub and GitLab repositories. Adding does not import — you import next.</p>
                    </form>
                )}

                {packs.length === 0 ? (
                    <p className="px-5 py-12 text-center text-sm text-pulse-muted">
                        No skill packs yet. Add one to make skills available to workspaces.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-pulse-border-subtle text-xs text-pulse-muted">
                                <tr>
                                    <th scope="col" className="px-5 py-3 text-left font-medium">Pack</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Skills</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {packs.map((p) => (
                                    <PackRowView key={p.id} p={p} pending={pending}
                                        expanded={expanded === p.id}
                                        onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                                        onImport={withPack(importPackAction, p.id)}
                                        onApprove={withPack(approvePackAction, p.id)}
                                        onRevoke={withPack(revokePackAction, p.id)}
                                        onDelete={withPack(deletePackAction, p.id)} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}

function PackRowView({ p, pending, expanded, onToggle, onImport, onApprove, onRevoke, onDelete }: {
    p: PackRow; pending: boolean; expanded: boolean; onToggle: () => void;
    onImport: () => void; onApprove: () => void; onRevoke: () => void; onDelete: () => void;
}) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    return (
        <>
            <tr className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                <td className="px-5 py-3 align-top">
                    <div className="font-medium text-pulse-text">{p.name}</div>
                    <div className="truncate text-xs text-pulse-faint">
                        {p.sourceUrl}{p.sourceRef && p.sourceRef !== "main" ? ` @ ${p.sourceRef}` : ""}
                    </div>
                    {p.lastImportError && (
                        <div className="mt-1 text-xs text-red-400">Last import failed: {p.lastImportError}</div>
                    )}
                </td>
                <td className="px-4 py-3 align-top text-pulse-soft">
                    {p.skillCount}
                    {p.skippedCount > 0 && (
                        <button type="button" onClick={onToggle}
                            className="ml-2 cursor-pointer text-xs text-pulse-muted underline decoration-dotted hover:text-pulse-text">
                            {p.skippedCount} skipped
                        </button>
                    )}
                </td>
                <td className="px-4 py-3 align-top">
                    {/*
                        Drift is called out loudly and separately from "not approved".
                        A pack that WAS approved and has silently gone inert is the
                        state most likely to be mistaken for a bug.
                    */}
                    {p.driftedSinceApproval ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5" /> Content changed — re-approve
                        </span>
                    ) : p.approved ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                            <CheckCircleIcon className="h-3.5 w-3.5" /> Approved
                        </span>
                    ) : (
                        <span className="inline-flex items-center rounded-full border border-pulse-border bg-pulse-panel-alt px-2 py-0.5 text-xs text-pulse-muted">
                            {p.skillCount > 0 ? "Awaiting approval" : "Not imported"}
                        </span>
                    )}
                </td>
                <td className="px-4 py-3 text-right align-top">
                    <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={onImport} disabled={pending} title="Import from source"
                            className="cursor-pointer rounded-lg p-1.5 text-pulse-faint hover:bg-pulse-hover hover:text-pulse-text disabled:opacity-50">
                            <ArrowDownTrayIcon className="h-4 w-4" />
                        </button>
                        {p.approved && !p.driftedSinceApproval ? (
                            <button type="button" onClick={onRevoke} disabled={pending}
                                className="cursor-pointer rounded-lg px-2 py-1 text-xs text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text disabled:opacity-50">
                                Revoke
                            </button>
                        ) : (
                            <button type="button" onClick={onApprove} disabled={pending || p.skillCount === 0}
                                className="cursor-pointer rounded-lg bg-pulse-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-pulse-accent-hi disabled:opacity-40">
                                Approve
                            </button>
                        )}
                        {confirmDelete ? (
                            <>
                                <button type="button" onClick={() => setConfirmDelete(false)}
                                    className="cursor-pointer rounded-lg px-2 py-1 text-xs text-pulse-muted hover:text-pulse-text">Cancel</button>
                                <button type="button" onClick={onDelete} disabled={pending}
                                    className="cursor-pointer rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700">Delete</button>
                            </>
                        ) : (
                            <button type="button" onClick={() => setConfirmDelete(true)} title="Delete pack"
                                className="cursor-pointer rounded-lg p-1.5 text-pulse-faint hover:bg-red-500/10 hover:text-red-400">
                                <TrashIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </td>
            </tr>
            {expanded && p.skipped.length > 0 && (
                <tr className="border-b border-pulse-border-subtle bg-pulse-panel-alt">
                    <td colSpan={4} className="px-5 py-3">
                        {/* Skipped files are shown, not hidden — silently missing skills are worse. */}
                        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-pulse-text">
                            <ChevronDownIcon className="h-3.5 w-3.5" /> Files not imported
                        </div>
                        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-pulse-muted">
                            {p.skipped.map((s, i) => (
                                <li key={i}><span className="text-pulse-soft">{s.path}</span> — {s.reason}</li>
                            ))}
                        </ul>
                    </td>
                </tr>
            )}
        </>
    );
}
