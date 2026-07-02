import "server-only";
import { authenticator } from "otplib";
import QRCode from "qrcode";

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
