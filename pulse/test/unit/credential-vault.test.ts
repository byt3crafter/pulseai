import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Test the encryption/decryption logic directly (same algorithm as credential-vault.ts)
// We can't import the vault directly because it depends on the DB, but we test the core crypto

describe("Credential Vault — Encryption/Decryption", () => {
    const ENCRYPTION_KEY = randomBytes(32).toString("hex");

    function encrypt(value: string, key: string): string {
        const keyBuf = Buffer.from(key, "hex");
        const iv = randomBytes(16);
        const cipher = createCipheriv("aes-256-gcm", keyBuf, iv);
        let encrypted = cipher.update(value, "utf8", "hex");
        encrypted += cipher.final("hex");
        const authTag = cipher.getAuthTag().toString("hex");
        return `${iv.toString("hex")}:${authTag}:${encrypted}`;
    }

    function decrypt(encrypted: string, key: string): string {
        const [ivHex, authTagHex, ciphertext] = encrypted.split(":");
        const keyBuf = Buffer.from(key, "hex");
        const decipher = createDecipheriv("aes-256-gcm", keyBuf, Buffer.from(ivHex, "hex"));
        decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
        let decrypted = decipher.update(ciphertext, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    }

    it("encrypts and decrypts a simple value", () => {
        const original = "sk-ant-api03-abc123";
        const encrypted = encrypt(original, ENCRYPTION_KEY);
        expect(encrypted).not.toBe(original);
        expect(encrypted).toContain(":");

        const decrypted = decrypt(encrypted, ENCRYPTION_KEY);
        expect(decrypted).toBe(original);
    });

    it("produces different ciphertext for same input (random IV)", () => {
        const original = "same-value-123";
        const encrypted1 = encrypt(original, ENCRYPTION_KEY);
        const encrypted2 = encrypt(original, ENCRYPTION_KEY);
        expect(encrypted1).not.toBe(encrypted2);

        // But both decrypt to the same value
        expect(decrypt(encrypted1, ENCRYPTION_KEY)).toBe(original);
        expect(decrypt(encrypted2, ENCRYPTION_KEY)).toBe(original);
    });

    it("handles empty string", () => {
        const encrypted = encrypt("", ENCRYPTION_KEY);
        expect(decrypt(encrypted, ENCRYPTION_KEY)).toBe("");
    });

    it("handles long values", () => {
        const longValue = "a".repeat(10000);
        const encrypted = encrypt(longValue, ENCRYPTION_KEY);
        expect(decrypt(encrypted, ENCRYPTION_KEY)).toBe(longValue);
    });

    it("handles special characters", () => {
        const special = 'p@ssw0rd!#$%^&*(){}[]"<>';
        const encrypted = encrypt(special, ENCRYPTION_KEY);
        expect(decrypt(encrypted, ENCRYPTION_KEY)).toBe(special);
    });

    it("handles unicode characters", () => {
        const unicode = "credential-value-with-unicode-Rpassword";
        const encrypted = encrypt(unicode, ENCRYPTION_KEY);
        expect(decrypt(encrypted, ENCRYPTION_KEY)).toBe(unicode);
    });

    it("fails with wrong key", () => {
        const encrypted = encrypt("secret", ENCRYPTION_KEY);
        const wrongKey = randomBytes(32).toString("hex");
        expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    it("encrypted format is iv:authTag:ciphertext", () => {
        const encrypted = encrypt("test", ENCRYPTION_KEY);
        const parts = encrypted.split(":");
        expect(parts).toHaveLength(3);
        expect(parts[0]).toHaveLength(32); // IV is 16 bytes = 32 hex chars
        expect(parts[1]).toHaveLength(32); // Auth tag is 16 bytes = 32 hex chars
        expect(parts[2].length).toBeGreaterThan(0); // Ciphertext
    });
});
