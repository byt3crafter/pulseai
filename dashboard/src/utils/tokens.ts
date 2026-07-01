import crypto from "crypto";

/**
 * Generate a high-entropy, URL-safe token to email to a user.
 * The raw value is sent in the reset/invite link; only its hash is stored.
 */
export function generateToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

/** SHA-256 hash of a token — what we persist in password_reset_tokens.token_hash. */
export function hashToken(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
}
