"use server";

import { and, eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../../storage/db";
import { todos } from "../../../storage/schema";
import { requireTenant } from "../../../utils/tenant-auth";
import { scopedTo } from "../../../utils/visibility";
import { logAudit } from "../../../utils/audit";

export type TodoPriority = "low" | "normal" | "high";
const PRIORITIES: TodoPriority[] = ["low", "normal", "high"];

export interface TodoRow {
    id: string;
    text: string;
    done: boolean;
    doneAt: Date | null;
    dueAt: Date | null;
    priority: TodoPriority;
    createdAt: Date | null;
}

/** List the tenant's todos, open items first, then by due date / creation. Returns [] on auth failure. */
export async function getTodos(): Promise<TodoRow[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const rows = await db.select({
            id: todos.id,
            text: todos.text,
            done: todos.done,
            doneAt: todos.doneAt,
            dueAt: todos.dueAt,
            priority: todos.priority,
            createdAt: todos.createdAt,
        })
            .from(todos)
            .where(scopedTo(todos, tenantId, tenantCheck.userId, "todo"))
            .orderBy(asc(todos.done), asc(todos.dueAt), asc(todos.createdAt));
        return rows.map((r) => ({
            ...r,
            done: !!r.done,
            priority: (PRIORITIES.includes(r.priority as TodoPriority) ? r.priority : "normal") as TodoPriority,
        }));
    } catch (error) {
        console.error("Failed to load todos:", error);
        return [];
    }
}

/** Create a new todo. */
export async function saveTodoAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const text = ((formData.get("text") as string) || "").trim();
    const due = ((formData.get("due") as string) || "").trim();
    let priority = ((formData.get("priority") as string) || "normal").trim() as TodoPriority;
    if (!PRIORITIES.includes(priority)) priority = "normal";

    if (!text) return { success: false, message: "Task text is required." };

    let dueAt: Date | null = null;
    if (due) {
        const parsed = new Date(due);
        if (!Number.isNaN(parsed.getTime())) dueAt = parsed;
    }

    try {
        await db.insert(todos).values({
                // Phase 0: record who made this. Nothing is hidden yet — the row is
                // still workspace-visible; this is what makes Phase 2 possible.
            tenantId,
            ownerUserId: tenantCheck.userId,
            text,
            dueAt,
            priority,
        });

        await logAudit({
            action: "todo.save",
            targetType: "todo",
            targetId: text,
            tenantId,
            summary: `Added to-do: ${text}`,
        });

        revalidatePath("/dashboard/todos");
        return { success: true, message: "To-do added." };
    } catch (error) {
        console.error("Failed to save todo:", error);
        return { success: false, message: "Failed to save to-do." };
    }
}

/** Toggle a todo's completion state. */
export async function toggleTodoAction(id: string, done: boolean) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false, message: "To-do id is required." };

    try {
        const [updated] = await db.update(todos)
            .set({ done, doneAt: done ? new Date() : null, updatedAt: new Date() })
            .where(and(eq(todos.id, id), eq(todos.tenantId, tenantId)))
            .returning({ id: todos.id, text: todos.text });

        if (!updated) return { success: false, message: "To-do not found." };

        await logAudit({
            action: "todo.save",
            targetType: "todo",
            targetId: id,
            tenantId,
            summary: `Marked to-do ${done ? "done" : "open"}: ${updated.text}`,
        });

        revalidatePath("/dashboard/todos");
        return { success: true, message: done ? "Marked done." : "Marked open." };
    } catch (error) {
        console.error("Failed to update todo:", error);
        return { success: false, message: "Failed to update to-do." };
    }
}

/** Delete a todo by id, scoped to the tenant. */
export async function deleteTodoAction(id: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false, message: "To-do id is required." };

    try {
        const [existing] = await db.select({ text: todos.text })
            .from(todos)
            .where(and(eq(todos.id, id), eq(todos.tenantId, tenantId)))
            .limit(1);

        await db.delete(todos).where(and(eq(todos.id, id), eq(todos.tenantId, tenantId)));

        await logAudit({
            action: "todo.delete",
            targetType: "todo",
            targetId: id,
            tenantId,
            summary: `Deleted to-do${existing?.text ? `: ${existing.text}` : ""}`,
        });

        revalidatePath("/dashboard/todos");
        return { success: true, message: "To-do deleted." };
    } catch (error) {
        console.error("Failed to delete todo:", error);
        return { success: false, message: "Failed to delete to-do." };
    }
}
