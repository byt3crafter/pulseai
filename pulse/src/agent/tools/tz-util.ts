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
        return isNaN(fallback.getTime()) ? null : fallback;
    }
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
