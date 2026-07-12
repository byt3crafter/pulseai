/**
 * Standing Orders prompt-formatting tests.
 */
import { describe, it, expect } from "vitest";
import { formatStandingOrdersForPrompt, StandingOrder } from "../standing-orders/standing-order-service.js";

function order(partial: Partial<StandingOrder>): StandingOrder {
    return {
        id: "1", tenantId: "t", agentId: "a", name: "Program", enabled: true,
        scope: null, trigger: null, steps: null, approvalGates: null, escalation: null, boundaries: null,
        sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
        ...partial,
    } as StandingOrder;
}

describe("formatStandingOrdersForPrompt", () => {
    it("returns empty string when there are no orders", () => {
        expect(formatStandingOrdersForPrompt([])).toBe("");
    });

    it("renders the header and the execute/verify/report rule", () => {
        const out = formatStandingOrdersForPrompt([order({ name: "Weekly report", scope: "send reports" })]);
        expect(out).toContain("## Standing orders");
        expect(out).toContain("execute");
        expect(out).toContain("1. Weekly report");
        expect(out).toContain("You are authorised to: send reports");
    });

    it("omits blank fields but keeps populated ones", () => {
        const out = formatStandingOrdersForPrompt([
            order({ name: "P1", approvalGates: "refunds over 500", boundaries: "never delete data" }),
        ]);
        expect(out).toContain("Get my approval before: refunds over 500");
        expect(out).toContain("Never: never delete data");
        expect(out).not.toContain("When:");   // trigger was blank
        expect(out).not.toContain("Steps:");  // steps was blank
    });

    it("numbers multiple programs", () => {
        const out = formatStandingOrdersForPrompt([order({ name: "A" }), order({ name: "B" })]);
        expect(out).toContain("1. A");
        expect(out).toContain("2. B");
    });
});
