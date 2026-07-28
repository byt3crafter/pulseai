"use server";

import { db } from "../../../storage/db";
import { tenants } from "../../../storage/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../utils/tenant-auth";

/**
 * Save the ROI assumption (minutes of human work saved per completed task). This
 * is the estimate knob behind "hours saved / money saved" — stored per tenant so
 * the numbers are transparent and the customer owns them.
 */
export async function saveRoiMinutesAction(minutes: number) {
    const tenantCheck = await requireTenant("tenant.settings.write");
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const m = Math.round(Number(minutes));
    if (!Number.isFinite(m) || m < 0 || m > 480) {
        return { success: false, message: "Enter a value between 0 and 480 minutes." };
    }

    try {
        // Merge into the tenant config jsonb without clobbering other keys.
        await db.update(tenants)
            .set({ config: sql`coalesce(${tenants.config}, '{}'::jsonb) || jsonb_build_object('roi', jsonb_build_object('minutesPerTask', ${m}))` })
            .where(eq(tenants.id, tenantId));
        revalidatePath("/dashboard/analytics");
        return { success: true, message: "Updated." };
    } catch (error) {
        console.error("Failed to save ROI assumption:", error);
        return { success: false, message: "Failed to save." };
    }
}
