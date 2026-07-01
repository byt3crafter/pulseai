/**
 * Plugin Loading Tests
 *
 * Verifies plugins load with valid manifests and their tool schemas
 * pass the same OpenAI validation that killed the bot.
 */
import { describe, it, expect } from "vitest";
import erpnextPlugin from "../../plugins/erpnext/index.js";
import { validateSchemaNode, type SchemaError } from "./helpers/schema-validator.js";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Plugin Loading — ERPNext", () => {
    it("should have a valid manifest structure", () => {
        expect(erpnextPlugin.name).toBe("erpnext");
        expect(erpnextPlugin.version).toBeTruthy();
        expect(erpnextPlugin.description).toBeTruthy();
        expect(Array.isArray(erpnextPlugin.tools)).toBe(true);
    });

    it("should have exactly 7 tools", () => {
        expect(erpnextPlugin.tools!.length).toBe(7);
    });

    it("should have all expected tool names", () => {
        const names = erpnextPlugin.tools!.map((t) => t.name);
        expect(names).toContain("erpnext_list");
        expect(names).toContain("erpnext_get");
        expect(names).toContain("erpnext_create");
        expect(names).toContain("erpnext_update");
        expect(names).toContain("erpnext_delete");
        expect(names).toContain("erpnext_report");
        expect(names).toContain("erpnext_method");
    });

    it("should have credential schema with required fields", () => {
        expect(erpnextPlugin.credentialSchema).toBeDefined();
        const names = erpnextPlugin.credentialSchema!.map((c) => c.name);
        expect(names).toContain("ERPNEXT_URL");
        expect(names).toContain("ERPNEXT_API_KEY");
        expect(names).toContain("ERPNEXT_API_SECRET");
    });

    it("all plugin tool schemas should pass OpenAI validation", () => {
        const allErrors: Array<{ tool: string; errors: SchemaError[] }> = [];

        for (const tool of erpnextPlugin.tools!) {
            const errors: SchemaError[] = [];
            validateSchemaNode(tool.parameters, tool.name, errors);
            if (errors.length > 0) {
                allErrors.push({ tool: tool.name, errors });
            }
        }

        if (allErrors.length > 0) {
            const report = allErrors
                .map((e) => `  ${e.tool}:\n${e.errors.map((err) => `    - ${err.path}: ${err.message}`).join("\n")}`)
                .join("\n");
            expect.fail(`Plugin schema validation failed:\n${report}`);
        }
    });
});
