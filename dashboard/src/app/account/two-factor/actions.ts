"use server";

import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import { users } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { encrypt, decrypt } from "../../../utils/crypto";
import { generateTotpSecret, totpQrDataUrl, verifyTotp } from "../../../utils/totp";
import { logAudit } from "../../../utils/audit";
import { isRateLimited } from "../../../utils/rate-limit";

async function currentUserId(): Promise<string | null> {
    const session = await auth().catch(() => null);
    return session?.user?.id ?? null;
}

export async function getTwoFactorStatus() {
    const uid = await currentUserId();
    if (!uid) return { enabled: false };
    const [u] = await db.select({ e: users.twoFactorEnabled }).from(users).where(eq(users.id, uid)).limit(1);
    return { enabled: !!u?.e };
}

/** Generate a fresh secret, store it (encrypted, not yet enabled), return QR + secret. */
export async function startTwoFactorSetup() {
    const uid = await currentUserId();
    if (!uid) return { success: false, message: "Unauthorized" };
    const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (!u) return { success: false, message: "Unauthorized" };

    const secret = generateTotpSecret();
    await db.update(users)
        .set({ twoFactorSecret: encrypt(secret), twoFactorEnabled: false, updatedAt: new Date() })
        .where(eq(users.id, uid));

    const qr = await totpQrDataUrl(u.email, secret);
    return { success: true, secret, qr };
}

/** Verify a code against the pending secret and turn 2FA on. */
export async function confirmTwoFactor(code: string) {
    const uid = await currentUserId();
    if (!uid) return { success: false, message: "Unauthorized" };
    const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (!u?.twoFactorSecret) return { success: false, message: "Start setup first." };

    let secret: string;
    try {
        secret = decrypt(u.twoFactorSecret);
    } catch {
        return { success: false, message: "Setup expired — start again." };
    }
    if (!verifyTotp(secret, code)) return { success: false, message: "Invalid code. Try again." };

    await db.update(users).set({ twoFactorEnabled: true, updatedAt: new Date() }).where(eq(users.id, uid));
    await logAudit({ action: "user.2fa.enable", targetType: "user", targetId: uid, summary: "Enabled two-factor auth" });
    return { success: true };
}

/** Disable 2FA after confirming a current code. */
export async function disableTwoFactor(code: string) {
    const uid = await currentUserId();
    if (!uid) return { success: false, message: "Unauthorized" };
    const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (!u?.twoFactorEnabled || !u.twoFactorSecret) return { success: false, message: "2FA is not enabled." };

    let secret = "";
    try {
        secret = decrypt(u.twoFactorSecret);
    } catch {
        secret = "";
    }
    if (!secret || !verifyTotp(secret, code)) return { success: false, message: "Invalid code." };

    await db.update(users)
        .set({ twoFactorEnabled: false, twoFactorSecret: null, updatedAt: new Date() })
        .where(eq(users.id, uid));
    await logAudit({ action: "user.2fa.disable", targetType: "user", targetId: uid, summary: "Disabled two-factor auth" });
    return { success: true };
}

/**
 * Login step 1: verify email+password WITHOUT creating a session, and report
 * whether a TOTP code is required. Rate-limited per IP.
 */
export async function preAuthCheck(email: string, password: string) {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "unknown";
    if (isRateLimited(ip)) return { valid: false, needs2fa: false, rateLimited: true };

    try {
        const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!u) return { valid: false, needs2fa: false };
        const ok = await bcrypt.compare(password, u.passwordHash);
        if (!ok) return { valid: false, needs2fa: false };
        return { valid: true, needs2fa: !!u.twoFactorEnabled };
    } catch {
        return { valid: false, needs2fa: false };
    }
}
