/**
 * Rate Limiter Tests
 *
 * Tests the sliding-window rate limiter logic from dashboard/src/utils/rate-limit.ts.
 * Because that module uses module-level shared state (a singleton Map), we
 * replicate the same algorithm here so each test suite gets a fresh instance
 * and tests remain deterministic.
 *
 * The constants match the production values:
 *   - windowMs  = 60 000 ms (1 minute)
 *   - maxAttempts = 10
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// ─── Replicated rate-limiter factory (mirrors rate-limit.ts logic) ────────────

function createRateLimiter(windowMs = 60_000, maxAttempts = 10) {
    const attempts = new Map<string, number[]>();

    return {
        isRateLimited(ip: string): boolean {
            const now = Date.now();
            const cutoff = now - windowMs;
            const timestamps = attempts.get(ip) ?? [];
            const valid = timestamps.filter((t) => t > cutoff);
            valid.push(now);
            attempts.set(ip, valid);
            return valid.length > maxAttempts;
        },
        /** Exposed for testing only — direct access to the internal map. */
        _attempts: attempts,
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("isRateLimited — within window", () => {
    it("allows the first request", () => {
        const rl = createRateLimiter();
        expect(rl.isRateLimited("1.2.3.4")).toBe(false);
    });

    it("allows up to maxAttempts (10) requests", () => {
        const rl = createRateLimiter();
        for (let i = 0; i < 10; i++) {
            expect(rl.isRateLimited("1.2.3.4"), `request #${i + 1}`).toBe(false);
        }
    });

    it("blocks the 11th request within the window", () => {
        const rl = createRateLimiter();
        for (let i = 0; i < 10; i++) {
            rl.isRateLimited("1.2.3.4");
        }
        expect(rl.isRateLimited("1.2.3.4")).toBe(true);
    });

    it("continues blocking on subsequent over-limit requests", () => {
        const rl = createRateLimiter();
        for (let i = 0; i < 10; i++) {
            rl.isRateLimited("5.5.5.5");
        }
        expect(rl.isRateLimited("5.5.5.5")).toBe(true);
        expect(rl.isRateLimited("5.5.5.5")).toBe(true);
    });
});

describe("isRateLimited — window expiry", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("resets the count after the window has elapsed", () => {
        vi.useFakeTimers();
        const rl = createRateLimiter(60_000, 10);

        // Use up all 10 attempts at t=0
        for (let i = 0; i < 10; i++) {
            rl.isRateLimited("9.9.9.9");
        }
        expect(rl.isRateLimited("9.9.9.9")).toBe(true);

        // Advance past the window (61 seconds)
        vi.advanceTimersByTime(61_000);

        // Now the old timestamps are outside the window — should be allowed again
        expect(rl.isRateLimited("9.9.9.9")).toBe(false);
    });

    it("partially expired window keeps unexpired timestamps in count", () => {
        vi.useFakeTimers();
        const rl = createRateLimiter(60_000, 10);

        // 5 attempts at t=0
        for (let i = 0; i < 5; i++) {
            rl.isRateLimited("7.7.7.7");
        }

        // Advance 30 seconds — first 5 attempts are still within the 60 s window
        vi.advanceTimersByTime(30_000);

        // 5 more attempts at t=30s — total in-window count is now 10
        for (let i = 0; i < 5; i++) {
            rl.isRateLimited("7.7.7.7");
        }

        // 11th attempt at t=30s — should be rate-limited (10 valid still in window)
        expect(rl.isRateLimited("7.7.7.7")).toBe(true);

        // Advance another 31 seconds (t=61s) — first 5 attempts now expire
        vi.advanceTimersByTime(31_000);

        // Only the 5 attempts from t=30s remain (+ 1 from the blocked attempt at ~t=30s)
        // That is at most 6 in-window — a new request should NOT be blocked
        expect(rl.isRateLimited("7.7.7.7")).toBe(false);
    });
});

describe("isRateLimited — IP isolation", () => {
    it("different IPs have independent counters", () => {
        const rl = createRateLimiter();

        // Exhaust the limit for IP A
        for (let i = 0; i < 10; i++) {
            rl.isRateLimited("10.0.0.1");
        }

        // IP B should still have a clean slate
        expect(rl.isRateLimited("10.0.0.2")).toBe(false);
    });

    it("rate-limiting IP A does not affect IP B", () => {
        const rl = createRateLimiter();
        for (let i = 0; i < 11; i++) {
            rl.isRateLimited("192.168.1.1");
        }
        // IP A is now blocked
        expect(rl.isRateLimited("192.168.1.1")).toBe(true);

        // IP B is unaffected
        expect(rl.isRateLimited("192.168.1.2")).toBe(false);
    });

    it("many different IPs can all be tracked independently", () => {
        const rl = createRateLimiter();
        const ips = Array.from({ length: 50 }, (_, i) => `10.${i}.0.1`);

        for (const ip of ips) {
            // One request each — none should be limited
            expect(rl.isRateLimited(ip)).toBe(false);
        }
    });
});

describe("isRateLimited — edge cases", () => {
    it("a single-attempt limit blocks on the second request", () => {
        const rl = createRateLimiter(60_000, 1);
        expect(rl.isRateLimited("1.1.1.1")).toBe(false); // first request allowed
        expect(rl.isRateLimited("1.1.1.1")).toBe(true);  // second request blocked
    });

    it("treats different string keys as separate IPs (IPv6 vs IPv4)", () => {
        const rl = createRateLimiter();
        for (let i = 0; i < 10; i++) {
            rl.isRateLimited("::1");
        }
        expect(rl.isRateLimited("::1")).toBe(true);
        expect(rl.isRateLimited("127.0.0.1")).toBe(false);
    });
});
