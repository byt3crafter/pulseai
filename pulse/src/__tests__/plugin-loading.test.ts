/**
 * Plugin Loading Tests
 *
 * Verifies plugins load with valid manifests and their tool schemas
 * pass the same OpenAI validation that killed the bot.
 */
import { describe, it, expect } from "vitest";
import erpnextPlugin from "../../plugins/erpnext/index.js";

// ─── Schema validation helper (same as tool-schema-validation.test.ts) ───────

interface SchemaError {
    path: string;
    message: string;
}

function validateSchemaNode(node: any, path: string, errors: SchemaError[]): void {
    if (!node || typeof node !== "object") return;

    if (node.type === "array" && !node.items) {
        errors.push({ path, message: "type 'array' missing 'items'" });
    }

    if (
        node.type === "object" &&
        !node.properties &&
        node.additionalProperties === undefined
    ) {
        errors.push({ path, message: "type 'object' missing 'properties' or 'additionalProperties'" });
    }

    if (node.properties && typeof node.properties === "object") {
        for (const [key, value] of Object.entries(node.properties)) {
            validateSchemaNode(value, `${path}.properties.${key}`, errors);
        }
    }
    if (node.items && typeof node.items === "object") {
        validateSchemaNode(node.items, `${path}.items`, errors);
    }
    if (node.additionalProperties && typeof node.additionalProperties === "object") {
        validateSchemaNode(node.additionalProperties, `${path}.additionalProperties`, errors);
    }
    for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
        if (Array.isArray(node[keyword])) {
            node[keyword].forEach((item: any, i: number) => {
                validateSchemaNode(item, `${path}.${keyword}[${i}]`, errors);
            });
        }
    }
}

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
