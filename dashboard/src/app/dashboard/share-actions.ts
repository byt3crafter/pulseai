"use server";

/**
 * Sharing — one implementation for every shareable thing (multi-user Phase 3).
 *
 * Deliberately NOT a share action per feature. Sharing is the operation where a
 * mistake hands one person's private work to someone else, and five copies of
 * it means five chances to check the owner slightly differently. Everything
 * routes through `share()` / `unshare()` below, both of which refuse unless the
 * caller owns the row.
 *
 * See docs/MULTI_USER_PLAN.md.
 */

import { db } from "../../storage/db";
import {
    resourceShares,
    users,
    conversations,
    notes,
    todos,
    bookmarks,
    documents,
} from "../../storage/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireTenant } from "../../utils/tenant-auth";
import { logAudit } from "../../utils/audit";
import { canShare, type ShareableType } from "../../utils/visibility";
import { revalidatePath } from "next/cache";

/** The table behind each shareable type. Keyed so a bad type cannot reach a query. */
const TABLES = {
    conversation: conversations,
    note: notes,
    todo: todos,
    bookmark: bookmarks,
    document: documents,
} as const;

function tableFor(type: string) {
    return (TABLES as Record<string, any>)[type];
}

export interface ShareRow {
    userId: string;
    name: string | null;
    email: string;
    access: string;
}

/**
 * Who this is currently shared with, plus who it could be shared with.
 *
 * Both in one call because the share dialog needs both to render, and two
 * round-trips would show an empty picker for a beat on every open.
 */
export async function getSharingAction(
    resourceType: ShareableType,
    resourceId: string,
): Promise<{ shares: ShareRow[]; candidates: ShareRow[]; canShare: boolean }> {
    const empty = { shares: [], candidates: [], canShare: false };
    const check = await requireTenant();
    if (!check.authorized) return empty;

    const table = tableFor(resourceType);
    if (!table) return empty;

    try {
        const row = await db
            .select({ ownerUserId: table.ownerUserId, tenantId: table.tenantId })
            .from(table)
            .where(eq(table.id, resourceId))
            .limit(1);
        const found = row[0];
        if (!found || found.tenantId !== check.tenantId) return empty;

        // Only the owner may see who else has access — the member list of a
        // private thing is itself information about that thing.
        if (!canShare(found, check.userId)) return empty;

        const existing = await db
            .select({
                userId: resourceShares.userId,
                access: resourceShares.access,
                name: users.name,
                email: users.email,
            })
            .from(resourceShares)
            .innerJoin(users, eq(users.id, resourceShares.userId))
            .where(
                and(
                    eq(resourceShares.resourceType, resourceType),
                    eq(resourceShares.resourceId, resourceId),
                ),
            );

        const members = await db
            .select({ userId: users.id, name: users.name, email: users.email })
            .from(users)
            .where(eq(users.tenantId, check.tenantId));

        const already = new Set(existing.map((e) => e.userId));
        return {
            shares: existing.map((e) => ({
                userId: e.userId,
                name: e.name,
                email: e.email,
                access: e.access,
            })),
            candidates: members
                .filter((m) => m.userId !== check.userId && !already.has(m.userId))
                .map((m) => ({ userId: m.userId, name: m.name, email: m.email, access: "read" })),
            canShare: true,
        };
    } catch (error) {
        console.error("Failed to load sharing:", error);
        return empty;
    }
}

/** Share with one person. Owner only. */
export async function shareAction(formData: FormData) {
    const resourceType = String(formData.get("resourceType") || "") as ShareableType;
    const resourceId = String(formData.get("resourceId") || "");
    const withUserId = String(formData.get("userId") || "");
    const access = String(formData.get("access") || "read") === "write" ? "write" : "read";

    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };

    const table = tableFor(resourceType);
    if (!table || !resourceId || !withUserId) {
        return { success: false, message: "Nothing to share." };
    }

    try {
        const row = (
            await db
                .select({
                    ownerUserId: table.ownerUserId,
                    tenantId: table.tenantId,
                    visibility: table.visibility,
                })
                .from(table)
                .where(eq(table.id, resourceId))
                .limit(1)
        )[0];
        if (!row || row.tenantId !== check.tenantId) {
            return { success: false, message: "Not found." };
        }
        if (!canShare(row, check.userId)) {
            return { success: false, message: "Only the owner can share this." };
        }

        // The recipient must be in the same workspace. Without this check a
        // guessed user id would share across tenants — the one boundary that
        // must never bend.
        const recipient = (
            await db
                .select({ id: users.id, tenantId: users.tenantId })
                .from(users)
                .where(eq(users.id, withUserId))
                .limit(1)
        )[0];
        if (!recipient || recipient.tenantId !== check.tenantId) {
            return { success: false, message: "That person isn't in this workspace." };
        }

        await db
            .insert(resourceShares)
            .values({
                tenantId: check.tenantId,
                resourceType,
                resourceId,
                userId: withUserId,
                sharedBy: check.userId,
                access,
            })
            .onConflictDoUpdate({
                target: [
                    resourceShares.resourceType,
                    resourceShares.resourceId,
                    resourceShares.userId,
                ],
                set: { access },
            });

        // Mark the row shared so `visibleTo` bothers to look here at all. A row
        // left `private` with shares attached would be invisible to the people
        // it was just shared with — the failure this line exists to prevent.
        if (row.visibility === "private") {
            await db.update(table).set({ visibility: "shared" }).where(eq(table.id, resourceId));
        }

        await logAudit({
            action: "resource.share",
            targetType: resourceType,
            targetId: resourceId,
            tenantId: check.tenantId,
            summary: `Shared a ${resourceType} with a workspace member`,
            metadata: { withUserId, access },
        });

        revalidateFor(resourceType);
        return { success: true, message: "Shared." };
    } catch (error) {
        console.error("Failed to share:", error);
        return { success: false, message: "Failed to share." };
    }
}

/** Stop sharing with one person. Owner only. */
export async function unshareAction(formData: FormData) {
    const resourceType = String(formData.get("resourceType") || "") as ShareableType;
    const resourceId = String(formData.get("resourceId") || "");
    const withUserId = String(formData.get("userId") || "");

    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };

    const table = tableFor(resourceType);
    if (!table || !resourceId || !withUserId) {
        return { success: false, message: "Nothing to change." };
    }

    try {
        const row = (
            await db
                .select({ ownerUserId: table.ownerUserId, tenantId: table.tenantId })
                .from(table)
                .where(eq(table.id, resourceId))
                .limit(1)
        )[0];
        if (!row || row.tenantId !== check.tenantId) {
            return { success: false, message: "Not found." };
        }
        if (!canShare(row, check.userId)) {
            return { success: false, message: "Only the owner can change sharing." };
        }

        await db
            .delete(resourceShares)
            .where(
                and(
                    eq(resourceShares.resourceType, resourceType),
                    eq(resourceShares.resourceId, resourceId),
                    eq(resourceShares.userId, withUserId),
                ),
            );

        // Last share removed → back to private. Leaving it `shared` with nobody
        // on the list would read as "still shared" in every UI that shows a badge.
        const left = await db
            .select({ userId: resourceShares.userId })
            .from(resourceShares)
            .where(
                and(
                    eq(resourceShares.resourceType, resourceType),
                    eq(resourceShares.resourceId, resourceId),
                ),
            )
            .limit(1);
        if (left.length === 0) {
            await db.update(table).set({ visibility: "private" }).where(eq(table.id, resourceId));
        }

        await logAudit({
            action: "resource.unshare",
            targetType: resourceType,
            targetId: resourceId,
            tenantId: check.tenantId,
            summary: `Stopped sharing a ${resourceType}`,
            metadata: { withUserId },
        });

        revalidateFor(resourceType);
        return { success: true, message: "Sharing removed." };
    } catch (error) {
        console.error("Failed to unshare:", error);
        return { success: false, message: "Failed to update sharing." };
    }
}

/**
 * Share with the whole workspace, or take it back.
 *
 * A separate visibility level rather than a share row per member: a per-member
 * fan-out would not include people who join later, which is never what "share
 * with the workspace" is understood to mean.
 */
export async function setWorkspaceVisibilityAction(formData: FormData) {
    const resourceType = String(formData.get("resourceType") || "") as ShareableType;
    const resourceId = String(formData.get("resourceId") || "");
    const open = String(formData.get("open") || "") === "true";

    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };

    const table = tableFor(resourceType);
    if (!table || !resourceId) return { success: false, message: "Nothing to change." };

    try {
        const row = (
            await db
                .select({ ownerUserId: table.ownerUserId, tenantId: table.tenantId })
                .from(table)
                .where(eq(table.id, resourceId))
                .limit(1)
        )[0];
        if (!row || row.tenantId !== check.tenantId) {
            return { success: false, message: "Not found." };
        }
        if (!canShare(row, check.userId)) {
            return { success: false, message: "Only the owner can change sharing." };
        }

        if (open) {
            await db.update(table).set({ visibility: "workspace" }).where(eq(table.id, resourceId));
        } else {
            // Closing it up again keeps any named people — revoking those too
            // would quietly undo work the owner did not ask to undo.
            const named = await db
                .select({ userId: resourceShares.userId })
                .from(resourceShares)
                .where(
                    and(
                        eq(resourceShares.resourceType, resourceType),
                        eq(resourceShares.resourceId, resourceId),
                    ),
                )
                .limit(1);
            await db
                .update(table)
                .set({ visibility: named.length > 0 ? "shared" : "private" })
                .where(eq(table.id, resourceId));
        }

        await logAudit({
            action: open ? "resource.share_workspace" : "resource.unshare_workspace",
            targetType: resourceType,
            targetId: resourceId,
            tenantId: check.tenantId,
            summary: open
                ? `Opened a ${resourceType} to the whole workspace`
                : `Closed a ${resourceType} to the workspace`,
        });

        revalidateFor(resourceType);
        return { success: true, message: open ? "Shared with the workspace." : "No longer shared with the workspace." };
    } catch (error) {
        console.error("Failed to change workspace visibility:", error);
        return { success: false, message: "Failed to update sharing." };
    }
}

const PATHS: Record<string, string> = {
    conversation: "/dashboard/assistant/history",
    note: "/dashboard/notes",
    todo: "/dashboard/todos",
    bookmark: "/dashboard/bookmarks",
    document: "/dashboard/documents",
};

function revalidateFor(type: string) {
    const path = PATHS[type];
    if (path) revalidatePath(path);
}

/**
 * Which of these ids are shared with me by someone else.
 *
 * A list view needs this to label rows "shared by X" without asking per row —
 * one query for the page rather than one per line.
 */
export async function sharedWithMeAction(
    resourceType: ShareableType,
    resourceIds: string[],
): Promise<Record<string, { by: string | null }>> {
    if (resourceIds.length === 0) return {};
    const check = await requireTenant();
    if (!check.authorized) return {};

    try {
        const rows = await db
            .select({ resourceId: resourceShares.resourceId, sharedBy: resourceShares.sharedBy })
            .from(resourceShares)
            .where(
                and(
                    eq(resourceShares.resourceType, resourceType),
                    eq(resourceShares.userId, check.userId),
                    inArray(resourceShares.resourceId, resourceIds),
                ),
            );

        const byIds = rows.map((r) => r.sharedBy).filter(Boolean) as string[];
        const sharers =
            byIds.length > 0
                ? await db
                      .select({ id: users.id, name: users.name, email: users.email })
                      .from(users)
                      .where(inArray(users.id, byIds))
                : [];
        const nameOf = new Map(sharers.map((s) => [s.id, s.name || s.email]));

        const out: Record<string, { by: string | null }> = {};
        for (const r of rows) {
            out[r.resourceId] = { by: r.sharedBy ? nameOf.get(r.sharedBy) ?? null : null };
        }
        return out;
    } catch (error) {
        console.error("Failed to resolve shares:", error);
        return {};
    }
}
