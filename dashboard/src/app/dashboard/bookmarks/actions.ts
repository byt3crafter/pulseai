"use server";

import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../../storage/db";
import { bookmarks } from "../../../storage/schema";
import { requireTenant } from "../../../utils/tenant-auth";
import { scopedTo } from "../../../utils/visibility";
import { logAudit } from "../../../utils/audit";

export type BookmarkKind = "web" | "youtube";

export interface BookmarkRow {
    id: string;
    url: string;
    title: string | null;
    notes: string | null;
    kind: BookmarkKind;
    tags: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

/** Detect whether a URL points at YouTube; everything else is "web". */
function detectKind(url: string): BookmarkKind {
    // Match youtube.com / youtu.be in HOST position (after "//" or a subdomain
    // dot), ending at a path/port/query boundary — mirrors the backend tool.
    return /(?:\/\/|\.)(?:youtube\.com|youtu\.be)(?:[/:?#]|$)/i.test(url) ? "youtube" : "web";
}

/** List the tenant's bookmarks, most recently updated first. Returns [] on auth failure. */
export async function getBookmarks(): Promise<BookmarkRow[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const rows = await db.select({
            id: bookmarks.id,
            url: bookmarks.url,
            title: bookmarks.title,
            notes: bookmarks.notes,
            kind: bookmarks.kind,
            tags: bookmarks.tags,
            createdAt: bookmarks.createdAt,
            updatedAt: bookmarks.updatedAt,
        })
            .from(bookmarks)
            .where(scopedTo(bookmarks, tenantId, tenantCheck.userId, "bookmark"))
            .orderBy(desc(bookmarks.updatedAt));
        return rows.map((r) => ({ ...r, kind: (r.kind === "youtube" ? "youtube" : "web") as BookmarkKind }));
    } catch (error) {
        console.error("Failed to load bookmarks:", error);
        return [];
    }
}

/** Create or update a bookmark (edit when `id` is present). Kind is auto-detected from the URL. */
export async function saveBookmarkAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const id = ((formData.get("id") as string) || "").trim();
    const url = ((formData.get("url") as string) || "").trim();
    const title = ((formData.get("title") as string) || "").trim();
    const notes = ((formData.get("notes") as string) || "").trim();
    const tags = ((formData.get("tags") as string) || "").trim();

    if (!url) return { success: false, message: "URL is required." };

    const kind = detectKind(url);

    try {
        if (id) {
            const [updated] = await db.update(bookmarks)
                .set({
                    url,
                    title: title || null,
                    notes: notes || null,
                    tags: tags || null,
                    kind,
                    updatedAt: new Date(),
                })
                .where(and(eq(bookmarks.id, id), eq(bookmarks.tenantId, tenantId)))
                .returning({ id: bookmarks.id });

            if (!updated) return { success: false, message: "Bookmark not found." };
        } else {
            await db.insert(bookmarks).values({
                // Phase 0: record who made this. Nothing is hidden yet — the row is
                // still workspace-visible; this is what makes Phase 2 possible.
                tenantId,
                ownerUserId: tenantCheck.userId,
                url,
                title: title || null,
                notes: notes || null,
                tags: tags || null,
                kind,
            });
        }

        await logAudit({
            action: "bookmark.save",
            targetType: "bookmark",
            targetId: id || url,
            tenantId,
            summary: `Saved bookmark: ${title || url}`,
        });

        revalidatePath("/dashboard/bookmarks");
        return { success: true, message: id ? "Bookmark updated." : "Bookmark added." };
    } catch (error) {
        console.error("Failed to save bookmark:", error);
        return { success: false, message: "Failed to save bookmark." };
    }
}

/** Delete a bookmark by id, scoped to the tenant. */
export async function deleteBookmarkAction(id: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false, message: "Bookmark id is required." };

    try {
        const [existing] = await db.select({ title: bookmarks.title, url: bookmarks.url })
            .from(bookmarks)
            .where(and(eq(bookmarks.id, id), eq(bookmarks.tenantId, tenantId)))
            .limit(1);

        await db.delete(bookmarks).where(and(eq(bookmarks.id, id), eq(bookmarks.tenantId, tenantId)));

        await logAudit({
            action: "bookmark.delete",
            targetType: "bookmark",
            targetId: id,
            tenantId,
            summary: `Deleted bookmark: ${existing?.title || existing?.url || id}`,
        });

        revalidatePath("/dashboard/bookmarks");
        return { success: true, message: "Bookmark deleted." };
    } catch (error) {
        console.error("Failed to delete bookmark:", error);
        return { success: false, message: "Failed to delete bookmark." };
    }
}
