/**
 * To-do tools — a lightweight task list the agent can manage.
 * Due dates are interpreted in the workspace timezone (see tz-util).
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { todos } from "../../../storage/schema.js";
import { and, eq, desc, asc } from "drizzle-orm";
import { getTenantTimezone, parseZonedDate, formatInTz } from "../tz-util.js";

const PRIORITIES = new Set(["low", "normal", "high"]);

export const todoAddTool: Tool = {
    name: "todo_add",
    source: "builtin",
    description: "Add a to-do item. Optionally set a due date (interpreted in the workspace timezone) and priority.",
    parameters: {
        type: "object",
        properties: {
            text: { type: "string", description: "What needs doing." },
            due: { type: "string", description: "Optional due date/time, e.g. '2026-08-20 15:00' or 'tomorrow' (workspace timezone)." },
            priority: { type: "string", enum: ["low", "normal", "high"], description: "Priority (default normal)." },
        },
        required: ["text"],
    },
    execute: async ({ tenantId, args }) => {
        const text = String(args?.text ?? "").trim();
        if (!text) return { result: "A to-do needs some text." };
        const tz = await getTenantTimezone(tenantId);
        const dueAt = args?.due ? parseZonedDate(args.due, tz) : null;
        const priority = PRIORITIES.has(String(args?.priority)) ? String(args.priority) : "normal";
        const res = await db.insert(todos).values({ tenantId, text: text.slice(0, 500), dueAt, priority }).returning({ id: todos.id });
        const dueStr = dueAt ? ` (due ${formatInTz(dueAt, tz)})` : "";
        return { result: `Added to-do: "${text}"${dueStr} [id: ${res[0].id}]` };
    },
};

export const todoListTool: Tool = {
    name: "todo_list",
    source: "builtin",
    description: "List to-dos. By default shows open (not-done) items; pass include_done to show completed ones too.",
    parameters: {
        type: "object",
        properties: { include_done: { type: "boolean", description: "Include completed to-dos." } },
        required: [],
    },
    execute: async ({ tenantId, args }) => {
        const tz = await getTenantTimezone(tenantId);
        const where = args?.include_done === true
            ? eq(todos.tenantId, tenantId)
            : and(eq(todos.tenantId, tenantId), eq(todos.done, false));
        const rows = await db.select().from(todos).where(where)
            .orderBy(asc(todos.done), desc(todos.priority), asc(todos.dueAt), desc(todos.createdAt))
            .limit(100);
        if (rows.length === 0) return { result: "No to-dos. All clear." };
        const lines = rows.map((r) => {
            const box = r.done ? "[x]" : "[ ]";
            const pr = r.priority && r.priority !== "normal" ? ` (${r.priority})` : "";
            const due = r.dueAt ? ` — due ${formatInTz(r.dueAt, tz)}` : "";
            return `${box} ${r.text}${pr}${due} [id: ${r.id}]`;
        });
        return { result: `To-dos (${rows.length}):\n${lines.join("\n")}` };
    },
};

export const todoCompleteTool: Tool = {
    name: "todo_complete",
    source: "builtin",
    description: "Mark a to-do done (or reopen it with done=false), by its id.",
    parameters: {
        type: "object",
        properties: {
            id: { type: "string", description: "The to-do id." },
            done: { type: "boolean", description: "true to complete (default), false to reopen." },
        },
        required: ["id"],
    },
    execute: async ({ tenantId, args }) => {
        const id = String(args?.id ?? "").trim();
        if (!id) return { result: "Provide the to-do id." };
        const done = args?.done !== false;
        const res = await db.update(todos)
            .set({ done, doneAt: done ? new Date() : null, updatedAt: new Date() })
            .where(and(eq(todos.tenantId, tenantId), eq(todos.id, id))).returning({ id: todos.id, text: todos.text });
        if (!res[0]) return { result: `No to-do found with id ${id}.` };
        return { result: `${done ? "Completed" : "Reopened"}: "${res[0].text}"` };
    },
};

export const todoDeleteTool: Tool = {
    name: "todo_delete",
    source: "builtin",
    description: "Delete a to-do by its id.",
    parameters: { type: "object", properties: { id: { type: "string", description: "The to-do id." } }, required: ["id"] },
    execute: async ({ tenantId, args }) => {
        const id = String(args?.id ?? "").trim();
        if (!id) return { result: "Provide the to-do id." };
        const res = await db.delete(todos)
            .where(and(eq(todos.tenantId, tenantId), eq(todos.id, id))).returning({ id: todos.id });
        return { result: res[0] ? `To-do ${id} deleted.` : `No to-do found with id ${id}.` };
    },
};
