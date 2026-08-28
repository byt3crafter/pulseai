/**
 * May this workspace run agents right now?
 *
 * ONE place decides. "Can this customer use the product" is exactly the kind of
 * question that gets asked in four places and answered differently in one of
 * them — and the failure mode is a suspended customer who keeps working through
 * whichever door forgot to ask.
 *
 * Deliberately NOT enforced at login. A suspended customer must still be able
 * to sign in, see why, and pay: locking them out of the billing page is how you
 * turn a failed card into a lost account.
 *
 * See docs/TENANCY_PLAN.md.
 */

import { eq } from "drizzle-orm";
import { db } from "../storage/db.js";
import { tenants, tenantBilling, tenantBalances, globalSettings } from "../storage/schema.js";
import { logger } from "../utils/logger.js";

export interface TenantAccess {
    allowed: boolean;
    /** Machine-readable, for logs and tests. */
    reason?: "tenant_inactive" | "subscription_suspended" | "subscription_cancelled" | "no_credits";
    /** What the customer is actually told. Plain, and says what to do next. */
    message?: string;
}

const OK: TenantAccess = { allowed: true };

/**
 * Statuses that stop the agents.
 *
 * `past_due` deliberately does NOT: cutting a customer off the moment an
 * invoice slips is how you lose one over an expired card. It is a warning
 * state that a human decides to escalate into `suspended`.
 */
const BLOCKING = new Set(["suspended", "cancelled"]);

export async function checkTenantAccess(tenantId: string): Promise<TenantAccess> {
    try {
        const [tenant, billing] = await Promise.all([
            db.query.tenants.findFirst({ where: eq(tenants.id, tenantId), columns: { status: true } }),
            db.query.tenantBilling.findFirst({ where: eq(tenantBilling.tenantId, tenantId) }),
        ]);

        // The workspace itself is switched off — the bluntest control, and until
        // now the column existed and nothing read it.
        if (tenant && tenant.status && tenant.status !== "active") {
            return {
                allowed: false,
                reason: "tenant_inactive",
                message: "This workspace is not active. Please contact your administrator.",
            };
        }

        if (billing && BLOCKING.has(billing.status)) {
            return {
                allowed: false,
                reason: billing.status === "cancelled" ? "subscription_cancelled" : "subscription_suspended",
                message:
                    billing.status === "cancelled"
                        ? "This workspace's subscription has ended. Please contact your administrator to reactivate it."
                        : "This workspace is suspended. Please settle the outstanding balance to resume.",
            };
        }

        /*
         * Which billing model applies.
         *
         * A tenant row wins over the deployment-wide setting; without one we
         * keep the old global behaviour exactly, so nothing changed for anyone
         * on the day this shipped.
         */
        let model = billing?.plan;
        if (!model) {
            const root = await db.query.globalSettings.findFirst({ where: eq(globalSettings.id, "root") });
            model = ((root?.config as any)?.billingMode ?? "credits") === "unlimited" ? "unlimited" : "credits";
        }

        // A monthly fee is not metered against a balance — that is the point of it.
        if (model === "unlimited" || model === "flat") return OK;

        const balanceRecord = await db.query.tenantBalances.findFirst({
            where: eq(tenantBalances.tenantId, tenantId),
        });
        const balance = balanceRecord?.balance ? parseFloat(balanceRecord.balance as string) : 0;
        if (balance <= 0) {
            return {
                allowed: false,
                reason: "no_credits",
                message: "Your account has insufficient credits to process this message. Please top up your balance in the dashboard.",
            };
        }

        return OK;
    } catch (err) {
        /*
         * Fail OPEN, and say so loudly.
         *
         * The alternative is that a database hiccup silently stops every
         * customer's agents at once. Losing money on a few messages during an
         * outage is cheaper than every workspace going dark, and this is a
         * commercial gate rather than a security one — the tenant boundary is
         * enforced elsewhere and is unaffected.
         */
        logger.error({ err, tenantId }, "Tenant access check failed — allowing the turn rather than blocking every customer");
        return OK;
    }
}
