"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    MagnifyingGlassIcon,
    PencilIcon,
    PlusIcon,
    RectangleStackIcon,
    TrashIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";
import { Card, EmptyState, Toggle } from "../../../components/dashboard/ui";
import {
    deleteTaskAction,
    saveTaskAction,
    setTaskStatusAction,
    type TaskPriority,
    type TaskRow,
    type TaskStatus,
} from "./actions";

type FormState = {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    due: string;
};

const EMPTY_FORM: FormState = { id: "", title: "", description: "", status: "todo", priority: "normal", due: "" };

const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500";
const labelCls = "block text-xs font-medium text-pulse-muted mb-1.5";

const STATUS_LABEL: Record<TaskStatus, string> = {
    todo: "To do",
    doing: "Doing",
    done: "Done",
    blocked: "Blocked",
};

const STATUS_BADGE: Record<TaskStatus, string> = {
    todo: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    doing: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    blocked: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
    low: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    normal: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    high: "bg-red-500/10 text-red-400 border-red-500/30",
};

function formatDate(value: Date | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** ISO datetime -> yyyy-mm-dd for a `type="date"` input's value. */
function toDateInputValue(value: Date | null): string {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
}

export default function WorkClient({ tasks }: { tasks: TaskRow[] }) {
    const router = useRouter();
    const [, startTransition] = useTransition();

    const [search, setSearch] = useState("");
    const [showCompleted, setShowCompleted] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});

    const visible = useMemo(
        () => (showCompleted ? tasks : tasks.filter((t) => t.status !== "done")),
        [tasks, showCompleted]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return visible;
        return visible.filter((t) => {
            const haystack = `${t.title} ${t.description ?? ""}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [visible, search]);

    function openAddForm() {
        setForm(EMPTY_FORM);
        setFormError(null);
        setFormOpen(true);
    }

    function openEditForm(task: TaskRow) {
        setForm({
            id: task.id,
            title: task.title,
            description: task.description ?? "",
            status: task.status,
            priority: task.priority,
            due: toDateInputValue(task.dueAt),
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
        if (!form.title.trim()) {
            setFormError("Title is required.");
            return;
        }
        setFormSaving(true);
        setFormError(null);
        const fd = new FormData();
        fd.set("id", form.id);
        fd.set("title", form.title);
        fd.set("description", form.description);
        fd.set("status", form.status);
        fd.set("priority", form.priority);
        fd.set("due", form.due);
        startTransition(async () => {
            const res = await saveTaskAction(fd);
            setFormSaving(false);
            if (res.success) {
                setFormOpen(false);
                setMessage({ type: "success", text: res.message || "Task saved." });
                router.refresh();
            } else {
                setFormError(res.message || "Failed to save task.");
            }
        });
    }

    function handleStatusChange(task: TaskRow, status: TaskStatus) {
        setBusyRows((prev) => ({ ...prev, [task.id]: true }));
        startTransition(async () => {
            const res = await setTaskStatusAction(task.id, status);
            setBusyRows((prev) => ({ ...prev, [task.id]: false }));
            if (!res.success) setMessage({ type: "error", text: res.message || "" });
            router.refresh();
        });
    }

    function handleDelete(task: TaskRow) {
        if (!confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;
        setBusyRows((prev) => ({ ...prev, [task.id]: true }));
        startTransition(async () => {
            const res = await deleteTaskAction(task.id);
            setBusyRows((prev) => ({ ...prev, [task.id]: false }));
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
                        placeholder="Search tasks…"
                        aria-label="Search tasks by title or description"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-pulse-muted whitespace-nowrap cursor-pointer">
                    <Toggle checked={showCompleted} onChange={setShowCompleted} label="Show completed tasks" />
                    Show completed
                </label>
                <button
                    type="button"
                    onClick={openAddForm}
                    className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap sm:ml-auto"
                >
                    <PlusIcon className="w-4 h-4" aria-hidden="true" />
                    Add task
                </button>
            </div>

            {/* Add/edit form */}
            {formOpen && (
                <Card className="mb-4">
                    <form onSubmit={handleFormSubmit}>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-pulse-border-subtle">
                            <h2 className="text-sm font-semibold text-pulse-text">{form.id ? "Edit task" : "Add task"}</h2>
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
                                <label htmlFor="task-title" className={labelCls}>
                                    Title <span className="text-pulse-faint">(required)</span>
                                </label>
                                <input
                                    id="task-title"
                                    type="text"
                                    required
                                    placeholder="e.g. Draft Q3 report"
                                    value={form.title}
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="task-description" className={labelCls}>Description</label>
                                <textarea
                                    id="task-description"
                                    rows={3}
                                    value={form.description}
                                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                    className={`${inputCls} resize-none`}
                                />
                            </div>
                            <div>
                                <label htmlFor="task-status" className={labelCls}>Status</label>
                                <select
                                    id="task-status"
                                    value={form.status}
                                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TaskStatus }))}
                                    className={inputCls}
                                >
                                    <option value="todo">To do</option>
                                    <option value="doing">Doing</option>
                                    <option value="done">Done</option>
                                    <option value="blocked">Blocked</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="task-priority" className={labelCls}>Priority</label>
                                <select
                                    id="task-priority"
                                    value={form.priority}
                                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                                    className={inputCls}
                                >
                                    <option value="low">Low</option>
                                    <option value="normal">Normal</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="task-due" className={labelCls}>Due</label>
                                <input
                                    id="task-due"
                                    type="date"
                                    value={form.due}
                                    onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))}
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
                                {formSaving ? "Saving…" : form.id ? "Save changes" : "Add task"}
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Table */}
            <Card>
                {tasks.length === 0 ? (
                    <EmptyState
                        icon={RectangleStackIcon}
                        title="No tasks yet"
                        description="Add a task to start tracking work — your agents can log tasks too."
                        action={
                            <button
                                type="button"
                                onClick={openAddForm}
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            >
                                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                                Add task
                            </button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={MagnifyingGlassIcon}
                        title="No matching tasks"
                        description={showCompleted ? "Try a different search term." : "Try a different search term, or show completed tasks."}
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
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Title</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Priority</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Source</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Due</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Created</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((task) => {
                                    const busy = !!busyRows[task.id];
                                    return (
                                        <tr key={task.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            <td className="px-4 py-3 align-top">
                                                <select
                                                    value={task.status}
                                                    disabled={busy}
                                                    onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                                                    aria-label={`Status for ${task.title}`}
                                                    className={`text-xs font-medium rounded-full border pl-2.5 pr-1.5 py-0.5 capitalize outline-none cursor-pointer transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${STATUS_BADGE[task.status]}`}
                                                >
                                                    {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                                                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className={`px-4 py-3 align-top font-medium max-w-sm ${task.status === "done" ? "text-pulse-faint line-through" : "text-pulse-text"}`}>
                                                <div className="truncate">{task.title}</div>
                                                {task.description && (
                                                    <div className="text-xs text-pulse-muted truncate mt-0.5">{task.description}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <span className={`inline-flex items-center text-xs font-medium rounded-full border px-2 py-0.5 capitalize ${PRIORITY_BADGE[task.priority]}`}>
                                                    {task.priority}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                {task.source === "agent" ? (
                                                    <span className="inline-flex items-center text-xs font-medium rounded-full border px-2 py-0.5 bg-pulse-tint/60 text-pulse-accent-hi border-pulse-border">
                                                        auto
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-pulse-muted">you</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top text-pulse-soft whitespace-nowrap">{formatDate(task.dueAt)}</td>
                                            <td className="px-4 py-3 align-top text-pulse-soft whitespace-nowrap">{formatDate(task.createdAt)}</td>
                                            <td className="px-4 py-3 align-top text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditForm(task)}
                                                        aria-label={`Edit ${task.title}`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-indigo-500 hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                    >
                                                        <PencilIcon className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(task)}
                                                        disabled={busy}
                                                        aria-label={`Delete ${task.title}`}
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
