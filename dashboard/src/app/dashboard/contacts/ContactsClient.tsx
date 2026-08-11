"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    IdentificationIcon,
    MagnifyingGlassIcon,
    PencilIcon,
    PlusIcon,
    TrashIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";
import { Card, EmptyState, SettingHint } from "../../../components/dashboard/ui";
import { deleteContactAction, saveContactAction, saveContactsSourceAction, type ContactRow, type ContactsSource } from "./actions";

const SOURCE_OPTIONS: { value: ContactsSource; label: string }[] = [
    { value: "auto", label: "Auto" },
    { value: "native", label: "Native store" },
    { value: "erpnext", label: "ERPNext" },
];

type FormState = {
    id: string;
    name: string;
    email: string;
    phone: string;
    company: string;
    title: string;
    notes: string;
};

const EMPTY_FORM: FormState = { id: "", name: "", email: "", phone: "", company: "", title: "", notes: "" };

export default function ContactsClient({
    contacts,
    source,
}: {
    contacts: ContactRow[];
    source: ContactsSource;
}) {
    const router = useRouter();
    const [, startTransition] = useTransition();

    const [search, setSearch] = useState("");
    const [sourcePending, setSourcePending] = useState(false);
    const [currentSource, setCurrentSource] = useState<ContactsSource>(source);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return contacts;
        return contacts.filter((c) => {
            const haystack = `${c.name} ${c.email ?? ""} ${c.company ?? ""}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [contacts, search]);

    function handleSourceChange(next: ContactsSource) {
        if (next === currentSource) return;
        setCurrentSource(next);
        setSourcePending(true);
        startTransition(async () => {
            const res = await saveContactsSourceAction(next);
            setSourcePending(false);
            if (!res.success) {
                setCurrentSource(source);
                setMessage({ type: "error", text: res.message || "Failed to save contacts source." });
            } else {
                router.refresh();
            }
        });
    }

    function openAddForm() {
        setForm(EMPTY_FORM);
        setFormError(null);
        setFormOpen(true);
    }

    function openEditForm(contact: ContactRow) {
        setForm({
            id: contact.id,
            name: contact.name,
            email: contact.email ?? "",
            phone: contact.phone ?? "",
            company: contact.company ?? "",
            title: contact.title ?? "",
            notes: contact.notes ?? "",
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
        if (!form.name.trim()) {
            setFormError("Name is required.");
            return;
        }
        setFormSaving(true);
        setFormError(null);
        const fd = new FormData();
        fd.set("id", form.id);
        fd.set("name", form.name);
        fd.set("email", form.email);
        fd.set("phone", form.phone);
        fd.set("company", form.company);
        fd.set("title", form.title);
        fd.set("notes", form.notes);
        startTransition(async () => {
            const res = await saveContactAction(fd);
            setFormSaving(false);
            if (res.success) {
                setFormOpen(false);
                setMessage({ type: "success", text: res.message || "Contact saved." });
                router.refresh();
            } else {
                setFormError(res.message || "Failed to save contact.");
            }
        });
    }

    function handleDelete(contact: ContactRow) {
        if (!confirm(`Delete contact "${contact.name}"? This cannot be undone.`)) return;
        setBusyRows((prev) => ({ ...prev, [contact.id]: true }));
        startTransition(async () => {
            const res = await deleteContactAction(contact.id);
            setBusyRows((prev) => ({ ...prev, [contact.id]: false }));
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

            {/* Contacts source */}
            <Card className="mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-pulse-text">Contacts source</p>
                        <SettingHint>Auto uses ERPNext when it's connected, otherwise the built-in store.</SettingHint>
                    </div>
                    <div className="flex items-center gap-1.5" role="group" aria-label="Contacts source">
                        {SOURCE_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                disabled={sourcePending}
                                onClick={() => handleSourceChange(opt.value)}
                                aria-pressed={currentSource === opt.value}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                                    currentSource === opt.value
                                        ? "bg-indigo-600 border-indigo-600 text-white"
                                        : "bg-pulse-panel border-pulse-border text-pulse-muted hover:text-pulse-text hover:border-pulse-border-strong"
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </Card>

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
                        placeholder="Search contacts…"
                        aria-label="Search contacts by name, email, or company"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>
                <button
                    type="button"
                    onClick={openAddForm}
                    className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap sm:ml-auto"
                >
                    <PlusIcon className="w-4 h-4" aria-hidden="true" />
                    Add contact
                </button>
            </div>

            {/* Add/edit form */}
            {formOpen && (
                <Card className="mb-4">
                    <form onSubmit={handleFormSubmit}>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-pulse-border-subtle">
                            <h2 className="text-sm font-semibold text-pulse-text">{form.id ? "Edit contact" : "Add contact"}</h2>
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
                                <label htmlFor="contact-name" className="block text-xs font-medium text-pulse-muted mb-1.5">
                                    Name <span className="text-pulse-faint">(required)</span>
                                </label>
                                <input
                                    id="contact-name"
                                    type="text"
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label htmlFor="contact-email" className="block text-xs font-medium text-pulse-muted mb-1.5">Email</label>
                                <input
                                    id="contact-email"
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label htmlFor="contact-phone" className="block text-xs font-medium text-pulse-muted mb-1.5">Phone</label>
                                <input
                                    id="contact-phone"
                                    type="text"
                                    value={form.phone}
                                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label htmlFor="contact-company" className="block text-xs font-medium text-pulse-muted mb-1.5">Company</label>
                                <input
                                    id="contact-company"
                                    type="text"
                                    value={form.company}
                                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label htmlFor="contact-title" className="block text-xs font-medium text-pulse-muted mb-1.5">Title</label>
                                <input
                                    id="contact-title"
                                    type="text"
                                    value={form.title}
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="contact-notes" className="block text-xs font-medium text-pulse-muted mb-1.5">Notes</label>
                                <textarea
                                    id="contact-notes"
                                    rows={3}
                                    value={form.notes}
                                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none"
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
                                {formSaving ? "Saving…" : form.id ? "Save changes" : "Add contact"}
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Table */}
            <Card>
                {contacts.length === 0 ? (
                    <EmptyState
                        icon={IdentificationIcon}
                        title="No contacts yet"
                        description="Add a contact so your assistant can look people up by name."
                        action={
                            <button
                                type="button"
                                onClick={openAddForm}
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            >
                                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                                Add contact
                            </button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={MagnifyingGlassIcon}
                        title="No matching contacts"
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
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Name</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Email</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Phone</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Company</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Title</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((contact) => {
                                    const busy = !!busyRows[contact.id];
                                    return (
                                        <tr key={contact.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            <td className="px-4 py-3 align-top font-medium text-pulse-text">{contact.name}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft">{contact.email || <span className="text-pulse-faint">—</span>}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft">{contact.phone || <span className="text-pulse-faint">—</span>}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft">{contact.company || <span className="text-pulse-faint">—</span>}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft">{contact.title || <span className="text-pulse-faint">—</span>}</td>
                                            <td className="px-4 py-3 align-top text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditForm(contact)}
                                                        aria-label={`Edit ${contact.name}`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-indigo-500 hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                    >
                                                        <PencilIcon className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(contact)}
                                                        disabled={busy}
                                                        aria-label={`Delete ${contact.name}`}
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
