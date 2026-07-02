import "server-only";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { createHash, randomBytes } from "crypto";

/**
 * TOTP (RFC 6238) helpers for two-factor auth. Secrets are generated here and
 * stored AES-encrypted on the user row; verification allows ±1 time step to
 * tolerate clock drift.
 */

authenticator.options = { window: 1 };

const ISSUER = "Pulse AI";

export function generateTotpSecret(): string {
    return authenticator.generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
    return authenticator.keyuri(email, ISSUER, secret);
}

export async function totpQrDataUrl(email: string, secret: string): Promise<string> {
    return QRCode.toDataURL(totpKeyUri(email, secret), { margin: 1, width: 200 });
}

export function verifyTotp(secret: string, token: string): boolean {
    const clean = (token || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) return false;
    try {
        return authenticator.verify({ token: clean, secret });
    } catch {
        return false;
    }
}

// ── Recovery / backup codes ──────────────────────────────────────────────
/** Generate N human-friendly one-time recovery codes (plaintext, shown once). */
export function generateBackupCodes(n = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < n; i++) {
        const hex = randomBytes(4).toString("hex"); // 8 hex chars
        codes.push(`${hex.slice(0, 4)}-${hex.slice(4)}`);
    }
    return codes;
}

export function hashBackupCode(code: string): string {
    return createHash("sha256").update(code.replace(/\s/g, "").toLowerCase()).digest("hex");
}

/**
 * Verify a second factor: a 6-digit TOTP OR a one-time backup code. When a
 * backup code matches it is consumed — the caller must persist `remaining`.
 */
export function checkSecondFactor(
    secret: string | null,
    backupHashes: string[],
    code: string,
): { ok: boolean; viaBackup: boolean; remaining: string[] } {
    const clean = (code || "").replace(/\s/g, "");
    if (secret && /^\d{6}$/.test(clean) && verifyTotp(secret, clean)) {
        return { ok: true, viaBackup: false, remaining: backupHashes };
    }
    const h = hashBackupCode(clean);
    if (clean && backupHashes.includes(h)) {
        return { ok: true, viaBackup: true, remaining: backupHashes.filter((x) => x !== h) };
    }
    return { ok: false, viaBackup: false, remaining: backupHashes };
}
