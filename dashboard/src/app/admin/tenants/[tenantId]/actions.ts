"use server";

import { db } from "../../../../storage/db";
import { tenants } from "../../../../storage/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { auth } from "../../../../auth";

export async function updateTenantConfigAction(
    tenantId: string,
    configUpdates: Record<string, any>
) {
    const session = await auth();
    if (!session?.user?.role || session.user.role !== "ADMIN") {
        return { success: false, message: "Unauthorized" };
    }

    try {
        // Merge new config keys into existing config JSONB using || operator
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
