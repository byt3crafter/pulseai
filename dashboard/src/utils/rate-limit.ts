/**
 * Simple in-memory sliding window rate limiter for Next.js middleware.
 * No external dependencies — uses a Map with TTL-based cleanup.
 */

const windowMs = 60_000; // 1 minute window
const maxAttempts = 10;  // max attempts per window

const attempts = new Map<string, number[]>();

let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60_000; // cleanup stale entries every 5 min
// Hard cap on distinct keys. A caller that varies its key every request (e.g.
// spoofed X-Forwarded-For) could otherwise grow this map without bound between
// the 5-minute cleanups. When exceeded we force an immediate sweep, and if it's
// still over cap we drop the oldest entries — memory can't run away.
const MAX_KEYS = 10_000;

function sweep() {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of attempts) {
        const valid = timestamps.filter((t) => t > cutoff);
        if (valid.length === 0) attempts.delete(key);
        else attempts.set(key, valid);
    }
}

function cleanup() {
    const now = Date.now();
    if (attempts.size > MAX_KEYS) {
        // Over cap — sweep now regardless of the interval.
        sweep();
        // Still over cap after removing stale windows → evict oldest-inserted
        // keys (Map preserves insertion order) to enforce the bound.
        while (attempts.size > MAX_KEYS) {
            const oldest = attempts.keys().next().value;
            if (oldest === undefined) break;
            attempts.delete(oldest);
        }
        lastCleanup = now;
        return;
    }
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    sweep();
}

export function isRateLimited(ip: string): boolean {
    cleanup();

    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = attempts.get(ip) || [];
    const valid = timestamps.filter((t) => t > cutoff);
    valid.push(now);
    attempts.set(ip, valid);

    return valid.length > maxAttempts;
}
