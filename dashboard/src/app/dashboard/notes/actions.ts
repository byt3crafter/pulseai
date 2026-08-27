"use server";

import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../../storage/db";
import { notes } from "../../../storage/schema";
import { requireTenant } from "../../../utils/tenant-auth";
import { scopedTo } from "../../../utils/visibility";
import { logAudit } from "../../../utils/audit";

export interface NoteRow {
    id: string;
    title: string | null;
    body: string;
    pinned: boolean;
    tags: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

/** List the tenant's notes, pinned first then most recently updated. Returns [] on auth failure. */
export async function getNotes(): Promise<NoteRow[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const rows = await db.select({
            id: notes.id,
            title: notes.title,
            body: notes.body,
            pinned: notes.pinned,
            tags: notes.tags,
            createdAt: notes.createdAt,
            updatedAt: notes.updatedAt,
        })
            .from(notes)
            .where(scopedTo(notes, tenantId, tenantCheck.userId))
            .orderBy(desc(notes.pinned), desc(notes.updatedAt));
        return rows.map((r) => ({ ...r, pinned: !!r.pinned }));
    } catch (error) {
        console.error("Failed to load notes:", error);
        return [];
    }
}

/** Create or update a note (edit when `id` is present). */
export async function saveNoteAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const id = ((formData.get("id") as string) || "").trim();
    const title = ((formData.get("title") as string) || "").trim();
    const body = ((formData.get("body") as string) || "").trim();
    const tags = ((formData.get("tags") as string) || "").trim();
    const pinned = formData.get("pinned") === "true" || formData.get("pinned") === "on";

    if (!body) return { success: false, message: "Note body is required." };

    try {
        if (id) {
            const [updated] = await db.update(notes)
                .set({
                    title: title || null,
                    body,
                    tags: tags || null,
                    pinned,
                    updatedAt: new Date(),
                })
                .where(and(eq(notes.id, id), eq(notes.tenantId, tenantId)))
                .returning({ id: notes.id });

            if (!updated) return { success: false, message: "Note not found." };
        } else {
            await db.insert(notes).values({
                // Phase 0: record who made this. Nothing is hidden yet — the row is
                // still workspace-visible; this is what makes Phase 2 possible.
                tenantId,
                ownerUserId: tenantCheck.userId,
                title: title || null,
                body,
                tags: tags || null,
                pinned,
            });
        }

        await logAudit({
            action: "note.save",
            targetType: "note",
            targetId: id || title || undefined,
            tenantId,
            summary: `Saved note${title ? `: ${title}` : ""}`,
        });

        revalidatePath("/dashboard/notes");
        return { success: true, message: id ? "Note updated." : "Note added." };
    } catch (error) {
        console.error("Failed to save note:", error);
        return { success: false, message: "Failed to save note." };
    }
}

/** Delete a note by id, scoped to the tenant. */
export async function deleteNoteAction(id: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false, message: "Note id is required." };

    try {
        const [existing] = await db.select({ title: notes.title })
            .from(notes)
            .where(and(eq(notes.id, id), eq(notes.tenantId, tenantId)))
            .limit(1);

        await db.delete(notes).where(and(eq(notes.id, id), eq(notes.tenantId, tenantId)));

        await logAudit({
            action: "note.delete",
            targetType: "note",
            targetId: id,
            tenantId,
            summary: `Deleted note${existing?.title ? `: ${existing.title}` : ""}`,
        });

        revalidatePath("/dashboard/notes");
        return { success: true, message: "Note deleted." };
    } catch (error) {
        console.error("Failed to delete note:", error);
        return { success: false, message: "Failed to delete note." };
    }
}
