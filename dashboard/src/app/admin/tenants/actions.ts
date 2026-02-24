"use server";

import { db } from "../../../storage/db";
import { tenants, tenantBalances, users, oauthClients } from "../../../storage/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as crypto from "crypto";

const createTenantSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    slug: z.string().min(2, "Slug must be at least 2 characters").regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
    initialBalance: z.coerce.number().min(0, "Balance cannot be negative").default(0),
});

export async function createTenantAction(formData: FormData) {
    try {
        const rawData = {
            name: formData.get("name") as string,
            slug: formData.get("slug") as string,
            initialBalance: formData.get("initialBalance"),
        };

        const validatedData = createTenantSchema.parse(rawData);

        // Using a transaction to ensure all related records are created together
        await db.transaction(async (tx) => {
            // 1. Create the base Tenant record
            const [newTenant] = await tx.insert(tenants).values({
                name: validatedData.name,
                slug: validatedData.slug,
                status: "active",
            }).returning();

            // 2. Initialize the Tenant's Credit Balance
            await tx.insert(tenantBalances).values({
                tenantId: newTenant.id,
                balance: validatedData.initialBalance.toFixed(4),
            });

            // 3. Automatically generate an OAuth Client for third-party CLI tools (Claude Code, Cursor)
            // They can always view these credentials in their dashboard settings later.
            const clientId = `pls_${crypto.randomBytes(16).toString("hex")}`;
            const clientSecret = crypto.randomBytes(32).toString("hex");

            await tx.insert(oauthClients).values({
                tenantId: newTenant.id,
                clientId,
                clientSecretHash: crypto.createHash('sha256').update(clientSecret).digest('hex'),
                name: "Default CLI Connection",
                redirectUris: ["http://127.0.0.1:*/oauth/callback", "http://localhost:*/oauth/callback"],
            });

            // In a real app, you would also probably create the first 'Admin' user for this specific tenant here
            // and email them a welcome link to securely set their password.
        });

        revalidatePath("/admin/tenants");
        return { success: true };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false, message: error.issues[0].message };
        }
        // Handle Postgres unique constraint violation
        if (error instanceof Error && error.message.includes("unique constraint")) {
            return { success: false, message: "A tenant with this slug already exists." };
        }
        console.error("Failed to create tenant:", error);
        return { success: false, message: "An unexpected error occurred while creating the tenant." };
    }
}

export async function deleteTenantAction(tenantId: string) {
    try {
        // Drizzle will handle cascading deletes if foreign keys are set up correctly,
        // otherwise we must transactionally delete child records first.
        await db.transaction(async (tx) => {
            // 1. Delete associated users
            await tx.delete(users).where(eq(users.tenantId, tenantId));

            // 2. Delete the OAuth clients
            await tx.delete(oauthClients).where(eq(oauthClients.tenantId, tenantId));

            // 3. Delete balance records
            await tx.delete(tenantBalances).where(eq(tenantBalances.tenantId, tenantId));

            // 4. Finally, delete the base tenant
            await tx.delete(tenants).where(eq(tenants.id, tenantId));
        });

        revalidatePath("/admin/tenants");
        return { success: true };
    } catch (error) {
        console.error("Failed to delete tenant:", error);
        return { success: false, message: "An error occurred while deleting the workspace." };
    }
}

export async function toggleTenantStatusAction(tenantId: string, currentStatus: string) {
    try {
        const newStatus = currentStatus === "active" ? "inactive" : "active";

        await db.update(tenants)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(tenants.id, tenantId));

        revalidatePath("/admin/tenants");
        return { success: true };
    } catch (error) {
        console.error("Failed to toggle tenant status:", error);
        return { success: false, message: "Failed to update workspace status." };
    }
}
