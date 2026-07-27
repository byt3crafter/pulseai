"use server";

import { db } from "../../../storage/db";
import { approvalAllowances } from "../../../storage/schema";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../utils/tenant-auth";
import { logAudit } from "../../../utils/audit";

/**
 * Revoke a standing "allow always" allowance. Safe to do from the dashboard: it
 * only ever REMOVES an exemption (making the gate stricter), never grants access.
 * The gateway reads allowances live (hasStandingAllowance filters on revokedAt),
 * so revocation takes effect immediately.
 */
export async function revokeAllowanceAction(allowanceId: string) {
    const tenantCheck = await requireTenant("tenant.settings.write");
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    try {
        const [row] = await db
            .update(approvalAllowances)
            .set({ revokedAt: new Date() })
            .where(and(
                eq(approvalAllowances.id, allowanceId),
                eq(approvalAllowances.tenantId, tenantId),
                isNull(approvalAllowances.revokedAt),
            ))
            .returning({ id: approvalAllowances.id, subject: approvalAllowances.subject });

        if (!row) return { success: false, message: "Allowance not found." };

        await logAudit({ action: "approval.allowance.revoked", targetId: allowanceId, metadata: { subject: row.subject } }).catch(() => {});
        revalidatePath("/dashboard/approvals");
        return { success: true, message: "Allowance revoked." };
    } catch (error) {
        console.error("Failed to revoke allowance:", error);
        return { success: false, message: "Failed to revoke allowance." };
    }
}
