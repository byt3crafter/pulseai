"use server";

import { db } from "../../../../storage/db";
import { tenants } from "../../../../storage/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../../../../utils/admin-auth";
import { logAudit } from "../../../../utils/audit";
import { resetTenantWorkspace, ResetScope } from "../../../../utils/tenant-reset";

export async function updateTenantConfigAction(
    tenantId: string,
    configUpdates: Record<string, any>
) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) {
        return { success: false, message: adminCheck.message };
    }

    try {
        await db.execute(
            sql`UPDATE tenants SET config = config || ${JSON.stringify(configUpdates)}::jsonb, updated_at = now() WHERE id = ${tenantId}::uuid`
        );

        revalidatePath(`/admin/tenants/${tenantId}`);
        revalidatePath("/admin/tenants");
        return { success: true };
    } catch (error) {
        console.error("Failed to update tenant config:", error);
        return { success: false, message: "Failed to update tenant configuration." };
    }
}

/**
 * Danger Zone — reset a tenant's operational data (admin-initiated). Requires
 * the admin to type the tenant's exact name to arm it, so the wrong workspace
 * can't be wiped by accident. Destructive with no in-app undo; audit-logged.
 */
export async function resetTenantDataAction(
    tenantId: string,
    scope: ResetScope,
    confirmName: string
) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) {
        return { success: false, message: adminCheck.message };
    }

    try {
        const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
        if (!tenant) return { success: false, message: "Tenant not found." };
        if ((confirmName ?? "").trim() !== tenant.name) {
            return { success: false, message: "Confirmation text does not match the workspace name." };
        }

        const counts = await resetTenantWorkspace(tenantId, scope);
        await logAudit({
            action: "tenant.workspace_reset",
            targetType: "tenant",
            targetId: tenantId,
            tenantId,
            summary: `Reset workspace data (scope: ${scope}) for ${tenant.name}`,
            metadata: { scope, counts, initiator: "admin" },
        });

        revalidatePath(`/admin/tenants/${tenantId}`);
        return { success: true, counts };
    } catch (error) {
        console.error("Failed to reset tenant data:", error);
        return { success: false, message: "Failed to reset workspace data." };
    }
}
