/**
 * Calendar tools — a user calendar the agent can read and write.
 * (Distinct from the `schedule_*` tools, which schedule the AGENT's own jobs.)
 * Native store now; a Google Calendar backend can slot in behind the same tools.
 * Times are stored as absolute instants (timestamptz). Callers should pass ISO
 * 8601 datetimes; use get_current_time first to resolve "tomorrow 3pm" etc.
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { events } from "../../../storage/schema.js";
import { and, eq, gte, lte, ilike, or, asc } from "drizzle-orm";
import { getTenantTimezone, parseZonedDate, formatInTz } from "../tz-util.js";

function line(
    e: { title: string; startsAt: Date; endsAt: Date | null; allDay: boolean | null; location: string | null; attendees: string | null },
    tz: string,
): string {
    const when = e.allDay
        ? `${formatInTz(e.startsAt, tz, { dateOnly: true })} (all day)`
        : `${formatInTz(e.startsAt, tz)}${e.endsAt ? `–${formatInTz(e.endsAt, tz, { timeOnly: true })}` : ""}`;
    const bits = [e.location && `@ ${e.location}`, e.attendees && `with ${e.attendees}`].filter(Boolean);
    return `- ${when} — ${e.title}${bits.length ? ` (${bits.join(", ")})` : ""}`;
}

export const calendarAddTool: Tool = {
    name: "calendar_add",
    source: "builtin",
    description:
        "Add an event to the user's calendar. Provide the start as an ISO 8601 datetime (e.g. \"2026-08-12T15:00:00\") — call get_current_time first to resolve relative times like \"tomorrow at 3pm\". " +
        "For an all-day event set all_day=true and give the date.",
    parameters: {
        type: "object",
        properties: {
            title: { type: "string", description: "What the event is." },
            start: { type: "string", description: "Start datetime, ISO 8601." },
            end: { type: "string", description: "Optional end datetime, ISO 8601." },
            all_day: { type: "boolean", description: "True for an all-day event." },
            location: { type: "string", description: "Where it is." },
            attendees: { type: "string", description: "Who's attending (names/emails)." },
            notes: { type: "string", description: "Any details." },
        },
        required: ["title", "start"],
    },
    execute: async ({ tenantId, args }) => {
        const title = String(args?.title ?? "").trim();
        if (!title) return { result: "An event title is required." };
        const tz = await getTenantTimezone(tenantId);
        const startsAt = parseZonedDate(args?.start, tz);
        if (!startsAt) return { result: "Provide a valid start datetime (ISO 8601, e.g. 2026-08-12T15:00:00 — interpreted in the workspace timezone). Use get_current_time to resolve relative times." };
        const endsAt = parseZonedDate(args?.end, tz);
        await db.insert(events).values({
            tenantId, title, startsAt, endsAt: endsAt ?? undefined,
            allDay: !!args?.all_day,
            location: args?.location ? String(args.location) : null,
            attendees: args?.attendees ? String(args.attendees) : null,
            notes: args?.notes ? String(args.notes) : null,
        });
        return { result: `Added to the calendar: "${title}" on ${formatInTz(startsAt, tz)} (${tz}).` };
    },
};

export const calendarListTool: Tool = {
    name: "calendar_list",
    source: "builtin",
    description: "List upcoming calendar events. Defaults to the next 30 days; pass from/to (ISO dates) for a specific window.",
    parameters: {
        type: "object",
        properties: {
            from: { type: "string", description: "Window start (ISO). Default: now." },
            to: { type: "string", description: "Window end (ISO). Default: 30 days out." },
            limit: { type: "number", description: "Max events (default 25)." },
        },
        required: [],
    },
    execute: async ({ tenantId, args }) => {
        const tz = await getTenantTimezone(tenantId);
        const from = parseZonedDate(args?.from, tz) ?? new Date();
        const to = parseZonedDate(args?.to, tz) ?? new Date(Date.now() + 30 * 86_400_000);
        const limit = Math.max(1, Math.min(100, Number(args?.limit) || 25));
        const rows = await db.select().from(events)
            .where(and(eq(events.tenantId, tenantId), gte(events.startsAt, from), lte(events.startsAt, to)))
            .orderBy(asc(events.startsAt)).limit(limit);
        if (rows.length === 0) return { result: `Nothing on the calendar between ${formatInTz(from, tz)} and ${formatInTz(to, tz)}.` };
        return { result: `Upcoming events (times in ${tz}):\n${rows.map((e) => line(e, tz)).join("\n")}` };
    },
};

export const calendarSearchTool: Tool = {
    name: "calendar_search",
    source: "builtin",
    description: "Search calendar events by title, location or attendee.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Text to match." } }, required: ["query"] },
    execute: async ({ tenantId, args }) => {
        const q = String(args?.query ?? "").trim();
        if (!q) return { result: "Provide something to search for." };
        const tz = await getTenantTimezone(tenantId);
        const like = `%${q}%`;
        const rows = await db.select().from(events)
            .where(and(eq(events.tenantId, tenantId), or(ilike(events.title, like), ilike(events.location, like), ilike(events.attendees, like))))
            .orderBy(asc(events.startsAt)).limit(25);
        if (rows.length === 0) return { result: `No events match "${q}".` };
        return { result: `Events matching "${q}" (times in ${tz}):\n${rows.map((e) => line(e, tz)).join("\n")}` };
    },
};

export const calendarDeleteTool: Tool = {
    name: "calendar_delete",
    source: "builtin",
    description: "Delete a calendar event by matching its title (optionally narrow with a date).",
    parameters: {
        type: "object",
        properties: {
            title: { type: "string", description: "Title (or part) of the event to delete." },
            on: { type: "string", description: "Optional date (ISO) to disambiguate." },
        },
        required: ["title"],
    },
    execute: async ({ tenantId, args }) => {
        const t = String(args?.title ?? "").trim();
        if (!t) return { result: "Provide the event title to delete." };
        const tz = await getTenantTimezone(tenantId);
        const conds = [eq(events.tenantId, tenantId), ilike(events.title, `%${t}%`)];
        const on = parseZonedDate(args?.on, tz);
        if (on) {
            conds.push(gte(events.startsAt, new Date(on.getTime())));
            conds.push(lte(events.startsAt, new Date(on.getTime() + 86_400_000)));
        }
        const rows = await db.select({ id: events.id, title: events.title, startsAt: events.startsAt }).from(events).where(and(...conds)).limit(5);
        if (rows.length === 0) return { result: `No event found matching "${t}".` };
        if (rows.length > 1) return { result: `"${t}" matches ${rows.length} events — narrow it down with a date (on).` };
        await db.delete(events).where(eq(events.id, rows[0].id));
        return { result: `Deleted event: "${rows[0].title}" (${formatInTz(rows[0].startsAt, tz)}).` };
    },
};
