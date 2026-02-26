/**
 * Active hours checking for heartbeat scheduling.
 * Determines if current time is within configured active hours for an agent.
 */

export interface ActiveHours {
    start: string; // "HH:MM" format
    end: string;   // "HH:MM" format
    timezone: string; // IANA timezone e.g. "Indian/Mauritius"
}

function parseHHMM(s: string): { h: number; m: number } | null {
    const match = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return { h: parseInt(match[1], 10), m: parseInt(match[2], 10) };
}

function toMinutes(h: number, m: number): number {
    return h * 60 + m;
}

/**
 * Check if the current time is within active hours.
 * Supports midnight wrapping (e.g., start: "22:00", end: "06:00").
 */
export function isWithinActiveHours(activeHours?: ActiveHours): boolean {
    if (!activeHours?.start || !activeHours?.end) return true; // No restriction = always active

    const start = parseHHMM(activeHours.start);
    const end = parseHHMM(activeHours.end);
    if (!start || !end) return true;

    const tz = activeHours.timezone || "UTC";
    let nowStr: string;
    try {
        nowStr = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(new Date());
    } catch {
        nowStr = new Intl.DateTimeFormat("en-US", {
            timeZone: "UTC",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(new Date());
    }

    const nowParsed = parseHHMM(nowStr);
    if (!nowParsed) return true;

    const nowMin = toMinutes(nowParsed.h, nowParsed.m);
    const startMin = toMinutes(start.h, start.m);
    const endMin = toMinutes(end.h, end.m);

    if (startMin <= endMin) {
        // Normal range (e.g., 08:00 - 18:00)
        return nowMin >= startMin && nowMin < endMin;
    } else {
        // Midnight wrapping (e.g., 22:00 - 06:00)
        return nowMin >= startMin || nowMin < endMin;
    }
}
