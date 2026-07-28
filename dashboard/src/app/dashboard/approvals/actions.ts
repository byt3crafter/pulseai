"use server";

import { db } from "../../../storage/db";
import { approvalAllowances } from "../../../storage/schema";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "../../../auth";
import { requireTenant } from "../../../utils/tenant-auth";
import { logAudit } from "../../../utils/audit";

/**
 * Allow / Deny / Allow-always an approval from the dashboard. Available to
 * authenticated workspace admins; the decision is executed by the gateway (where
 * the runtime lives) so an approved action runs immediately, out-of-band — no
 * polling, nothing blocks an agent. The actor's name is recorded for the audit
 * trail; tenant scope is enforced both here (session) and in the gateway.
 */
export async function decideApprovalAction(approvalId: string, action: "allow" | "deny" | "allowall") {
    const tenantCheck = await requireTenant("tenant.settings.write");
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const gatewayUrl = process.env.PULSE_GATEWAY_URL || "http://pulse-gateway:8080";
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
        return { success: false, message: "Approvals from the dashboard aren't configured on this deployment yet. Use the Telegram card." };
    }

    const session = await auth().catch(() => null);
    const actor = (session?.user as any)?.name || (session?.user as any)?.email || "Dashboard";

    try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/api/approvals/decide`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminKey}` },
            body: JSON.stringify({ approvalId, action, tenantId, actor }),
            cache: "no-store",
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data?.error === "already_decided") return { success: false, message: "This was already decided." };
            if (data?.error === "not_found") return { success: false, message: "Approval not found." };
            return { success: false, message: "Couldn't record the decision. Please try again." };
        }
        await logAudit({ action: `approval.${action}`, targetId: approvalId }).catch(() => {});
        revalidatePath("/dashboard/approvals");
        return { success: true, message: action === "deny" ? "Denied." : "Approved." };
    } catch (error) {
        console.error("Failed to decide approval:", error);
        return { success: false, message: "Couldn't reach the approval service. Please try again." };
    }
}

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
