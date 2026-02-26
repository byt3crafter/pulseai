"use server";

import { db } from "../../../../storage/db";
import { tenants } from "../../../../storage/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../../../../utils/admin-auth";

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
