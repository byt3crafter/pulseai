/**
 * Password Generator Tests
 *
 * Tests the generateSecurePassword function defined in
 * dashboard/src/utils/password.ts.
 *
 * That module is a pure function (no external deps) located outside the pulse
 * package root, so it cannot be imported as an ES module from here.
 * The function is small enough that we replicate it verbatim and test the
 * contract — any change to the source must be reflected here.
 *
 * Source (dashboard/src/utils/password.ts):
 *
 *   import crypto from "crypto";
 *   export function generateSecurePassword(length = 16): string {
 *       const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
 *       return Array.from(crypto.randomBytes(length))
 *           .map(byte => charset[byte % charset.length])
 *           .join("");
 *   }
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";

// ─── Function under test (replicated from dashboard/src/utils/password.ts) ───

function generateSecurePassword(length = 16): string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    return Array.from(crypto.randomBytes(length))
        .map(byte => charset[byte % charset.length])
        .join("");
}

// ─── Character set ────────────────────────────────────────────────────────────

const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
const CHARSET_SET = new Set(CHARSET.split(""));

// ─── Length ───────────────────────────────────────────────────────────────────

describe("generateSecurePassword — length", () => {
    it("returns a string of the default length (16)", () => {
        expect(generateSecurePassword()).toHaveLength(16);
    });

    it("returns a string of length 1 when asked", () => {
        expect(generateSecurePassword(1)).toHaveLength(1);
    });

    it("returns a string of length 8", () => {
        expect(generateSecurePassword(8)).toHaveLength(8);
    });

    it("returns a string of length 32", () => {
        expect(generateSecurePassword(32)).toHaveLength(32);
    });

    it("returns a string of length 64", () => {
        expect(generateSecurePassword(64)).toHaveLength(64);
    });

    it("returns a string of length 128", () => {
        expect(generateSecurePassword(128)).toHaveLength(128);
    });

    it("returns a string of length 0 when length is 0", () => {
        expect(generateSecurePassword(0)).toHaveLength(0);
    });
});

// ─── Charset conformance ──────────────────────────────────────────────────────

describe("generateSecurePassword — charset conformance", () => {
    it("every character in a generated password is from the allowed charset", () => {
        for (let i = 0; i < 20; i++) {
            const pw = generateSecurePassword(32);
            for (const char of pw) {
                expect(CHARSET_SET.has(char), `unexpected character '${char}' in password`).toBe(true);
            }
        }
    });

    it("charset has exactly 70 characters", () => {
        // Sanity-check that the charset we're testing against matches the source
        expect(CHARSET).toHaveLength(70);
    });
});

// ─── Randomness ───────────────────────────────────────────────────────────────

describe("generateSecurePassword — randomness", () => {
    it("two consecutive calls return different values (with overwhelming probability)", () => {
        // The chance of two 16-char passwords from a 70-char set being equal
        // is (1/70)^16 ≈ 10^-29 — effectively impossible.
        expect(generateSecurePassword()).not.toBe(generateSecurePassword());
    });

    it("over 1000 passwords all character classes appear at least once", () => {
        const seen = new Set<string>();
        for (let i = 0; i < 1000; i++) {
            for (const ch of generateSecurePassword(16)) {
                seen.add(ch);
            }
        }
        // Every charset character should appear across 1000 * 16 = 16 000 samples
        for (const ch of CHARSET) {
            expect(seen.has(ch), `character '${ch}' never appeared in 1000 passwords`).toBe(true);
        }
    });

    it("lowercase letters appear in generated passwords", () => {
        const samples = Array.from({ length: 100 }, () => generateSecurePassword(32)).join("");
        expect(/[a-z]/.test(samples)).toBe(true);
    });

    it("uppercase letters appear in generated passwords", () => {
        const samples = Array.from({ length: 100 }, () => generateSecurePassword(32)).join("");
        expect(/[A-Z]/.test(samples)).toBe(true);
    });

    it("digits appear in generated passwords", () => {
        const samples = Array.from({ length: 100 }, () => generateSecurePassword(32)).join("");
        expect(/[0-9]/.test(samples)).toBe(true);
    });

    it("special characters appear in generated passwords", () => {
        const samples = Array.from({ length: 100 }, () => generateSecurePassword(32)).join("");
        expect(/[!@#$%^&*]/.test(samples)).toBe(true);
    });
});

// ─── Return type ──────────────────────────────────────────────────────────────

describe("generateSecurePassword — return type", () => {
    it("returns a string", () => {
        expect(typeof generateSecurePassword()).toBe("string");
    });
});
