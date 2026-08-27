/**
 * buildApprovalSummary — the text an approver sees on a gated-tool card.
 * For email it must surface the real draft (to/subject/body).
 */
import { describe, it, expect } from "vitest";
import { buildApprovalSummary } from "../agent/tools/approval-gate.js";
import { humanWindow, DEFAULT_APPROVAL_TIMEOUT_MS } from "../channels/approval-service.js";

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

/*
 * The countdown on the card used to be a hardcoded "2 minutes" while the real
 * window came from `input.timeoutMs` — two HOURS for a tool-policy approval.
 * Understating it is not cosmetic: an approver who reads "2 minutes", sees the
 * message an hour later and assumes it lapsed leaves real work blocked. The
 * customer docs had resorted to telling people not to trust the number.
 */
describe("the approval card states the real window", () => {
    it("reports the tool-policy window in hours, not minutes", () => {
        // APPROVAL_TTL_MS in approval-gate.ts
        expect(humanWindow(2 * 60 * 60 * 1000)).toBe("2 hours");
    });

    it("reports the default short window", () => {
        expect(humanWindow(DEFAULT_APPROVAL_TIMEOUT_MS)).toBe("2 minutes");
    });

    it("reads naturally at the boundaries rather than saying '1 minutes'", () => {
        expect(humanWindow(60_000)).toBe("1 minute");
        expect(humanWindow(60 * 60 * 1000)).toBe("1 hour");
        expect(humanWindow(30_000)).toBe("under a minute");
        expect(humanWindow(45 * 60 * 1000)).toBe("45 minutes");
        expect(humanWindow(48 * 60 * 60 * 1000)).toBe("2 days");
    });
});
