"use server";

import { db } from "../../../storage/db";
import { users, tenants } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { generateSecurePassword } from "../../../utils/password";
import { auth } from "../../../auth";

export async function createUserAction(formData: FormData) {
    try {
        const session = await auth();
        if (session?.user?.role !== "ADMIN") {
            return { success: false, message: "Unauthorized." };
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

        await db.insert(users).values({
            email,
            name,
            passwordHash,
            role,
            tenantId: role === "TENANT" ? tenantId : null,
            mustChangePassword: true,
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
        const session = await auth();
        if (session?.user?.role !== "ADMIN") {
            return { success: false, message: "Unauthorized." };
        }

        const tempPassword = generateSecurePassword(16);
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        await db
            .update(users)
            .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
            .where(eq(users.id, userId));

        revalidatePath("/admin/users");
        return { success: true, tempPassword };
    } catch (error) {
        console.error("Failed to reset password:", error);
        return { success: false, message: "Failed to reset password." };
    }
}

export async function deleteUserAction(userId: string) {
    try {
        const session = await auth();
        if (session?.user?.role !== "ADMIN") {
            return { success: false, message: "Unauthorized." };
        }

        // Prevent self-delete
        if (session.user.id === userId) {
            return { success: false, message: "You cannot delete your own account." };
        }

        await db.delete(users).where(eq(users.id, userId));
        revalidatePath("/admin/users");
        return { success: true };
    } catch (error) {
        console.error("Failed to delete user:", error);
        return { success: false, message: "Failed to delete user." };
    }
}
