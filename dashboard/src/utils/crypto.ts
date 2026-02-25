import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { config } from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM optimal IV length is 12 bytes
const AUTH_TAG_LENGTH = 16;

// Ensure the encryption key from env is 32 bytes
const encryptionKeyBuffer = Buffer.from(config.ENCRYPTION_KEY, "hex");

/**
 * Encrypts a plaintext string (e.g. Claude API Key for a tenant)
 * Returns a self-contained ciphertext payload containing IV:AuthTag:Ciphertext
 */
export function encrypt(plaintext: string): string {
    if (!plaintext) return "";
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, encryptionKeyBuffer, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: iv(hex):authTag(hex):encrypted(hex)
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a payload back to plaintext. 
 */
export function decrypt(payload: string): string {
    if (!payload) return "";
    const parts = payload.split(":");
    if (parts.length !== 3) {
        throw new Error("Invalid encryption payload format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encryptedText = Buffer.from(parts[2], "hex");

    const decipher = createDecipheriv(ALGORITHM, encryptionKeyBuffer, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString("utf8");
}

/**
 * One-way hash for API keys used by the tenant to access the gateway.
 */
export function hashApiKey(apiKey: string): string {
    return createHash("sha256").update(apiKey).digest("hex");
}
