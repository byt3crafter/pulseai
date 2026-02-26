import crypto from "crypto";

export function generateSecurePassword(length = 16): string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    return Array.from(crypto.randomBytes(length))
        .map(byte => charset[byte % charset.length])
        .join("");
}
