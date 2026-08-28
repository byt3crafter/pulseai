"use server";

import { db } from "../../../../storage/db";
import { tenants, tenantBilling } from "../../../../storage/schema";
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

/* ─── Billing ──────────────────────────────────────────────────────────────
 *
 * A plan that can only be set in SQL is not a feature — that is exactly how
 * tenant_skills ended up invisible, with new workspaces getting no tools and
 * no way to fix it. See docs/TENANCY_PLAN.md.
 */

export interface TenantBillingView {
    plan: string;
    monthlyPrice: string;
    currency: string;
    status: string;
    periodEnd: string | null;
    notes: string;
    /** No row yet — the workspace is on the deployment-wide default. */
    usingDefault: boolean;
}

export async function getTenantBilling(tenantId: string): Promise<TenantBillingView> {
    const adminCheck = await requireAdmin();
    const empty: TenantBillingView = {
        plan: "credits", monthlyPrice: "", currency: "USD",
        status: "active", periodEnd: null, notes: "", usingDefault: true,
    };
    if (!adminCheck.authorized) return empty;

    try {
        const row = await db.query.tenantBilling.findFirst({
            where: eq(tenantBilling.tenantId, tenantId),
        });
        if (!row) return empty;
        return {
            plan: row.plan,
            monthlyPrice: row.monthlyPrice ? String(row.monthlyPrice) : "",
            currency: row.currency,
            status: row.status,
            periodEnd: row.periodEnd ? row.periodEnd.toISOString().slice(0, 10) : null,
            notes: row.notes ?? "",
            usingDefault: false,
        };
    } catch (error) {
        console.error("Failed to load tenant billing:", error);
        return empty;
    }
}

const PLANS = new Set(["credits", "flat", "unlimited"]);
const STATUSES = new Set(["trialing", "active", "past_due", "suspended", "cancelled"]);

export async function saveTenantBillingAction(formData: FormData) {
    const adminCheck = await requireAdmin("platform.tenants.write");
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    const tenantId = String(formData.get("tenantId") || "");
    const plan = String(formData.get("plan") || "credits");
    const status = String(formData.get("status") || "active");
    const priceRaw = String(formData.get("monthlyPrice") || "").trim();
    const currency = String(formData.get("currency") || "USD").toUpperCase().slice(0, 3);
    const periodEnd = String(formData.get("periodEnd") || "").trim();
    const notes = String(formData.get("notes") || "").trim().slice(0, 2000);

    // Validated against a set rather than trusted: these strings decide whether
    // a paying customer's agents run.
    if (!tenantId || !PLANS.has(plan) || !STATUSES.has(status)) {
        return { success: false, message: "Invalid plan or status." };
    }
    const price = priceRaw ? Number(priceRaw) : null;
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
        return { success: false, message: "Monthly price must be a positive number." };
    }

    try {
        const values = {
            tenantId,
            plan,
            status,
            monthlyPrice: price !== null ? price.toFixed(2) : null,
            currency: currency || "USD",
            periodEnd: periodEnd ? new Date(periodEnd) : null,
            notes: notes || null,
            updatedAt: new Date(),
        };
        await db.insert(tenantBilling).values(values).onConflictDoUpdate({
            target: tenantBilling.tenantId,
            set: values,
        });

        await logAudit({
            action: "tenant.billing.update",
            targetType: "tenant",
            targetId: tenantId,
            tenantId,
            summary: `Plan set to ${plan} (${status})${price !== null ? ` at ${currency} ${price.toFixed(2)}/mo` : ""}`,
            metadata: { plan, status, monthlyPrice: price, currency },
        });

        revalidatePath(`/admin/tenants/${tenantId}`);
        return {
            success: true,
            message:
                status === "suspended" || status === "cancelled"
                    // Blunt on purpose: this stops a customer's agents right now.
                    ? "Saved. This workspace's agents will stop responding immediately."
                    : "Saved.",
        };
    } catch (error) {
        console.error("Failed to save tenant billing:", error);
        return { success: false, message: "Failed to save billing settings." };
    }
}
