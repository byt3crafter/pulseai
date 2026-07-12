/**
 * buildApprovalSummary — the text an approver sees on a gated-tool card.
 * For email it must surface the real draft (to/subject/body).
 */
import { describe, it, expect } from "vitest";
import { buildApprovalSummary } from "../agent/runtime.js";

describe("buildApprovalSummary", () => {
    it("renders an email draft with to/subject/body", () => {
        const s = buildApprovalSummary("Sélina", "email_send", {
            to: "client@acme.com",
            subject: "Your February statement",
            body: "Hi, please find attached your statement. Balance due: P4,200.",
        });
        expect(s).toContain("SEND an email");
        expect(s).toContain("To: client@acme.com");
        expect(s).toContain("Subject: Your February statement");
        expect(s).toContain("Balance due: P4,200");
    });

    it("includes cc and array recipients when present", () => {
        const s = buildApprovalSummary("CFO", "email_send", {
            to: ["a@x.com", "b@x.com"],
            cc: "boss@x.com",
            subject: "Hi",
            body: "x",
        });
        expect(s).toContain("a@x.com, b@x.com");
        expect(s).toContain("Cc: boss@x.com");
    });

    it("truncates a very long body", () => {
        const s = buildApprovalSummary("A", "email_send", { to: "x@y.com", subject: "s", body: "z".repeat(5000) });
        expect(s).toContain("…");
        expect(s.length).toBeLessThan(2000);
    });

    it("gives a generic arg preview for non-email tools", () => {
        const s = buildApprovalSummary("A", "erpnext_create", { doctype: "Payment Entry", amount: 500, _agentId: "hide" });
        expect(s).toContain('"erpnext_create"');
        expect(s).toContain("doctype: Payment Entry");
        expect(s).not.toContain("_agentId");
    });
});
