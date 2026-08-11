"use server";

import { and, asc, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../../storage/db";
import { events } from "../../../storage/schema";
import { requireTenant } from "../../../utils/tenant-auth";
import { logAudit } from "../../../utils/audit";

export interface EventRow {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    allDay: boolean;
    location: string | null;
    attendees: string | null;
    notes: string | null;
}

/** List the tenant's events, chronologically. Returns [] on auth failure. */
export async function getEvents(includePast: boolean = false): Promise<EventRow[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const where = includePast
            ? eq(events.tenantId, tenantId)
            : and(eq(events.tenantId, tenantId), gte(events.startsAt, new Date()));

        const rows = await db.select({
            id: events.id,
            title: events.title,
            startsAt: events.startsAt,
            endsAt: events.endsAt,
            allDay: events.allDay,
            location: events.location,
            attendees: events.attendees,
            notes: events.notes,
        })
            .from(events)
            .where(where)
            .orderBy(asc(events.startsAt))
            .limit(200);

        return rows.map((row) => ({
            id: row.id,
            title: row.title,
            startsAt: row.startsAt.toISOString(),
            endsAt: row.endsAt ? row.endsAt.toISOString() : null,
            allDay: !!row.allDay,
            location: row.location,
            attendees: row.attendees,
            notes: row.notes,
        }));
    } catch (error) {
        console.error("Failed to load events:", error);
        return [];
    }
}

/** Create or update an event (edit when `id` is present). */
export async function saveEventAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const id = ((formData.get("id") as string) || "").trim();
    const title = ((formData.get("title") as string) || "").trim();
    const startsAtRaw = ((formData.get("startsAt") as string) || "").trim();
    const endsAtRaw = ((formData.get("endsAt") as string) || "").trim();
    const allDay = formData.get("allDay") === "true" || formData.get("allDay") === "on";
    const location = ((formData.get("location") as string) || "").trim();
    const attendees = ((formData.get("attendees") as string) || "").trim();
    const notes = ((formData.get("notes") as string) || "").trim();

    if (!title) return { success: false, message: "Title is required." };
    if (!startsAtRaw) return { success: false, message: "Start time is required." };

    const startsAt = new Date(startsAtRaw);
    if (Number.isNaN(startsAt.getTime())) return { success: false, message: "Invalid start time." };

    let endsAt: Date | null = null;
    if (endsAtRaw) {
        const parsedEnd = new Date(endsAtRaw);
        if (!Number.isNaN(parsedEnd.getTime())) endsAt = parsedEnd;
    }

    try {
        if (id) {
            const [updated] = await db.update(events)
                .set({
                    title,
                    startsAt,
                    endsAt,
                    allDay,
                    location: location || null,
                    attendees: attendees || null,
                    notes: notes || null,
                    updatedAt: new Date(),
                })
                .where(and(eq(events.id, id), eq(events.tenantId, tenantId)))
                .returning({ id: events.id });

            if (!updated) return { success: false, message: "Event not found." };
        } else {
            await db.insert(events).values({
                tenantId,
                title,
                startsAt,
                endsAt,
                allDay,
                location: location || null,
                attendees: attendees || null,
                notes: notes || null,
            });
        }

        await logAudit({
            action: "calendar.event.save",
            targetType: "event",
            targetId: title,
            tenantId,
            summary: `Event: ${title}`,
            metadata: { startsAt: startsAt.toISOString() },
        });

        revalidatePath("/dashboard/calendar");
        return { success: true, message: id ? "Event updated." : "Event added." };
    } catch (error) {
        console.error("Failed to save event:", error);
        return { success: false, message: "Failed to save event." };
    }
}

/** Delete an event by id, scoped to the tenant. */
export async function deleteEventAction(id: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false, message: "Event id is required." };

    try {
        const [existing] = await db.select({ title: events.title })
            .from(events)
            .where(and(eq(events.id, id), eq(events.tenantId, tenantId)))
            .limit(1);

        await db.delete(events).where(and(eq(events.id, id), eq(events.tenantId, tenantId)));

        await logAudit({
            action: "calendar.event.delete",
            targetType: "event",
            targetId: id,
            tenantId,
            summary: `Deleted event "${existing?.title ?? id}"`,
        });

        revalidatePath("/dashboard/calendar");
        return { success: true, message: "Event deleted." };
    } catch (error) {
        console.error("Failed to delete event:", error);
        return { success: false, message: "Failed to delete event." };
    }
}
