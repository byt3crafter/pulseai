"use server";

import { db } from "../../../storage/db";
import { users, tenants, passwordResetTokens } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { generateSecurePassword } from "../../../utils/password";
import { requireAdmin } from "../../../utils/admin-auth";
import { generateToken, hashToken } from "../../../utils/tokens";
import { sendInviteEmail, appBaseUrl } from "../../../utils/mailer";
import { logAudit } from "../../../utils/audit";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Create an invite token for a freshly-created user and email them a
 * set-password link. Best-effort: never throws, so account creation succeeds
 * even if email delivery fails.
 */
async function sendInvite(userId: string, email: string, name: string | null) {
    try {
        const raw = generateToken();
        await db.insert(passwordResetTokens).values({
            userId,
            tokenHash: hashToken(raw),
            type: "invite",
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        });
        await sendInviteEmail(email, name, `${appBaseUrl()}/reset/${raw}`);
    } catch (error) {
        console.error("Failed to send invite email:", error);
    }
}

export async function createUserAction(formData: FormData) {
    try {
        const adminCheck = await requireAdmin();
        if (!adminCheck.authorized) {
            return { success: false, message: adminCheck.message };
        }

        const email = formData.get("email") as string;
        const name = formData.get("name") as string;
        const role = formData.get("role") as string;
        const tenantId = formData.get("tenantId") as string;

        if (!email || !name || !role) {
            return { success: false, message: "Email, name, and role are required." };
        }

        if (role === "TENANT" && !tenantId) {
            return { success: false, message: "Tenant users must be assigned to a workspace." };
        }

        const tempPassword = generateSecurePassword(16);
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        const [created] = await db.insert(users).values({
            email,
            name,
            passwordHash,
            role,
            tenantId: role === "TENANT" ? tenantId : null,
            mustChangePassword: true,
        }).returning({ id: users.id });

        await sendInvite(created.id, email, name);
        await logAudit({
            action: "user.create",
            targetType: "user",
            targetId: created.id,
            summary: `Created user ${email} (${role})`,
            metadata: { email, role },
        });

        revalidatePath("/admin/users");
        return {
            success: true,
            credentials: { email, password: tempPassword },
        };
    } catch (error) {
        if (error instanceof Error && error.message.includes("users_email_unique")) {
            return { success: false, message: "A user with this email already exists." };
        }
        console.error("Failed to create user:", error);
        return { success: false, message: "Failed to create user." };
    }
}

export async function resetPasswordAction(userId: string) {
    try {
        const adminCheck = await requireAdmin();
        if (!adminCheck.authorized) {
            return { success: false, message: adminCheck.message };
        }

        const tempPassword = generateSecurePassword(16);
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        await db
            .update(users)
            .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
            .where(eq(users.id, userId));

        await logAudit({ action: "user.reset_password", targetType: "user", targetId: userId });
        revalidatePath("/admin/users");
        return { success: true, tempPassword };
    } catch (error) {
        console.error("Failed to reset password:", error);
        return { success: false, message: "Failed to reset password." };
    }
}

export async function deleteUserAction(userId: string) {
    try {
        const adminCheck = await requireAdmin();
        if (!adminCheck.authorized) {
            return { success: false, message: adminCheck.message };
        }

        // Prevent self-delete
        if (adminCheck.userId === userId) {
            return { success: false, message: "You cannot delete your own account." };
        }

        // Check if user belongs to a tenant — those users are deleted via tenant deletion
        const [user] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, userId));
        if (user?.tenantId) {
            return { success: false, message: "This user belongs to a workspace. Delete the workspace to remove its users." };
        }

        await db.delete(users).where(eq(users.id, userId));
        await logAudit({ action: "user.delete", targetType: "user", targetId: userId });
        revalidatePath("/admin/users");
        return { success: true };
    } catch (error) {
        console.error("Failed to delete user:", error);
        return { success: false, message: "Failed to delete user." };
    }
}
