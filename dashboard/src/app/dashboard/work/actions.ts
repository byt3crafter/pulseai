"use server";

import { and, eq, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../../storage/db";
import { tasks } from "../../../storage/schema";
import { requireTenant } from "../../../utils/tenant-auth";
import { logAudit } from "../../../utils/audit";

export type TaskStatus = "todo" | "doing" | "done" | "blocked";
export type TaskPriority = "low" | "normal" | "high";
export type TaskSource = "agent" | "user";

const STATUSES: TaskStatus[] = ["todo", "doing", "done", "blocked"];
const PRIORITIES: TaskPriority[] = ["low", "normal", "high"];

export interface TaskRow {
    id: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    agentId: string | null;
    source: TaskSource;
    dueAt: Date | null;
    doneAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

/** List the tenant's tasks, unfinished first, then by creation date (newest first) within each group. Returns [] on auth failure. */
export async function getTasks(): Promise<TaskRow[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const rows = await db.select({
            id: tasks.id,
            title: tasks.title,
            description: tasks.description,
            status: tasks.status,
            priority: tasks.priority,
            agentId: tasks.agentId,
            source: tasks.source,
            dueAt: tasks.dueAt,
            doneAt: tasks.doneAt,
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
        })
            .from(tasks)
            .where(eq(tasks.tenantId, tenantId))
            .orderBy(sql`case when ${tasks.status} = 'done' then 1 else 0 end`, desc(tasks.createdAt));

        return rows.map((r) => ({
            ...r,
            status: (STATUSES.includes(r.status as TaskStatus) ? r.status : "todo") as TaskStatus,
            priority: (PRIORITIES.includes(r.priority as TaskPriority) ? r.priority : "normal") as TaskPriority,
            source: (r.source === "agent" ? "agent" : "user") as TaskSource,
        }));
    } catch (error) {
        console.error("Failed to load tasks:", error);
        return [];
    }
}

/** Create or update a task (edit when `id` is present). New manual tasks are always source='user'. */
export async function saveTaskAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const id = ((formData.get("id") as string) || "").trim();
    const title = ((formData.get("title") as string) || "").trim();
    const description = ((formData.get("description") as string) || "").trim();
    let status = ((formData.get("status") as string) || "todo").trim() as TaskStatus;
    let priority = ((formData.get("priority") as string) || "normal").trim() as TaskPriority;
    const due = ((formData.get("due") as string) || "").trim();

    if (!STATUSES.includes(status)) status = "todo";
    if (!PRIORITIES.includes(priority)) priority = "normal";

    if (!title) return { success: false, message: "Title is required." };

    let dueAt: Date | null = null;
    if (due) {
        const parsed = new Date(due);
        if (!Number.isNaN(parsed.getTime())) dueAt = parsed;
    }

    try {
        if (id) {
            const [existing] = await db.select({ doneAt: tasks.doneAt })
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
                .limit(1);
            if (!existing) return { success: false, message: "Task not found." };

            const isDone = status === "done";

            const [updated] = await db.update(tasks)
                .set({
                    title,
                    description: description || null,
                    status,
                    priority,
                    dueAt,
                    doneAt: isDone ? (existing.doneAt ?? new Date()) : null,
                    updatedAt: new Date(),
                })
                .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
                .returning({ id: tasks.id });

            if (!updated) return { success: false, message: "Task not found." };
        } else {
            await db.insert(tasks).values({
                tenantId,
                title,
                description: description || null,
                status,
                priority,
                source: "user",
                dueAt,
                doneAt: status === "done" ? new Date() : null,
            });
        }

        await logAudit({
            action: "task.save",
            targetType: "task",
            targetId: id || title || undefined,
            tenantId,
            summary: `Saved task: ${title}`,
        });

        revalidatePath("/dashboard/work");
        return { success: true, message: id ? "Task updated." : "Task added." };
    } catch (error) {
        console.error("Failed to save task:", error);
        return { success: false, message: "Failed to save task." };
    }
}

/** Update a task's status only (used by the inline status control on each row). */
export async function setTaskStatusAction(id: string, status: TaskStatus) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false, message: "Task id is required." };
    if (!STATUSES.includes(status)) return { success: false, message: "Invalid status." };

    try {
        const [updated] = await db.update(tasks)
            .set({
                status,
                doneAt: status === "done" ? new Date() : null,
                updatedAt: new Date(),
            })
            .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
            .returning({ id: tasks.id, title: tasks.title });

        if (!updated) return { success: false, message: "Task not found." };

        await logAudit({
            action: "task.save",
            targetType: "task",
            targetId: id,
            tenantId,
            summary: `Set task status to ${status}: ${updated.title}`,
        });

        revalidatePath("/dashboard/work");
        return { success: true, message: "Status updated." };
    } catch (error) {
        console.error("Failed to update task status:", error);
        return { success: false, message: "Failed to update status." };
    }
}

/** Delete a task by id, scoped to the tenant. */
export async function deleteTaskAction(id: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false, message: "Task id is required." };

    try {
        const [existing] = await db.select({ title: tasks.title })
            .from(tasks)
            .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
            .limit(1);

        await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));

        await logAudit({
            action: "task.delete",
            targetType: "task",
            targetId: id,
            tenantId,
            summary: `Deleted task${existing?.title ? `: ${existing.title}` : ""}`,
        });

        revalidatePath("/dashboard/work");
        return { success: true, message: "Task deleted." };
    } catch (error) {
        console.error("Failed to delete task:", error);
        return { success: false, message: "Failed to delete task." };
    }
}
