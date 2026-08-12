"use server";

import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "../../storage/db";
import { notifications } from "../../storage/schema";
import { requireTenant } from "../../utils/tenant-auth";

export interface NotificationRow {
    id: string;
    title: string;
    body: string | null;
    kind: string | null;
    priority: string | null;
    link: string | null;
    read: boolean;
    createdAt: Date | null;
}

/** List the tenant's most recent notifications, newest first. Returns [] on auth failure. */
export async function getNotifications(limit = 30): Promise<NotificationRow[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const rows = await db.select({
            id: notifications.id,
            title: notifications.title,
            body: notifications.body,
            kind: notifications.kind,
            priority: notifications.priority,
            link: notifications.link,
            read: notifications.read,
            createdAt: notifications.createdAt,
        })
            .from(notifications)
            .where(eq(notifications.tenantId, tenantId))
            .orderBy(desc(notifications.createdAt))
            .limit(limit);
        return rows.map((r) => ({ ...r, read: !!r.read }));
    } catch (error) {
        console.error("Failed to load notifications:", error);
        return [];
    }
}

/** Count the tenant's unread notifications. Returns 0 on auth failure. */
export async function getUnreadCount(): Promise<number> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return 0;
    const tenantId = tenantCheck.tenantId;

    try {
        const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(notifications)
            .where(and(eq(notifications.tenantId, tenantId), eq(notifications.read, false)));
        return Number(result[0]?.count || 0);
    } catch (error) {
        console.error("Failed to count unread notifications:", error);
        return 0;
    }
}

/** Mark a single notification read, scoped to the tenant. */
export async function markNotificationRead(id: string): Promise<{ success: boolean }> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false };

    try {
        await db.update(notifications)
            .set({ read: true, readAt: new Date() })
            .where(and(eq(notifications.id, id), eq(notifications.tenantId, tenantId)));
        return { success: true };
    } catch (error) {
        console.error("Failed to mark notification read:", error);
        return { success: false };
    }
}

/** Mark all of the tenant's unread notifications read. */
export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false };
    const tenantId = tenantCheck.tenantId;

    try {
        await db.update(notifications)
            .set({ read: true, readAt: new Date() })
            .where(and(eq(notifications.tenantId, tenantId), eq(notifications.read, false)));
        return { success: true };
    } catch (error) {
        console.error("Failed to mark all notifications read:", error);
        return { success: false };
    }
}
