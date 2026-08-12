/**
 * Timezone helpers so the agent interprets "10am" as the workspace's local time,
 * not UTC. The workspace timezone is an IANA string in tenants.config.timezone
 * (default UTC). No external library — uses Intl offset arithmetic.
 */

import { db } from "../../storage/db.js";
import { tenants } from "../../storage/schema.js";
import { eq } from "drizzle-orm";

const cache = new Map<string, { at: number; tz: string }>();
const TTL_MS = 5 * 60_000;

export async function getTenantTimezone(tenantId: string): Promise<string> {
    const c = cache.get(tenantId);
    if (c && Date.now() - c.at < TTL_MS) return c.tz;
    let tz = "UTC";
    try {
        const t = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId), columns: { config: true } });
        const v = (t?.config as any)?.timezone;
        if (typeof v === "string" && v.trim()) {
            try { new Intl.DateTimeFormat("en-US", { timeZone: v.trim() }); tz = v.trim(); } catch { /* invalid → UTC */ }
        }
    } catch { /* default UTC */ }
    cache.set(tenantId, { at: Date.now(), tz });
    return tz;
}

/** How far ahead `tz` is of UTC at the given instant, in ms (handles DST). */
function tzOffsetMs(instant: Date, tz: string): number {
    const asTz = new Date(instant.toLocaleString("en-US", { timeZone: tz }));
    const asUtc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }));
    return asTz.getTime() - asUtc.getTime();
}

/**
 * Parse a datetime string into an absolute UTC Date. If it carries an explicit
 * offset/Z it's absolute; otherwise the naive wall-clock time is interpreted in
 * `tz`. Returns null if unparseable.
 */
export function parseZonedDate(input: unknown, tz: string): Date | null {
    if (typeof input !== "string" || !input.trim()) return null;
    const s = input.trim();
    if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    // Naive wall time → pretend UTC, then subtract tz's offset at that instant.
    const asIfUtc = new Date(s.replace(" ", "T") + "Z");
    if (isNaN(asIfUtc.getTime())) {
        const fallback = new Date(s);
        if (!isNaN(fallback.getTime())) return fallback;
        // Last resort: natural-language relative dates ("Friday", "tomorrow", …).
        return relativeToUtc(s, tz);
    }
    return new Date(asIfUtc.getTime() - tzOffsetMs(asIfUtc, tz));
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Resolve natural-language relative dates the model commonly emits — "today",
 * "tomorrow", "friday", "next monday", "in 3 days", "in 2 weeks", "next week" —
 * to an absolute UTC Date, anchored to the tenant's local today at 09:00.
 */
function relativeToUtc(input: string, tz: string): Date | null {
    const s = input.toLowerCase().trim().replace(/^(by|on|this|coming)\s+/, "");
    // Today's date in the tenant timezone.
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const y = Number(get("year")), m = Number(get("month")), d = Number(get("day"));
    const todayWd = WEEKDAYS.indexOf(get("weekday").toLowerCase());
    if (!y || !m || !d || todayWd < 0) return null;

    let addDays: number | null = null;
    if (s === "today") addDays = 0;
    else if (s === "tomorrow") addDays = 1;
    else if (s === "yesterday") addDays = -1;
    else if (s === "next week") addDays = 7;
    else {
        const inMatch = s.match(/^in\s+(\d+)\s+(day|week)s?$/);
        if (inMatch) addDays = Number(inMatch[1]) * (inMatch[2] === "week" ? 7 : 1);
        else {
            const wdMatch = s.match(/^(next\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/);
            if (wdMatch) {
                const target = WEEKDAYS.findIndex((w) => w.startsWith(wdMatch[2]));
                let delta = (target - todayWd + 7) % 7;
                if (wdMatch[1] && delta === 0) delta = 7; // "next friday" when today is friday
                if (!wdMatch[1] && delta === 0) delta = 0; // bare weekday today = today
                addDays = delta;
            }
        }
    }
    if (addDays === null) return null;
    // Build the target wall-time (09:00 local) and convert via the naive path.
    const base = new Date(Date.UTC(y, m - 1, d + addDays, 9, 0, 0));
    const wall = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}T09:00:00`;
    const asIfUtc = new Date(wall + "Z");
    return new Date(asIfUtc.getTime() - tzOffsetMs(asIfUtc, tz));
}

/** Format an absolute Date for display in the workspace timezone. */
export function formatInTz(d: Date | null | undefined, tz: string, opts?: { dateOnly?: boolean; timeOnly?: boolean }): string {
    if (!d) return "";
    const o: Intl.DateTimeFormatOptions = { timeZone: tz };
    if (opts?.timeOnly) { o.timeStyle = "short"; }
    else if (opts?.dateOnly) { o.dateStyle = "medium"; }
    else { o.dateStyle = "medium"; o.timeStyle = "short"; }
    return d.toLocaleString("en-US", o);
}
