/**
 * Task / project tools — a hybrid work tracker. The agent is expected to create
 * a task for any substantial job it's given and keep its status current (todo →
 * doing → done), so the workspace owner has a live view of pending work. Users
 * also add their own tasks from the dashboard. A "project" is a task with
 * children (parentId).
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { tasks } from "../../../storage/schema.js";
import { and, eq, ne, desc, asc } from "drizzle-orm";
import { getTenantTimezone, parseZonedDate, formatInTz } from "../tz-util.js";

const STATUSES = new Set(["todo", "doing", "done", "blocked"]);
const PRIORITIES = new Set(["low", "normal", "high"]);
const STATUS_ICON: Record<string, string> = { todo: "○", doing: "◐", done: "●", blocked: "⊗" };

export const taskCreateTool: Tool = {
    name: "task_create",
    source: "builtin",
    description:
        "Open a task to track a job. Call this whenever you take on a substantial, multi-step, or delegated piece of work so the owner can see what's pending. Set status to 'doing' if you're starting immediately. A task with a parent id becomes a subtask of that project.",
    parameters: {
        type: "object",
        properties: {
            title: { type: "string", description: "Short title of the work." },
            description: { type: "string", description: "Optional detail / acceptance criteria." },
            status: { type: "string", enum: ["todo", "doing", "done", "blocked"], description: "Initial status (default todo)." },
            priority: { type: "string", enum: ["low", "normal", "high"], description: "Priority (default normal)." },
            due: { type: "string", description: "Optional due date/time (workspace timezone)." },
            parent: { type: "string", description: "Optional parent task id to make this a subtask." },
        },
        required: ["title"],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const title = String(args?.title ?? "").trim();
        if (!title) return { result: "A task needs a title." };
        const tz = await getTenantTimezone(tenantId);
        const status = STATUSES.has(String(args?.status)) ? String(args.status) : "todo";
        const priority = PRIORITIES.has(String(args?.priority)) ? String(args.priority) : "normal";
        const dueAt = args?.due ? parseZonedDate(args.due, tz) : null;
        const agentId = typeof args?._agentId === "string" ? args._agentId : null;
        const res = await db.insert(tasks).values({
            tenantId,
            title: title.slice(0, 300),
            description: args?.description ? String(args.description).slice(0, 4000) : null,
            status,
            priority,
            parentId: args?.parent ? String(args.parent) : null,
            agentId,
            source: "agent",
            conversationId: conversationId && /^[0-9a-f-]{36}$/i.test(conversationId) ? conversationId : null,
            dueAt,
            doneAt: status === "done" ? new Date() : null,
        }).returning({ id: tasks.id });
        return { result: `Task opened: "${title}" (${status})${dueAt ? `, due ${formatInTz(dueAt, tz)}` : ""} [id: ${res[0].id}]` };
    },
};

export const taskUpdateTool: Tool = {
    name: "task_update",
    source: "builtin",
    description: "Update a task's status or fields (by id). Use this to move work along: set status to 'doing' when you start and 'done' when finished.",
    parameters: {
        type: "object",
        properties: {
            id: { type: "string", description: "The task id." },
            status: { type: "string", enum: ["todo", "doing", "done", "blocked"], description: "New status." },
            title: { type: "string", description: "New title." },
            description: { type: "string", description: "New description." },
            priority: { type: "string", enum: ["low", "normal", "high"], description: "New priority." },
            due: { type: "string", description: "New due date/time (workspace timezone)." },
        },
        required: ["id"],
    },
    execute: async ({ tenantId, args }) => {
        const id = String(args?.id ?? "").trim();
        if (!id) return { result: "Provide the task id." };
        const tz = await getTenantTimezone(tenantId);
        const set: Record<string, any> = { updatedAt: new Date() };
        if (STATUSES.has(String(args?.status))) {
            set.status = String(args.status);
            set.doneAt = args.status === "done" ? new Date() : null;
        }
        if (typeof args?.title === "string" && args.title.trim()) set.title = args.title.slice(0, 300);
        if (typeof args?.description === "string") set.description = args.description.slice(0, 4000);
        if (PRIORITIES.has(String(args?.priority))) set.priority = String(args.priority);
        if (args?.due) set.dueAt = parseZonedDate(args.due, tz);
        const res = await db.update(tasks).set(set)
            .where(and(eq(tasks.tenantId, tenantId), eq(tasks.id, id))).returning({ id: tasks.id, title: tasks.title, status: tasks.status });
        if (!res[0]) return { result: `No task found with id ${id}.` };
        return { result: `Updated "${res[0].title}" → ${res[0].status}.` };
    },
};

export const taskListTool: Tool = {
    name: "task_list",
    source: "builtin",
    description: "List tasks / pending work. By default shows unfinished tasks (todo/doing/blocked); pass status to filter or include_done to see completed ones.",
    parameters: {
        type: "object",
        properties: {
            status: { type: "string", enum: ["todo", "doing", "done", "blocked"], description: "Only this status." },
            include_done: { type: "boolean", description: "Include completed tasks." },
        },
        required: [],
    },
    execute: async ({ tenantId, args }) => {
        const tz = await getTenantTimezone(tenantId);
        let where;
        if (STATUSES.has(String(args?.status))) where = and(eq(tasks.tenantId, tenantId), eq(tasks.status, String(args.status)));
        else if (args?.include_done === true) where = eq(tasks.tenantId, tenantId);
        else where = and(eq(tasks.tenantId, tenantId), ne(tasks.status, "done"));
        const rows = await db.select().from(tasks).where(where)
            .orderBy(asc(tasks.status), desc(tasks.priority), asc(tasks.dueAt), desc(tasks.createdAt)).limit(100);
        if (rows.length === 0) return { result: "No matching tasks. Nothing pending." };
        const lines = rows.map((r) => {
            const pr = r.priority && r.priority !== "normal" ? ` (${r.priority})` : "";
            const due = r.dueAt ? ` — due ${formatInTz(r.dueAt, tz, { dateOnly: true })}` : "";
            const who = r.source === "agent" ? " ·auto" : "";
            return `${STATUS_ICON[r.status ?? "todo"] ?? "○"} [${r.status}] ${r.title}${pr}${due}${who} [id: ${r.id}]`;
        });
        return { result: `Tasks (${rows.length}):\n${lines.join("\n")}` };
    },
};

export const taskCompleteTool: Tool = {
    name: "task_complete",
    source: "builtin",
    description: "Mark a task done (shortcut for task_update status=done).",
    parameters: { type: "object", properties: { id: { type: "string", description: "The task id." } }, required: ["id"] },
    execute: async ({ tenantId, args }) => {
        const id = String(args?.id ?? "").trim();
        if (!id) return { result: "Provide the task id." };
        const res = await db.update(tasks).set({ status: "done", doneAt: new Date(), updatedAt: new Date() })
            .where(and(eq(tasks.tenantId, tenantId), eq(tasks.id, id))).returning({ title: tasks.title });
        return { result: res[0] ? `Completed: "${res[0].title}".` : `No task found with id ${id}.` };
    },
};

export const taskDeleteTool: Tool = {
    name: "task_delete",
    source: "builtin",
    description: "Delete a task by its id.",
    parameters: { type: "object", properties: { id: { type: "string", description: "The task id." } }, required: ["id"] },
    execute: async ({ tenantId, args }) => {
        const id = String(args?.id ?? "").trim();
        if (!id) return { result: "Provide the task id." };
        const res = await db.delete(tasks).where(and(eq(tasks.tenantId, tenantId), eq(tasks.id, id))).returning({ id: tasks.id });
        return { result: res[0] ? `Task ${id} deleted.` : `No task found with id ${id}.` };
    },
};
