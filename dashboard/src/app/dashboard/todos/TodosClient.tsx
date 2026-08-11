"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    CheckCircleIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    TrashIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";
import { Card, EmptyState } from "../../../components/dashboard/ui";
import { deleteTodoAction, saveTodoAction, toggleTodoAction, type TodoPriority, type TodoRow } from "./actions";

type FormState = {
    text: string;
    due: string;
    priority: TodoPriority;
};

const EMPTY_FORM: FormState = { text: "", due: "", priority: "normal" };

const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500";
const labelCls = "block text-xs font-medium text-pulse-muted mb-1.5";

const PRIORITY_BADGE: Record<TodoPriority, string> = {
    low: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    normal: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    high: "bg-red-500/10 text-red-400 border-red-500/30",
};

function formatDateTime(value: Date | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function TodosClient({ todos }: { todos: TodoRow[] }) {
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
        if (!q) return todos;
        return todos.filter((t) => t.text.toLowerCase().includes(q));
    }, [todos, search]);

    function openAddForm() {
        setForm(EMPTY_FORM);
        setFormError(null);
        setFormOpen(true);
    }

    function closeForm() {
        setFormOpen(false);
        setFormError(null);
    }

    function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!form.text.trim()) {
            setFormError("Task text is required.");
            return;
        }
        setFormSaving(true);
        setFormError(null);
        const fd = new FormData();
        fd.set("text", form.text);
        fd.set("due", form.due);
        fd.set("priority", form.priority);
        startTransition(async () => {
            const res = await saveTodoAction(fd);
            setFormSaving(false);
            if (res.success) {
                setFormOpen(false);
                setMessage({ type: "success", text: res.message || "To-do added." });
                router.refresh();
            } else {
                setFormError(res.message || "Failed to save to-do.");
            }
        });
    }

    function handleToggle(todo: TodoRow) {
        setBusyRows((prev) => ({ ...prev, [todo.id]: true }));
        startTransition(async () => {
            const res = await toggleTodoAction(todo.id, !todo.done);
            setBusyRows((prev) => ({ ...prev, [todo.id]: false }));
            if (!res.success) setMessage({ type: "error", text: res.message || "" });
            router.refresh();
        });
    }

    function handleDelete(todo: TodoRow) {
        if (!confirm(`Delete to-do "${todo.text}"? This cannot be undone.`)) return;
        setBusyRows((prev) => ({ ...prev, [todo.id]: true }));
        startTransition(async () => {
            const res = await deleteTodoAction(todo.id);
            setBusyRows((prev) => ({ ...prev, [todo.id]: false }));
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
                        placeholder="Search to-dos…"
                        aria-label="Search to-dos by task text"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>
                <button
                    type="button"
                    onClick={openAddForm}
                    className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap sm:ml-auto"
                >
                    <PlusIcon className="w-4 h-4" aria-hidden="true" />
                    Add to-do
                </button>
            </div>

            {/* Add form */}
            {formOpen && (
                <Card className="mb-4">
                    <form onSubmit={handleFormSubmit}>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-pulse-border-subtle">
                            <h2 className="text-sm font-semibold text-pulse-text">Add to-do</h2>
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
                                <label htmlFor="todo-text" className={labelCls}>
                                    Task <span className="text-pulse-faint">(required)</span>
                                </label>
                                <input
                                    id="todo-text"
                                    type="text"
                                    required
                                    placeholder="e.g. Follow up with the client"
                                    value={form.text}
                                    onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="todo-due" className={labelCls}>Due</label>
                                <input
                                    id="todo-due"
                                    type="datetime-local"
                                    value={form.due}
                                    onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="todo-priority" className={labelCls}>Priority</label>
                                <select
                                    id="todo-priority"
                                    value={form.priority}
                                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TodoPriority }))}
                                    className={inputCls}
                                >
                                    <option value="low">Low</option>
                                    <option value="normal">Normal</option>
                                    <option value="high">High</option>
                                </select>
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
                                {formSaving ? "Saving…" : "Add to-do"}
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Table */}
            <Card>
                {todos.length === 0 ? (
                    <EmptyState
                        icon={CheckCircleIcon}
                        title="No to-dos yet"
                        description="Add a task to keep track of what needs doing."
                        action={
                            <button
                                type="button"
                                onClick={openAddForm}
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            >
                                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                                Add to-do
                            </button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={MagnifyingGlassIcon}
                        title="No matching to-dos"
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
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Done</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Task</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Priority</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Due</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Created</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((todo) => {
                                    const busy = !!busyRows[todo.id];
                                    return (
                                        <tr key={todo.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            <td className="px-4 py-3 align-top">
                                                <input
                                                    type="checkbox"
                                                    checked={todo.done}
                                                    disabled={busy}
                                                    onChange={() => handleToggle(todo)}
                                                    aria-label={todo.done ? `Mark "${todo.text}" open` : `Mark "${todo.text}" done`}
                                                    className="w-4 h-4 rounded border-pulse-border text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                />
                                            </td>
                                            <td className={`px-4 py-3 align-top font-medium ${todo.done ? "text-pulse-faint line-through" : "text-pulse-text"}`}>
                                                {todo.text}
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <span className={`inline-flex items-center text-xs font-medium rounded-full border px-2 py-0.5 capitalize ${PRIORITY_BADGE[todo.priority]}`}>
                                                    {todo.priority}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 align-top text-pulse-soft whitespace-nowrap">{formatDateTime(todo.dueAt)}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft whitespace-nowrap">{formatDateTime(todo.createdAt)}</td>
                                            <td className="px-4 py-3 align-top text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(todo)}
                                                        disabled={busy}
                                                        aria-label={`Delete ${todo.text}`}
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
