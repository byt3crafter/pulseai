/**
 * Crypto Utility Tests
 *
 * Verifies the AES-256-GCM encrypt/decrypt implementation for correctness,
 * uniqueness of IVs, tamper detection via auth tags, and edge-case inputs.
 */
import { describe, it, expect, vi } from "vitest";

// Mock config before the module under test is imported, since it reads
// config.ENCRYPTION_KEY at module load time.
// NOTE: vi.mock factories are hoisted before variable declarations, so
// TEST_KEY must be a literal string here (no variable references allowed).
vi.mock("../config.js", () => ({
    config: {
        // 64 hex chars = valid 32-byte AES-256 key
        ENCRYPTION_KEY: "0000000000000000000000000000000000000000000000000000000000000000",
    },
}));

// Import after mocking so the module uses our test key
import { encrypt, decrypt, hashApiKey } from "../utils/crypto.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tamper with a single hex character at `hexOffset` within the payload part. */
function tamperHexAt(hex: string, hexOffset: number): string {
    const chars = hex.split("");
    const original = parseInt(chars[hexOffset], 16);
    chars[hexOffset] = ((original + 1) % 16).toString(16);
    return chars.join("");
}

// ─── encrypt / decrypt ────────────────────────────────────────────────────────

describe("encrypt", () => {
    it("returns empty string for empty input", () => {
        expect(encrypt("")).toBe("");
    });

    it("returns a non-empty string for non-empty input", () => {
        expect(encrypt("hello")).not.toBe("");
    });

    it("output has three colon-separated parts (iv:authTag:ciphertext)", () => {
        const payload = encrypt("test value");
        const parts = payload.split(":");
        expect(parts).toHaveLength(3);
    });

    it("iv part is 24 hex characters (12 bytes)", () => {
        const parts = encrypt("test").split(":");
        expect(parts[0]).toHaveLength(24);
        expect(parts[0]).toMatch(/^[0-9a-f]+$/i);
    });

    it("auth tag part is 32 hex characters (16 bytes)", () => {
        const parts = encrypt("test").split(":");
        expect(parts[1]).toHaveLength(32);
        expect(parts[1]).toMatch(/^[0-9a-f]+$/i);
    });

    it("ciphertext part is valid hex", () => {
        const parts = encrypt("hello world").split(":");
        expect(parts[2]).toMatch(/^[0-9a-f]+$/i);
    });

    it("produces a unique IV on every call (two encryptions of the same value differ)", () => {
        const a = encrypt("same input");
        const b = encrypt("same input");
        expect(a).not.toBe(b);
        // Different IVs specifically
        expect(a.split(":")[0]).not.toBe(b.split(":")[0]);
    });
});

describe("decrypt", () => {
    it("returns empty string for empty input", () => {
        expect(decrypt("")).toBe("");
    });

    it("round-trips a short string", () => {
        expect(decrypt(encrypt("hello"))).toBe("hello");
    });

    it("round-trips a long string", () => {
        const long = "a".repeat(10_000);
        expect(decrypt(encrypt(long))).toBe(long);
    });

    it("round-trips a unicode string", () => {
        const unicode = "こんにちは世界 🌍 emoji test";
        expect(decrypt(encrypt(unicode))).toBe(unicode);
    });

    it("round-trips special characters and symbols", () => {
        const special = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~\\";
        expect(decrypt(encrypt(special))).toBe(special);
    });

    it("round-trips an empty-ish single-character string", () => {
        expect(decrypt(encrypt("x"))).toBe("x");
    });

    it("round-trips a newline and whitespace string", () => {
        const ws = "  line one\n\tline two\r\n";
        expect(decrypt(encrypt(ws))).toBe(ws);
    });

    it("throws on payload with wrong number of segments", () => {
        expect(() => decrypt("only:twosegments")).toThrow("Invalid encryption payload format");
        expect(() => decrypt("one")).toThrow("Invalid encryption payload format");
        expect(() => decrypt("a:b:c:d")).toThrow("Invalid encryption payload format");
    });

    it("throws when ciphertext is tampered (auth tag mismatch)", () => {
        const payload = encrypt("sensitive data");
        const parts = payload.split(":");
        // Tamper the first hex character of the ciphertext
        const tamperedCiphertext = tamperHexAt(parts[2], 0);
        const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;
        expect(() => decrypt(tampered)).toThrow();
    });

    it("throws when auth tag is tampered", () => {
        const payload = encrypt("sensitive data");
        const parts = payload.split(":");
        // Tamper the first hex character of the auth tag
        const tamperedTag = tamperHexAt(parts[1], 0);
        const tampered = `${parts[0]}:${tamperedTag}:${parts[2]}`;
        expect(() => decrypt(tampered)).toThrow();
    });

    it("throws when IV is tampered (produces wrong decryption, caught by auth tag)", () => {
        const payload = encrypt("sensitive data");
        const parts = payload.split(":");
        const tamperedIv = tamperHexAt(parts[0], 0);
        const tampered = `${tamperedIv}:${parts[1]}:${parts[2]}`;
        expect(() => decrypt(tampered)).toThrow();
    });
});

// ─── hashApiKey ───────────────────────────────────────────────────────────────

describe("hashApiKey", () => {
    it("returns a 64-character hex string (SHA-256)", () => {
        const hash = hashApiKey("sk-test-key");
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic — same input always produces same hash", () => {
        expect(hashApiKey("my-api-key")).toBe(hashApiKey("my-api-key"));
    });

    it("different inputs produce different hashes", () => {
        expect(hashApiKey("key-a")).not.toBe(hashApiKey("key-b"));
    });

    it("is a one-way function — does not equal input", () => {
        const key = "sk-ant-api-somekey";
        expect(hashApiKey(key)).not.toBe(key);
    });
});
