"use server";

import { db } from "../../../storage/db";
import { users, passwordResetTokens } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { hashToken } from "../../../utils/tokens";

/**
 * Complete a password reset / invite using a token from an emailed link.
 * Sets the new password, clears mustChangePassword, marks the email verified,
 * and burns the token.
 */
export async function resetPasswordWithTokenAction(formData: FormData) {
    const token = (formData.get("token") as string) || "";
    const password = (formData.get("password") as string) || "";
    const confirmPassword = (formData.get("confirmPassword") as string) || "";

    if (!token) {
        return { success: false, message: "Invalid or missing reset link." };
    }
    if (password.length < 8) {
        return { success: false, message: "Password must be at least 8 characters." };
    }
    if (password !== confirmPassword) {
        return { success: false, message: "Passwords do not match." };
    }

    try {
        const tokenHash = hashToken(token);
        const [record] = await db
            .select()
            .from(passwordResetTokens)
            .where(eq(passwordResetTokens.tokenHash, tokenHash))
            .limit(1);

        if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
            return {
                success: false,
                message: "This link is invalid or has expired. Please request a new one.",
            };
        }

        const passwordHash = await bcrypt.hash(password, 10);
        await db.transaction(async (tx) => {
            await tx
                .update(users)
                .set({
                    passwordHash,
                    mustChangePassword: false,
                    emailVerified: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(users.id, record.userId));
            await tx
                .update(passwordResetTokens)
                .set({ usedAt: new Date() })
                .where(eq(passwordResetTokens.id, record.id));
        });

        return { success: true, message: "Your password has been set. You can now sign in." };
    } catch (error) {
        console.error("Failed to reset password:", error);
        return { success: false, message: "Failed to reset password. Please request a new link." };
    }
}
