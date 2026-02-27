/**
 * Tool Schema Validation Tests
 *
 * Validates ALL tool schemas (built-in + plugin) meet OpenAI-compatible JSON Schema requirements.
 * Catches: the exact erpnext items/properties bug that killed the bot in production.
 */
import { describe, it, expect } from "vitest";

// ─── Import all built-in tools directly (avoids DB/Redis in registry) ────────
import { timeTool } from "../agent/tools/built-in/time.js";
import { calculatorTool } from "../agent/tools/built-in/calculator.js";
import { execTool } from "../agent/tools/built-in/exec.js";
import { processTool } from "../agent/tools/built-in/process.js";
import { credentialListTool } from "../agent/tools/built-in/vault.js";
import { pythonExecuteTool } from "../agent/tools/built-in/python.js";
import { scriptSaveTool, scriptLoadTool, scriptListTool } from "../agent/tools/built-in/script-store.js";
import { memoryStoreTool, memorySearchTool, memoryForgetTool } from "../agent/tools/built-in/memory-tools.js";
import { scheduleJobTool, scheduleOnceTool, listJobsTool, cancelJobTool } from "../agent/tools/built-in/schedule.js";
import { delegateToAgentTool } from "../agent/tools/built-in/delegate.js";
import { listAgentsTool } from "../agent/tools/built-in/agent-mgmt.js";
import type { Tool } from "../agent/tools/tool.interface.js";

// ─── Import plugin tools directly ────────────────────────────────────────────
import {
    erpnextListTool,
    erpnextGetTool,
    erpnextCreateTool,
    erpnextUpdateTool,
    erpnextDeleteTool,
    erpnextReportTool,
    erpnextMethodTool,
} from "../../plugins/erpnext/tools/index.js";

// ─── Collect ALL tools ───────────────────────────────────────────────────────

const BUILT_IN_TOOLS: Tool[] = [
    timeTool,
    calculatorTool,
    execTool,
    processTool,
    credentialListTool,
    pythonExecuteTool,
    scriptSaveTool,
    scriptLoadTool,
    scriptListTool,
    memoryStoreTool,
    memorySearchTool,
    memoryForgetTool,
    scheduleJobTool,
    scheduleOnceTool,
    listJobsTool,
    cancelJobTool,
    delegateToAgentTool,
    listAgentsTool,
];

const PLUGIN_TOOLS: Tool[] = [
    erpnextListTool,
    erpnextGetTool,
    erpnextCreateTool,
    erpnextUpdateTool,
    erpnextDeleteTool,
    erpnextReportTool,
    erpnextMethodTool,
];

const ALL_TOOLS: Tool[] = [...BUILT_IN_TOOLS, ...PLUGIN_TOOLS];

// ─── Schema validation helpers ───────────────────────────────────────────────

interface SchemaError {
    path: string;
    message: string;
}

function validateSchemaNode(node: any, path: string, errors: SchemaError[]): void {
    if (!node || typeof node !== "object") return;

    // Arrays MUST have `items`
    if (node.type === "array" && !node.items) {
        errors.push({ path, message: "type 'array' missing 'items'" });
    }

    // Objects MUST have `properties` or `additionalProperties`
    if (
        node.type === "object" &&
        !node.properties &&
        node.additionalProperties === undefined
    ) {
        errors.push({ path, message: "type 'object' missing 'properties' or 'additionalProperties'" });
    }

    // Recurse into properties
    if (node.properties && typeof node.properties === "object") {
        for (const [key, value] of Object.entries(node.properties)) {
            validateSchemaNode(value, `${path}.properties.${key}`, errors);
        }
    }

    // Recurse into items
    if (node.items && typeof node.items === "object") {
        validateSchemaNode(node.items, `${path}.items`, errors);
    }

    // Recurse into additionalProperties (if object)
    if (node.additionalProperties && typeof node.additionalProperties === "object") {
        validateSchemaNode(node.additionalProperties, `${path}.additionalProperties`, errors);
    }

    // Recurse into anyOf / oneOf / allOf
    for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
        if (Array.isArray(node[keyword])) {
            node[keyword].forEach((item: any, i: number) => {
                validateSchemaNode(item, `${path}.${keyword}[${i}]`, errors);
            });
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Tool Schema Validation", () => {
    it("should have at least 18 built-in tools", () => {
        expect(BUILT_IN_TOOLS.length).toBeGreaterThanOrEqual(18);
    });

    it("should have at least 7 plugin tools", () => {
        expect(PLUGIN_TOOLS.length).toBeGreaterThanOrEqual(7);
    });

    it("all tools should have unique names", () => {
        const names = ALL_TOOLS.map((t) => t.name);
        const unique = new Set(names);
        const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
        expect(duplicates).toEqual([]);
        expect(unique.size).toBe(names.length);
    });

    it("all tools should have non-empty name and description", () => {
        for (const tool of ALL_TOOLS) {
            expect(tool.name, `tool at index ${ALL_TOOLS.indexOf(tool)}`).toBeTruthy();
            expect(tool.name.length).toBeGreaterThan(0);
            expect(tool.description, `tool ${tool.name}`).toBeTruthy();
            expect(tool.description.length).toBeGreaterThan(0);
        }
    });

    it("all root schemas should be type 'object' with 'properties'", () => {
        for (const tool of ALL_TOOLS) {
            expect(tool.parameters.type, `tool ${tool.name}`).toBe("object");
            expect(tool.parameters.properties, `tool ${tool.name} missing properties`).toBeDefined();
            expect(typeof tool.parameters.properties, `tool ${tool.name} properties not object`).toBe("object");
        }
    });

    it("all tool schemas should pass recursive OpenAI-compatible validation", () => {
        const allErrors: Array<{ tool: string; errors: SchemaError[] }> = [];

        for (const tool of ALL_TOOLS) {
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
            expect.fail(`Schema validation failed:\n${report}`);
        }
    });

    it("all tools should have an execute function", () => {
        for (const tool of ALL_TOOLS) {
            expect(typeof tool.execute, `tool ${tool.name} missing execute`).toBe("function");
        }
    });
});
