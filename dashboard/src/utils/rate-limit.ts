/**
 * Simple in-memory sliding window rate limiter for Next.js middleware.
 * No external dependencies — uses a Map with TTL-based cleanup.
 */

const windowMs = 60_000; // 1 minute window
const maxAttempts = 10;  // max attempts per window

const attempts = new Map<string, number[]>();

let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60_000; // cleanup stale entries every 5 min

function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;

    const cutoff = now - windowMs;
    for (const [key, timestamps] of attempts) {
        const valid = timestamps.filter((t) => t > cutoff);
        if (valid.length === 0) {
            attempts.delete(key);
        } else {
            attempts.set(key, valid);
        }
    }
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
