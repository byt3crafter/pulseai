import { describe, it, expect } from "vitest";
import { isToolAllowed, filterTools, ToolPolicy } from "../../src/agent/tools/tool-policy.js";

describe("isToolAllowed", () => {
    it("allows everything when policy is null/undefined", () => {
        expect(isToolAllowed(null, "anything")).toBe(true);
        expect(isToolAllowed(undefined, "anything")).toBe(true);
    });

    it("allows everything when policy is empty", () => {
        expect(isToolAllowed({}, "anything")).toBe(true);
        expect(isToolAllowed({ allow: [], deny: [] }, "anything")).toBe(true);
    });

    // Deny list
    it("blocks exact deny matches", () => {
        const policy: ToolPolicy = { deny: ["drop_database"] };
        expect(isToolAllowed(policy, "drop_database")).toBe(false);
        expect(isToolAllowed(policy, "get_current_time")).toBe(true);
    });

    it("blocks glob deny patterns (prefix*)", () => {
        const policy: ToolPolicy = { deny: ["mcp_dangerous_*"] };
        expect(isToolAllowed(policy, "mcp_dangerous_delete")).toBe(false);
        expect(isToolAllowed(policy, "mcp_dangerous_drop")).toBe(false);
        expect(isToolAllowed(policy, "mcp_safe_read")).toBe(true);
    });

    it("blocks wildcard deny (*)", () => {
        const policy: ToolPolicy = { deny: ["*"] };
        expect(isToolAllowed(policy, "anything")).toBe(false);
    });

    // Allow list
    it("restricts to allow list when specified", () => {
        const policy: ToolPolicy = { allow: ["get_current_time", "calculator"] };
        expect(isToolAllowed(policy, "get_current_time")).toBe(true);
        expect(isToolAllowed(policy, "calculator")).toBe(true);
        expect(isToolAllowed(policy, "exec")).toBe(false);
    });

    it("supports glob allow patterns", () => {
        const policy: ToolPolicy = { allow: ["mcp_erp_*"] };
        expect(isToolAllowed(policy, "mcp_erp_read_invoice")).toBe(true);
        expect(isToolAllowed(policy, "mcp_slack_send")).toBe(false);
    });

    // Deny takes priority over allow
    it("deny overrides allow (deny-first)", () => {
        const policy: ToolPolicy = {
            allow: ["mcp_*"],
            deny: ["mcp_dangerous_*"],
        };
        expect(isToolAllowed(policy, "mcp_safe_read")).toBe(true);
        expect(isToolAllowed(policy, "mcp_dangerous_delete")).toBe(false);
    });
});

describe("filterTools", () => {
    const tools = [
        { name: "get_current_time" },
        { name: "calculator" },
        { name: "exec" },
        { name: "mcp_erp_read" },
        { name: "mcp_erp_write" },
        { name: "mcp_slack_send" },
    ];

    it("returns all tools when no policy", () => {
        expect(filterTools(tools, null)).toEqual(tools);
        expect(filterTools(tools, undefined)).toEqual(tools);
        expect(filterTools(tools, {})).toEqual(tools);
    });

    it("filters by deny list", () => {
        const result = filterTools(tools, { deny: ["exec"] });
        expect(result.map(t => t.name)).toEqual([
            "get_current_time", "calculator", "mcp_erp_read", "mcp_erp_write", "mcp_slack_send",
        ]);
    });

    it("filters by allow list", () => {
        const result = filterTools(tools, { allow: ["get_current_time", "calculator"] });
        expect(result.map(t => t.name)).toEqual(["get_current_time", "calculator"]);
    });

    it("filters by allow + deny combined", () => {
        const result = filterTools(tools, {
            allow: ["mcp_*"],
            deny: ["mcp_slack_*"],
        });
        expect(result.map(t => t.name)).toEqual(["mcp_erp_read", "mcp_erp_write"]);
    });
});
