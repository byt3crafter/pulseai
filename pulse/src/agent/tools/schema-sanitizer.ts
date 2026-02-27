/**
 * Schema Sanitizer — ensures all tool JSON schemas are valid for strict providers (OpenAI).
 *
 * OpenAI rejects schemas that have:
 *   - `type: "array"` without an `items` property
 *   - `type: "object"` without `properties` or `additionalProperties`
 *
 * This sanitizer deep-walks each tool schema and patches missing fields so that
 * tools from any source (built-in, plugin, MCP) work with every provider.
 */

import { logger } from "../../utils/logger.js";

/**
 * Recursively walk a JSON schema node and fix provider-incompatible patterns.
 * Mutates the schema in place for performance.
 */
function sanitizeNode(node: any, path: string): void {
    if (!node || typeof node !== "object") return;

    // Fix arrays missing `items`
    if (node.type === "array" && !node.items) {
        node.items = { type: "string" };
        logger.warn({ path }, "Schema sanitizer: added default items to array");
    }

    // Fix objects missing both `properties` and `additionalProperties`
    if (
        node.type === "object" &&
        !node.properties &&
        node.additionalProperties === undefined
    ) {
        node.additionalProperties = true;
        logger.warn({ path }, "Schema sanitizer: added additionalProperties to free-form object");
    }

    // Recurse into nested structures
    if (node.properties) {
        for (const [key, value] of Object.entries(node.properties)) {
            sanitizeNode(value, `${path}.properties.${key}`);
        }
    }
    if (node.items) {
        sanitizeNode(node.items, `${path}.items`);
    }
    if (node.additionalProperties && typeof node.additionalProperties === "object") {
        sanitizeNode(node.additionalProperties, `${path}.additionalProperties`);
    }
    // anyOf / oneOf / allOf
    for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
        if (Array.isArray(node[keyword])) {
            node[keyword].forEach((item: any, i: number) =>
                sanitizeNode(item, `${path}.${keyword}[${i}]`)
            );
        }
    }
}

/**
 * Sanitize a tool's parameter schema so it passes validation on all providers.
 * Returns the same object (mutated in place).
 */
export function sanitizeToolSchema(
    toolName: string,
    schema: Record<string, any>
): Record<string, any> {
    sanitizeNode(schema, toolName);
    return schema;
}
