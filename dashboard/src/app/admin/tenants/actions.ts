"use server";

import { db } from "../../../storage/db";
import { tenants, tenantBalances, users, oauthClients, passwordResetTokens, tenantSkills } from "../../../storage/schema";
import { DEFAULT_ENABLED_TOOLS } from "../../../utils/tenant-skills-catalog";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import * as crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateSecurePassword } from "../../../utils/password";
import { requireAdmin } from "../../../utils/admin-auth";
import { generateToken, hashToken } from "../../../utils/tokens";
import { sendInviteEmail, appBaseUrl } from "../../../utils/mailer";
import { logAudit } from "../../../utils/audit";

const createTenantSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    customerEmail: z.string().email("Please enter a valid customer email address"),
    slug: z.string().min(2, "Slug must be at least 2 characters").regex(/^[-a-z0-9]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
    initialBalance: z.coerce.number().min(0, "Balance cannot be negative").default(0),
    apiMode: z.enum(["platform", "byok"]).default("platform"),
});

export async function createTenantAction(formData: FormData) {
    const adminCheck = await requireAdmin("platform.tenants.write");
    if (!adminCheck.authorized) {
        return { success: false, message: adminCheck.message };
    }

    try {
        const rawData = {
            name: formData.get("name") as string,
            customerEmail: formData.get("customerEmail") as string,
            slug: formData.get("slug") as string,
            initialBalance: formData.get("initialBalance"),
            apiMode: formData.get("apiMode") as string || "platform",
        };

        const validatedData = createTenantSchema.parse(rawData);

        const credentials = await db.transaction(async (tx) => {
            const [newTenant] = await tx.insert(tenants).values({
                name: validatedData.name,
                slug: validatedData.slug,
                status: "active",
                config: { apiMode: validatedData.apiMode },
            }).returning();

            await tx.insert(tenantBalances).values({
                tenantId: newTenant.id,
                balance: validatedData.initialBalance.toFixed(4),
            });

            // Seed the default built-in toolset so a new workspace's agents can
            // actually do something out of the box. Without this a fresh tenant
            // had zero tools (the tenant_skills gate) until someone ran SQL.
            await tx.insert(tenantSkills).values(
                DEFAULT_ENABLED_TOOLS.map((name) => ({ tenantId: newTenant.id, skillName: name, enabled: true }))
            );

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

            const [createdUser] = await tx.insert(users).values({
                name: `${validatedData.name} Admin`,
                email: userEmail,
                passwordHash,
                role: "TENANT",
                tenantId: newTenant.id,
                mustChangePassword: true,
                onboardingComplete: false,
            }).returning({ id: users.id });

            return {
                clientId,
                clientSecret,
                userId: createdUser.id,
                initialUser: { email: userEmail, password: tempPassword },
            };
        });

        // Best-effort invite email (outside the transaction). Never blocks creation.
        try {
            const raw = generateToken();
            await db.insert(passwordResetTokens).values({
                userId: credentials.userId,
                tokenHash: hashToken(raw),
                type: "invite",
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            });
            await sendInviteEmail(
                credentials.initialUser.email,
                `${validatedData.name} Admin`,
                `${appBaseUrl()}/reset/${raw}`,
            );
        } catch (error) {
            console.error("Failed to send tenant invite email:", error);
        }

        await logAudit({
            action: "tenant.create",
            targetType: "tenant",
            summary: `Created workspace "${validatedData.name}" (${validatedData.slug})`,
            metadata: { slug: validatedData.slug, apiMode: validatedData.apiMode },
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
    const adminCheck = await requireAdmin("platform.tenants.delete");
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
            await tx.execute(sql`DELETE FROM audit_logs WHERE tenant_id = ${tenantId}::uuid`);
            // Finally, delete the tenant itself
            await tx.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}::uuid`);
        });

        await logAudit({
            action: "tenant.delete",
            targetType: "tenant",
            targetId: tenantId,
            summary: `Deleted workspace ${tenantId}`,
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
    const adminCheck = await requireAdmin("platform.tenants.write");
    if (!adminCheck.authorized) {
        return { success: false, message: adminCheck.message };
    }

    try {
        const newStatus = currentStatus === "active" ? "inactive" : "active";

        await db.update(tenants)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(tenants.id, tenantId));

        await logAudit({
            action: newStatus === "active" ? "tenant.activate" : "tenant.suspend",
            targetType: "tenant",
            targetId: tenantId,
            tenantId,
            summary: `Workspace ${newStatus === "active" ? "activated" : "suspended"}`,
        });

        revalidatePath("/admin/tenants");
        return { success: true };
    } catch (error) {
        console.error("Failed to toggle tenant status:", error);
        return { success: false, message: "Failed to update workspace status." };
    }
}
