"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    KeyIcon,
    LockClosedIcon,
    MagnifyingGlassIcon,
    PencilIcon,
    PlusIcon,
    TrashIcon,
    XMarkIcon,
    EyeIcon,
    EyeSlashIcon,
    ClipboardIcon,
    CheckIcon,
} from "@heroicons/react/24/outline";
import { Card, EmptyState } from "../../../components/dashboard/ui";
import { deleteLoginAction, saveLoginAction, revealLoginPasswordAction, type LoginRow } from "./actions";

type AgentOption = { id: string; name: string };

type FormState = {
    id: string;
    label: string;
    site: string;
    username: string;
    password: string;
    agentId: string;
    notes: string;
};

const EMPTY_FORM: FormState = { id: "", label: "", site: "", username: "", password: "", agentId: "", notes: "" };

const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500";
const labelCls = "block text-xs font-medium text-pulse-muted mb-1.5";

export default function LoginsClient({
    logins,
    agents,
}: {
    logins: LoginRow[];
    agents: AgentOption[];
}) {
    const router = useRouter();
    const [, startTransition] = useTransition();

    const [search, setSearch] = useState("");
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});
    // Owner-revealed passwords (id → plaintext), shown inline until re-hidden.
    const [revealed, setRevealed] = useState<Record<string, string>>({});
    const [copiedId, setCopiedId] = useState<string | null>(null);

    async function handleReveal(login: LoginRow) {
        if (revealed[login.id]) {
            setRevealed((prev) => { const n = { ...prev }; delete n[login.id]; return n; });
            return;
        }
        const res = await revealLoginPasswordAction(login.id);
        if (!res.success || !res.password) {
            setMessage({ type: "error", text: res.message || "Couldn't reveal that password." });
            return;
        }
        setRevealed((prev) => ({ ...prev, [login.id]: res.password! }));
        try {
            await navigator.clipboard.writeText(res.password);
            setCopiedId(login.id);
            setTimeout(() => setCopiedId((c) => (c === login.id ? null : c)), 1500);
        } catch { /* clipboard blocked — the value is still shown to copy manually */ }
    }

    async function copyRevealed(login: LoginRow) {
        const pw = revealed[login.id];
        if (!pw) return;
        try {
            await navigator.clipboard.writeText(pw);
            setCopiedId(login.id);
            setTimeout(() => setCopiedId((c) => (c === login.id ? null : c)), 1500);
        } catch { /* ignore */ }
    }

    const agentName = (agentId: string | null) => {
        if (!agentId) return "All agents";
        return agents.find((a) => a.id === agentId)?.name ?? "All agents";
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return logins;
        return logins.filter((l) => {
            const haystack = `${l.label} ${l.site ?? ""} ${l.username}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [logins, search]);

    function openAddForm() {
        setForm(EMPTY_FORM);
        setFormError(null);
        setFormOpen(true);
    }

    function openEditForm(login: LoginRow) {
        setForm({
            id: login.id,
            label: login.label,
            site: login.site ?? "",
            username: login.username,
            password: "",
            agentId: login.agentId ?? "",
            notes: login.notes ?? "",
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
        if (!form.label.trim()) {
            setFormError("Label is required.");
            return;
        }
        if (!form.username.trim()) {
            setFormError("Username is required.");
            return;
        }
        if (!form.id && !form.password.trim()) {
            setFormError("Password is required.");
            return;
        }
        setFormSaving(true);
        setFormError(null);
        const fd = new FormData();
        fd.set("id", form.id);
        fd.set("label", form.label);
        fd.set("site", form.site);
        fd.set("username", form.username);
        fd.set("password", form.password);
        fd.set("agentId", form.agentId);
        fd.set("notes", form.notes);
        startTransition(async () => {
            const res = await saveLoginAction(fd);
            setFormSaving(false);
            if (res.success) {
                setFormOpen(false);
                setMessage({ type: "success", text: res.message || "Login saved." });
                router.refresh();
            } else {
                setFormError(res.message || "Failed to save login.");
            }
        });
    }

    function handleDelete(login: LoginRow) {
        if (!confirm(`Delete login "${login.label}"? This cannot be undone.`)) return;
        setBusyRows((prev) => ({ ...prev, [login.id]: true }));
        startTransition(async () => {
            const res = await deleteLoginAction(login.id);
            setBusyRows((prev) => ({ ...prev, [login.id]: false }));
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

            <p className="flex items-center gap-1.5 text-xs text-pulse-muted mb-4">
                <LockClosedIcon className="w-3.5 h-3.5 flex-shrink-0 text-pulse-faint" aria-hidden="true" />
                Passwords are encrypted (AES-256-GCM). The assistant never sees them — but you can reveal your own to copy (👁 in the Password column).
            </p>

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
                        placeholder="Search logins…"
                        aria-label="Search logins by label, site, or username"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>
                <button
                    type="button"
                    onClick={openAddForm}
                    className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap sm:ml-auto"
                >
                    <PlusIcon className="w-4 h-4" aria-hidden="true" />
                    Add login
                </button>
            </div>

            {/* Add/edit form */}
            {formOpen && (
                <Card className="mb-4">
                    <form onSubmit={handleFormSubmit}>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-pulse-border-subtle">
                            <h2 className="text-sm font-semibold text-pulse-text">{form.id ? "Edit login" : "Add login"}</h2>
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
                                <label htmlFor="login-label" className={labelCls}>
                                    Label <span className="text-pulse-faint">(required)</span>
                                </label>
                                <input
                                    id="login-label"
                                    type="text"
                                    required
                                    placeholder="e.g. Company CRM"
                                    value={form.label}
                                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="login-site" className={labelCls}>Site</label>
                                <input
                                    id="login-site"
                                    type="text"
                                    placeholder="https://example.com"
                                    value={form.site}
                                    onChange={(e) => setForm((f) => ({ ...f, site: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="login-username" className={labelCls}>
                                    Username <span className="text-pulse-faint">(required)</span>
                                </label>
                                <input
                                    id="login-username"
                                    type="text"
                                    required
                                    value={form.username}
                                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="login-password" className={labelCls}>
                                    Password {!form.id && <span className="text-pulse-faint">(required)</span>}
                                </label>
                                <input
                                    id="login-password"
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder={form.id ? "Leave empty to keep current" : ""}
                                    value={form.password}
                                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="login-agent" className={labelCls}>Agent scope</label>
                                <select
                                    id="login-agent"
                                    value={form.agentId}
                                    onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
                                    className={inputCls}
                                >
                                    <option value="">All agents</option>
                                    {agents.map((a) => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="login-notes" className={labelCls}>Notes</label>
                                <textarea
                                    id="login-notes"
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
                                {formSaving ? "Saving…" : form.id ? "Save changes" : "Add login"}
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Table */}
            <Card>
                {logins.length === 0 ? (
                    <EmptyState
                        icon={LockClosedIcon}
                        title="No saved logins yet"
                        description="Add a login so your agents can sign in on your behalf, without ever seeing the password."
                        action={
                            <button
                                type="button"
                                onClick={openAddForm}
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            >
                                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                                Add login
                            </button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={MagnifyingGlassIcon}
                        title="No matching logins"
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
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Label</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Site</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Username</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Password</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Scope</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((login) => {
                                    const busy = !!busyRows[login.id];
                                    return (
                                        <tr key={login.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            <td className="px-4 py-3 align-top font-medium text-pulse-text">{login.label}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft">{login.site || <span className="text-pulse-faint">—</span>}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft">{login.username}</td>
                                            <td className="px-4 py-3 align-top">
                                                {revealed[login.id] ? (
                                                    <span className="inline-flex items-center gap-2">
                                                        <code className="font-mono text-[13px] text-pulse-text break-all">{revealed[login.id]}</code>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyRevealed(login)}
                                                            aria-label="Copy password"
                                                            title="Copy"
                                                            className="p-1 rounded text-pulse-faint hover:text-indigo-500 hover:bg-pulse-hover transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                        >
                                                            {copiedId === login.id ? <CheckIcon className="w-3.5 h-3.5 text-emerald-500" /> : <ClipboardIcon className="w-3.5 h-3.5" />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleReveal(login)}
                                                            aria-label="Hide password"
                                                            title="Hide"
                                                            className="p-1 rounded text-pulse-faint hover:text-pulse-text hover:bg-pulse-hover transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                        >
                                                            <EyeSlashIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 text-pulse-faint">
                                                        <KeyIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                                                        •••••••• saved
                                                        <button
                                                            type="button"
                                                            onClick={() => handleReveal(login)}
                                                            aria-label={`Reveal and copy password for ${login.label}`}
                                                            title="Reveal & copy"
                                                            className="p-1 rounded text-pulse-faint hover:text-indigo-500 hover:bg-pulse-hover transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                        >
                                                            <EyeIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top text-pulse-soft">{agentName(login.agentId)}</td>
                                            <td className="px-4 py-3 align-top text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditForm(login)}
                                                        aria-label={`Edit ${login.label}`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-indigo-500 hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                    >
                                                        <PencilIcon className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(login)}
                                                        disabled={busy}
                                                        aria-label={`Delete ${login.label}`}
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
