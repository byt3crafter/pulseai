"use server";

import { db } from "../../../storage/db";
import { tenants, tenantBalances, users, oauthClients } from "../../../storage/schema";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import * as crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateSecurePassword } from "../../../utils/password";
import { requireAdmin } from "../../../utils/admin-auth";

const createTenantSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    customerEmail: z.string().email("Please enter a valid customer email address"),
    slug: z.string().min(2, "Slug must be at least 2 characters").regex(/^[-a-z0-9]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
    initialBalance: z.coerce.number().min(0, "Balance cannot be negative").default(0),
});

export async function createTenantAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) {
        return { success: false, message: adminCheck.message };
    }

    try {
        const rawData = {
            name: formData.get("name") as string,
            customerEmail: formData.get("customerEmail") as string,
            slug: formData.get("slug") as string,
            initialBalance: formData.get("initialBalance"),
        };

        const validatedData = createTenantSchema.parse(rawData);

        const credentials = await db.transaction(async (tx) => {
            const [newTenant] = await tx.insert(tenants).values({
                name: validatedData.name,
                slug: validatedData.slug,
                status: "active",
            }).returning();

            await tx.insert(tenantBalances).values({
                tenantId: newTenant.id,
                balance: validatedData.initialBalance.toFixed(4),
            });

            const clientId = `pls_${crypto.randomBytes(16).toString("hex")}`;
            const clientSecret = crypto.randomBytes(32).toString("hex");

            await tx.insert(oauthClients).values({
                tenantId: newTenant.id,
                clientId,
                clientSecretHash: crypto.createHash('sha256').update(clientSecret).digest('hex'),
                name: "Default CLI Connection",
                redirectUris: ["http://127.0.0.1:*/oauth/callback", "http://localhost:*/oauth/callback"],
            });

            const userEmail = validatedData.customerEmail;
            const tempPassword = generateSecurePassword(16);
            const passwordHash = await bcrypt.hash(tempPassword, 10);

            await tx.insert(users).values({
                name: `${validatedData.name} Admin`,
                email: userEmail,
                passwordHash,
                role: "TENANT",
                tenantId: newTenant.id,
                mustChangePassword: true,
                onboardingComplete: false,
            });

            return { clientId, clientSecret, initialUser: { email: userEmail, password: tempPassword } };
        });

        revalidatePath("/admin/tenants");
        return { success: true, credentials };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false, message: error.issues[0].message };
        }
        if (error instanceof Error && error.message.includes("unique constraint")) {
            if (error.message.includes("users_email_unique")) {
                return { success: false, message: "A workspace admin user with this slug already exists. The slug must be unique." };
            }
            return { success: false, message: "A tenant with this slug already exists." };
        }
        console.error("Failed to create tenant:", error);
        return { success: false, message: "An unexpected error occurred while creating the tenant." };
    }
}

export async function deleteTenantAction(tenantId: string) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) {
        return { success: false, message: adminCheck.message };
    }

    try {
        // Delete all dependent data in correct FK order inside a transaction.
        // Each query runs as a separate parameterized statement (Postgres doesn't
        // support multiple parameterized statements in a single execute call).
        await db.transaction(async (tx) => {
            // Leaf tables (no other table references these via FK)
            await tx.execute(sql`DELETE FROM api_tokens WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM tenant_provider_keys WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM tenant_plugin_configs WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM exec_policy_rules WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM exec_audit_log WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM agent_delegations WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM credentials WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM agent_scripts WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM memory_entries WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM job_runs WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM scheduled_jobs WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM pairing_codes WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM workspace_revisions WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM usage_records WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM messages WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM conversations WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM allowlists WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM tenant_skills WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM ledger_transactions WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM oauth_tokens WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM oauth_codes WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM channel_connections WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM routing_rules WHERE tenant_id = ${tenantId}::uuid`);
            // MCP bindings reference agent_profiles, so delete before agents
            await tx.execute(sql`DELETE FROM agent_profile_mcp_bindings WHERE agent_profile_id IN (SELECT id FROM agent_profiles WHERE tenant_id = ${tenantId}::uuid)`);
            await tx.execute(sql`DELETE FROM agent_profiles WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM mcp_servers WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM users WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM oauth_clients WHERE tenant_id = ${tenantId}::uuid`);
            await tx.execute(sql`DELETE FROM tenant_balances WHERE tenant_id = ${tenantId}::uuid`);
            // Finally, delete the tenant itself
            await tx.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}::uuid`);
        });

        revalidatePath("/admin/tenants");
        revalidatePath("/admin/users");
        return { success: true };
    } catch (error) {
        console.error("Failed to delete tenant:", error);
        return { success: false, message: "An error occurred while deleting the workspace." };
    }
}

export async function toggleTenantStatusAction(tenantId: string, currentStatus: string) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) {
        return { success: false, message: adminCheck.message };
    }

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
