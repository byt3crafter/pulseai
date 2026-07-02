/**
 * TOTP + recovery-code verification for the gateway (mirrors the dashboard's
 * logic so the app can't bypass 2FA). Secrets/backup hashes are shared via the
 * same DB + ENCRYPTION_KEY.
 */
import { authenticator } from "otplib";
import { createHash } from "crypto";

authenticator.options = { window: 1 };

export function verifyTotp(secret: string, token: string): boolean {
    const clean = (token || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) return false;
    try {
        return authenticator.verify({ token: clean, secret });
    } catch {
        return false;
    }
}

export function hashBackupCode(code: string): string {
    return createHash("sha256").update(code.replace(/\s/g, "").toLowerCase()).digest("hex");
}

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
