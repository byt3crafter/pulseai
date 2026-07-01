"use server";

import { db } from "../../storage/db";
import { users, passwordResetTokens } from "../../storage/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { generateToken, hashToken } from "../../utils/tokens";
import { sendPasswordResetEmail, appBaseUrl } from "../../utils/mailer";
import { isRateLimited } from "../../utils/rate-limit";

/**
 * Request a password reset. Always returns a generic success message to avoid
 * leaking which emails have accounts. Rate-limited per IP.
 */
export async function requestPasswordResetAction(formData: FormData) {
    const email = ((formData.get("email") as string) || "").trim();

    const hdrs = await headers();
    const ip =
        hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        hdrs.get("x-real-ip") ||
        "unknown";
    if (isRateLimited(ip)) {
        return { success: false, message: "Too many requests. Please try again shortly." };
    }

    const generic = {
        success: true,
        message: "If an account exists for that email, a password reset link has been sent.",
    };

    if (!email) return generic;

    try {
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (user) {
            const raw = generateToken();
            await db.insert(passwordResetTokens).values({
                userId: user.id,
                tokenHash: hashToken(raw),
                type: "reset",
                expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
            });
            await sendPasswordResetEmail(user.email, `${appBaseUrl()}/reset/${raw}`);
        }
    } catch (error) {
        console.error("Failed to process password reset request:", error);
    }

    return generic;
}
