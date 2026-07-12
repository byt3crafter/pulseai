/**
 * Tool approval-gating tests — isToolGated (the "ask" tier of Tool Policy).
 */
import { describe, it, expect } from "vitest";
import { isToolGated, isToolAllowed, ToolPolicy } from "../agent/tools/tool-policy.js";

describe("isToolGated", () => {
    it("is false when no ask list is set", () => {
        expect(isToolGated(null, "email_send")).toBe(false);
        expect(isToolGated({}, "email_send")).toBe(false);
        expect(isToolGated({ allow: ["*"] }, "email_send")).toBe(false);
    });

    it("gates a tool that matches an ask pattern", () => {
        expect(isToolGated({ ask: ["email_send"] }, "email_send")).toBe(true);
        expect(isToolGated({ ask: ["erpnext_*"] }, "erpnext_create_invoice")).toBe(true);
        expect(isToolGated({ ask: ["*"] }, "anything")).toBe(true);
    });

    it("does not gate tools that don't match", () => {
        expect(isToolGated({ ask: ["email_send"] }, "calculator")).toBe(false);
        expect(isToolGated({ ask: ["erpnext_*"] }, "get_current_time")).toBe(false);
    });

    it("alwaysAllow exempts a tool from the gate", () => {
        expect(isToolGated({ ask: ["email_send"], alwaysAllow: ["email_send"] }, "email_send")).toBe(false);
        expect(isToolGated({ ask: ["erpnext_*"], alwaysAllow: ["erpnext_*"] }, "erpnext_pay")).toBe(false);
    });

    it("is independent of allow/deny (a denied tool never reaches the gate)", () => {
        const policy: ToolPolicy = { deny: ["email_send"], ask: ["email_send"] };
        // deny is enforced separately by isToolAllowed; the gate itself still matches.
        expect(isToolAllowed(policy, "email_send")).toBe(false);
        expect(isToolGated(policy, "email_send")).toBe(true);
    });
});
