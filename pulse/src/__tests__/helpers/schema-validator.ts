/**
 * Shared schema validation helper.
 * Extracted from plugin-loading.test.ts and tool-schema-validation.test.ts
 * to avoid duplication.
 */

export interface SchemaError {
    path: string;
    message: string;
}

/**
 * Recursively validates that a JSON Schema node meets OpenAI-compatible
 * requirements:
 *   - Arrays must have an `items` definition.
 *   - Objects must have `properties` or `additionalProperties`.
 */
export function validateSchemaNode(node: any, path: string, errors: SchemaError[]): void {
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
