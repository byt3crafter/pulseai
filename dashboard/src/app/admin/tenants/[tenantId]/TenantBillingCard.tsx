"use client";

import { useState, useTransition } from "react";
import { saveTenantBillingAction, type TenantBillingView } from "./actions";

/**
 * A workspace's commercial terms.
 *
 * Suspension is the consequential control here, so the form says out loud what
 * it will do rather than leaving the admin to find out from a customer.
 */
export default function TenantBillingCard({
    tenantId,
    initial,
}: {
    tenantId: string;
    initial: TenantBillingView;
}) {
    const [plan, setPlan] = useState(initial.plan);
    const [status, setStatus] = useState(initial.status);
    const [notice, setNotice] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const stops = status === "suspended" || status === "cancelled";
    const field =
        "w-full rounded-lg border border-pulse-border bg-pulse-panel px-3 py-2 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-pulse-accent/40";

    return (
        <div className="rounded-xl border border-pulse-border bg-pulse-panel">
            <div className="border-b border-pulse-border-subtle px-5 py-4">
                <h2 className="text-[15px] font-semibold text-pulse-text">Billing</h2>
                <p className="mt-0.5 text-xs text-pulse-muted">
                    {initial.usingDefault
                        ? "This workspace follows the deployment-wide billing mode. Saving here gives it its own terms."
                        : "This workspace has its own terms, independent of the deployment default."}
                </p>
            </div>

            <form
                className="px-5 py-4"
                action={(fd) => {
                    setNotice(null);
                    fd.set("tenantId", tenantId);
                    startTransition(async () => setNotice((await saveTenantBillingAction(fd)).message));
                }}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-xs text-pulse-muted">Plan</span>
                        <select name="plan" value={plan} onChange={(e) => setPlan(e.target.value)} className={field}>
                            <option value="credits">Credits — pre-paid balance, metered</option>
                            <option value="flat">Flat monthly fee — not metered</option>
                            <option value="unlimited">Unlimited — internal, or their own API keys</option>
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-xs text-pulse-muted">Subscription status</span>
                        <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
                            <option value="trialing">Trialing</option>
                            <option value="active">Active</option>
                            <option value="past_due">Past due — still working</option>
                            <option value="suspended">Suspended — agents stop</option>
                            <option value="cancelled">Cancelled — agents stop</option>
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-xs text-pulse-muted">Monthly price</span>
                        <input name="monthlyPrice" defaultValue={initial.monthlyPrice} inputMode="decimal"
                            placeholder="250.00" className={field}
                            disabled={plan !== "flat"} />
                        {plan !== "flat" && (
                            <span className="mt-1 block text-[11px] text-pulse-faint">Only used for a flat monthly fee.</span>
                        )}
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1 block text-xs text-pulse-muted">Currency</span>
                            <input name="currency" defaultValue={initial.currency} maxLength={3} className={field} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs text-pulse-muted">Renews</span>
                            <input name="periodEnd" type="date" defaultValue={initial.periodEnd ?? ""} className={field} />
                        </label>
                    </div>
                </div>

                <label className="mt-4 block">
                    <span className="mb-1 block text-xs text-pulse-muted">Notes</span>
                    <textarea name="notes" defaultValue={initial.notes} rows={2}
                        placeholder="Contract reference, agreed scope, who to invoice…" className={field} />
                </label>

                {/* Said before saving, not after: this stops a customer working. */}
                {stops && (
                    <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                        Saving this will stop this workspace&apos;s agents from responding. They can still sign in and
                        see why — deliberately, so they can settle it.
                    </p>
                )}

                <div className="mt-4 flex items-center gap-3">
                    <button type="submit" disabled={pending}
                        className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                            stops ? "bg-red-600 hover:bg-red-700" : "bg-pulse-accent hover:bg-pulse-accent-hi"}`}>
                        {pending ? "Saving…" : stops ? "Save and stop agents" : "Save billing"}
                    </button>
                    {notice && <span className="text-xs text-pulse-muted">{notice}</span>}
                </div>
            </form>
        </div>
    );
}
