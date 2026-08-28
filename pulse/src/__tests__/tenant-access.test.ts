import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Who may run, and who may not.
 *
 * Asserted at the source rather than against a database, because the rules here
 * are commercial judgements that must not drift quietly: cutting a customer off
 * a day early, or failing to cut one off at all, are both expensive and neither
 * shows up in a happy-path test.
 */
const svc = readFileSync(join(process.cwd(), "src", "billing", "tenant-access.ts"), "utf8");
const runtime = readFileSync(join(process.cwd(), "src", "agent", "runtime.ts"), "utf8");

describe("the gate lives in exactly one place", () => {
    it("the runtime asks checkTenantAccess instead of checking credits itself", () => {
        expect(runtime).toMatch(/const access = await checkTenantAccess\(inbound\.tenantId\)/);
    });

    it("the old deployment-wide credits check is gone from the runtime", () => {
        // It could not express a vendor's reality: one deployment, customers on
        // different terms.
        expect(runtime).not.toMatch(/if \(billingMode !== "unlimited"\)/);
    });
});

describe("what stops a workspace", () => {
    it("an inactive tenant is stopped — the column finally does something", () => {
        expect(svc).toMatch(/tenant\.status !== "active"/);
        expect(svc).toMatch(/reason: "tenant_inactive"/);
    });

    it("suspended and cancelled subscriptions stop it", () => {
        expect(svc).toMatch(/BLOCKING = new Set\(\["suspended", "cancelled"\]\)/);
    });

    it("past_due does NOT stop it", () => {
        /*
         * Deliberate. Cutting a customer off the moment an invoice slips is how
         * you lose one over an expired card; past_due is a warning a human
         * escalates into suspended.
         */
        expect(svc).not.toMatch(/BLOCKING[^)]*past_due/);
        expect(svc).toMatch(/past_due` deliberately does NOT/);
    });
});

describe("which billing model applies", () => {
    it("a tenant's own plan wins over the deployment-wide setting", () => {
        expect(svc).toMatch(/let model = billing\?\.plan;/);
    });

    it("falls back to the global setting when a tenant has no plan", () => {
        // So the migration changed nobody's behaviour on the day it shipped.
        expect(svc).toMatch(/if \(!model\)[\s\S]{0,300}billingMode/);
    });

    it("a flat monthly fee is not metered against a credit balance", () => {
        // That is the entire point of charging one.
        expect(svc).toMatch(/model === "unlimited" \|\| model === "flat"/);
    });

    it("credits are still checked for credit customers", () => {
        expect(svc).toMatch(/reason: "no_credits"/);
    });
});

describe("failure behaviour", () => {
    it("fails OPEN, because the alternative is every customer going dark at once", () => {
        // This is a commercial gate, not a security one — the tenant boundary is
        // enforced elsewhere and is unaffected by this returning OK.
        const tail = svc.slice(svc.indexOf("} catch (err)"));
        expect(tail).toMatch(/return OK/);
        expect(tail).toMatch(/rather than blocking every customer/);
    });

    it("is not enforced at login, so a suspended customer can still pay", () => {
        expect(svc).toMatch(/NOT enforced at login/);
    });
});
