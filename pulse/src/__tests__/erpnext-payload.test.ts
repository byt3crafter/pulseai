import { describe, it, expect } from "vitest";
import { normalizeDocPayload, normalizeListFilters } from "../../plugins/erpnext/client.js";
import { sanitizeExecError, maskSecrets } from "../agent/tools/built-in/exec-error.js";

describe("normalizeDocPayload — Journal Entry rows", () => {
    it("copies plain debit/credit into *_in_account_currency", () => {
        const out = normalizeDocPayload("Journal Entry", {
            posting_date: "2026-09-01",
            accounts: [{ account: "A", debit: "100" }, { account: "B", credit: 100 }],
        });
        expect(out.accounts[0]).toEqual({ account: "A", debit: "100", debit_in_account_currency: 100 });
        expect(out.accounts[1]).toEqual({ account: "B", credit: 100, credit_in_account_currency: 100 });
        expect(out.posting_date).toBe("2026-09-01");
    });
    it("keeps explicit *_in_account_currency (coerced to number)", () => {
        const out = normalizeDocPayload("Journal Entry", { accounts: [{ account: "A", debit: 5, debit_in_account_currency: "7.5" }] });
        expect(out.accounts[0].debit_in_account_currency).toBe(7.5);
    });
    it("leaves other doctypes and malformed rows alone", () => {
        const si = { customer: "C", items: [{ item_code: "X", qty: 1, rate: 100 }] };
        expect(normalizeDocPayload("Sales Invoice", si)).toBe(si);
        expect(normalizeDocPayload("Journal Entry", { accounts: "nope" } as any).accounts).toBe("nope");
    });
});

describe("sanitizeExecError", () => {
    it("drops the command line and masks KEY=VALUE secrets in stderr", () => {
        const err = Object.assign(new Error("Command failed: docker run -e ERPNEXT_API_SECRET=abc123 img"), {
            code: 125, cmd: "docker run -e ERPNEXT_API_SECRET=abc123 img", killed: false, signal: null,
            stderr: "Unable to find image; env ERPNEXT_API_KEY=d277 ERPNEXT_URL=https://x",
        });
        const safe = sanitizeExecError(err);
        expect(JSON.stringify(safe)).not.toContain("abc123");
        expect(safe.stderr).toContain("ERPNEXT_API_KEY=***");
        expect(safe.stderr).toContain("ERPNEXT_URL=https://x");
        expect(safe.code).toBe(125);
        expect((safe as any).message).toBeUndefined();
        expect((safe as any).cmd).toBeUndefined();
    });
    it("maskSecrets covers TOKEN/PASSWORD names", () => {
        expect(maskSecrets("SMTP_PASSWORD=hunter2 GH_TOKEN=ghp_1 FOO=bar")).toBe("SMTP_PASSWORD=*** GH_TOKEN=*** FOO=bar");
    });
});

describe("normalizeListFilters — status → docstatus", () => {
    it("rewrites Draft/Submitted/Cancelled to docstatus 0/1/2", () => {
        expect(normalizeListFilters([["status", "=", "Draft"]])).toEqual([["docstatus", "=", 0]]);
        expect(normalizeListFilters([["Status", "!=", "submitted"]])).toEqual([["docstatus", "!=", 1]]);
        expect(normalizeListFilters([["status", "in", ["Draft", "Cancelled"]]])).toEqual([["docstatus", "in", [0, 2]]]);
        expect(normalizeListFilters([["Journal Entry", "status", "=", "Submitted"]])).toEqual([["Journal Entry", "docstatus", "=", 1]]);
    });
    it("leaves real status values and other fields alone", () => {
        const f = [["status", "=", "Unpaid"], ["grand_total", ">", 1000]];
        expect(normalizeListFilters(f)).toEqual(f);
        expect(normalizeListFilters([["status", "in", ["Paid", "Draft"]]])).toEqual([["status", "in", ["Paid", "Draft"]]]);
        expect(normalizeListFilters("bogus")).toBe("bogus");
    });
});
