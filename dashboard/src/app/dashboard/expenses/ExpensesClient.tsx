"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowDownTrayIcon,
    BanknotesIcon,
    MagnifyingGlassIcon,
    PaperClipIcon,
    PencilIcon,
    PlusIcon,
    TrashIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";
import { Card, EmptyState } from "../../../components/dashboard/ui";
import { attachReceiptAction, deleteExpenseAction, saveExpenseAction, type ExpenseRow } from "./actions";
import { fileToBase64 } from "../documents/DocumentsClient";

type FormState = {
    id: string;
    amount: string;
    currency: string;
    vendor: string;
    category: string;
    description: string;
    date: string;
};

const EMPTY_FORM: FormState = { id: "", amount: "", currency: "", vendor: "", category: "", description: "", date: "" };

const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500";
const labelCls = "block text-xs font-medium text-pulse-muted mb-1.5";

function formatDate(value: Date | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatAmount(amount: string, currency: string | null): string {
    const num = Number(amount);
    const formatted = Number.isFinite(num) ? num.toFixed(2) : amount;
    return currency ? `${currency} ${formatted}` : formatted;
}

/** ISO datetime -> yyyy-mm-dd for a `type="date"` input's value. */
function toDateInputValue(value: Date | null): string {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
}

export default function ExpensesClient({ expenses }: { expenses: ExpenseRow[] }) {
    const router = useRouter();
    const [, startTransition] = useTransition();

    const [search, setSearch] = useState("");
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});

    const receiptInputRef = useRef<HTMLInputElement>(null);
    const [receiptTargetId, setReceiptTargetId] = useState<string | null>(null);
    const [receiptBusyRows, setReceiptBusyRows] = useState<Record<string, boolean>>({});

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return expenses;
        return expenses.filter((e) => {
            const haystack = `${e.vendor ?? ""} ${e.category ?? ""} ${e.description ?? ""} ${e.currency ?? ""}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [expenses, search]);

    const total = useMemo(() => filtered.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), [filtered]);

    function openAddForm() {
        setForm(EMPTY_FORM);
        setFormError(null);
        setFormOpen(true);
    }

    function openEditForm(expense: ExpenseRow) {
        setForm({
            id: expense.id,
            amount: expense.amount,
            currency: expense.currency ?? "",
            vendor: expense.vendor ?? "",
            category: expense.category ?? "",
            description: expense.description ?? "",
            date: toDateInputValue(expense.spentAt),
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
        if (!form.amount.trim() || Number.isNaN(Number(form.amount))) {
            setFormError("A valid amount is required.");
            return;
        }
        setFormSaving(true);
        setFormError(null);
        const fd = new FormData();
        fd.set("id", form.id);
        fd.set("amount", form.amount);
        fd.set("currency", form.currency);
        fd.set("vendor", form.vendor);
        fd.set("category", form.category);
        fd.set("description", form.description);
        fd.set("date", form.date);
        startTransition(async () => {
            const res = await saveExpenseAction(fd);
            setFormSaving(false);
            if (res.success) {
                setFormOpen(false);
                setMessage({ type: "success", text: res.message || "Expense saved." });
                router.refresh();
            } else {
                setFormError(res.message || "Failed to save expense.");
            }
        });
    }

    function handleDelete(expense: ExpenseRow) {
        const label = expense.vendor || formatAmount(expense.amount, expense.currency);
        if (!confirm(`Delete expense "${label}"? This cannot be undone.`)) return;
        setBusyRows((prev) => ({ ...prev, [expense.id]: true }));
        startTransition(async () => {
            const res = await deleteExpenseAction(expense.id);
            setBusyRows((prev) => ({ ...prev, [expense.id]: false }));
            setMessage({ type: res.success ? "success" : "error", text: res.message || "" });
            if (res.success) router.refresh();
        });
    }

    function openReceiptPicker(expenseId: string) {
        setReceiptTargetId(expenseId);
        receiptInputRef.current?.click();
    }

    function handleReceiptFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        const expenseId = receiptTargetId;
        e.target.value = "";
        if (!file || !expenseId) return;
        if (file.size > 10 * 1024 * 1024) {
            setMessage({ type: "error", text: "File is too large. The limit is 10 MB." });
            return;
        }
        setReceiptBusyRows((prev) => ({ ...prev, [expenseId]: true }));
        // Send as base64 string field — multipart File parts fail through the proxy.
        startTransition(async () => {
            let dataBase64: string;
            try {
                dataBase64 = await fileToBase64(file);
            } catch {
                setReceiptBusyRows((prev) => ({ ...prev, [expenseId]: false }));
                setMessage({ type: "error", text: "Could not read the file." });
                return;
            }
            const fd = new FormData();
            fd.set("dataBase64", dataBase64);
            fd.set("filename", file.name || "receipt");
            fd.set("mimeType", file.type || "application/octet-stream");
            const res = await attachReceiptAction(expenseId, fd);
            setReceiptBusyRows((prev) => ({ ...prev, [expenseId]: false }));
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

            {/* Hidden input backing the per-row "Attach receipt" control */}
            <input
                ref={receiptInputRef}
                type="file"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                onChange={handleReceiptFileChange}
            />

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
                        placeholder="Search expenses…"
                        aria-label="Search expenses by vendor, category, or description"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>
                <p className="text-sm text-pulse-muted whitespace-nowrap">
                    Total: <span className="font-semibold text-pulse-text tabular-nums">{total.toFixed(2)}</span>
                </p>
                <button
                    type="button"
                    onClick={openAddForm}
                    className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap sm:ml-auto"
                >
                    <PlusIcon className="w-4 h-4" aria-hidden="true" />
                    Add expense
                </button>
            </div>

            {/* Add/edit form */}
            {formOpen && (
                <Card className="mb-4">
                    <form onSubmit={handleFormSubmit}>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-pulse-border-subtle">
                            <h2 className="text-sm font-semibold text-pulse-text">{form.id ? "Edit expense" : "Add expense"}</h2>
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
                                <label htmlFor="expense-amount" className={labelCls}>
                                    Amount <span className="text-pulse-faint">(required)</span>
                                </label>
                                <input
                                    id="expense-amount"
                                    type="number"
                                    step="0.01"
                                    required
                                    placeholder="0.00"
                                    value={form.amount}
                                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="expense-currency" className={labelCls}>Currency</label>
                                <input
                                    id="expense-currency"
                                    type="text"
                                    placeholder="e.g. USD"
                                    maxLength={8}
                                    value={form.currency}
                                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="expense-vendor" className={labelCls}>Vendor</label>
                                <input
                                    id="expense-vendor"
                                    type="text"
                                    placeholder="e.g. AWS"
                                    value={form.vendor}
                                    onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="expense-category" className={labelCls}>Category</label>
                                <input
                                    id="expense-category"
                                    type="text"
                                    placeholder="e.g. Software"
                                    value={form.category}
                                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="expense-date" className={labelCls}>Date</label>
                                <input
                                    id="expense-date"
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="expense-description" className={labelCls}>Description</label>
                                <textarea
                                    id="expense-description"
                                    rows={3}
                                    value={form.description}
                                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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
                                {formSaving ? "Saving…" : form.id ? "Save changes" : "Add expense"}
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Table */}
            <Card>
                {expenses.length === 0 ? (
                    <EmptyState
                        icon={BanknotesIcon}
                        title="No expenses yet"
                        description="Log spend as it happens — your agents can log expenses too."
                        action={
                            <button
                                type="button"
                                onClick={openAddForm}
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            >
                                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                                Add expense
                            </button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={MagnifyingGlassIcon}
                        title="No matching expenses"
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
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Date</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Vendor</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Category</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Description</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Receipt</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((expense) => {
                                    const busy = !!busyRows[expense.id];
                                    const label = expense.vendor || formatAmount(expense.amount, expense.currency);
                                    return (
                                        <tr key={expense.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            <td className="px-4 py-3 align-top text-pulse-soft whitespace-nowrap">{formatDate(expense.spentAt)}</td>
                                            <td className="px-4 py-3 align-top text-right font-medium text-pulse-text tabular-nums whitespace-nowrap">
                                                {formatAmount(expense.amount, expense.currency)}
                                            </td>
                                            <td className="px-4 py-3 align-top text-pulse-text">{expense.vendor || "—"}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft">{expense.category || "—"}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft max-w-md truncate">{expense.description || "—"}</td>
                                            <td className="px-4 py-3 align-top whitespace-nowrap">
                                                {expense.receiptDocumentId ? (
                                                    <a
                                                        href={`/dashboard/documents/${expense.receiptDocumentId}/download`}
                                                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-400 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
                                                    >
                                                        <ArrowDownTrayIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                                        Receipt
                                                    </a>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => openReceiptPicker(expense.id)}
                                                        disabled={!!receiptBusyRows[expense.id]}
                                                        className="inline-flex items-center gap-1 text-xs font-medium text-pulse-muted hover:text-indigo-500 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <PaperClipIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                                        {receiptBusyRows[expense.id] ? "Uploading…" : "Attach receipt"}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditForm(expense)}
                                                        aria-label={`Edit ${label}`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-indigo-500 hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                    >
                                                        <PencilIcon className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(expense)}
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
