/**
 * Schema Sanitizer Tests
 *
 * Verifies the runtime sanitizer correctly fixes bad schemas before
 * they reach providers that reject them (OpenAI).
 */
import { describe, it, expect, vi } from "vitest";

// Mock the logger before importing the sanitizer
vi.mock("../../src/utils/logger.js", () => ({
    logger: {
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
    },
}));

import { sanitizeToolSchema } from "../agent/tools/schema-sanitizer.js";

describe("Schema Sanitizer", () => {
    it("should add default items to array missing items", () => {
        const schema = {
            type: "object",
            properties: {
                tags: { type: "array" },
            },
        };

        sanitizeToolSchema("test_tool", schema);

        expect(schema.properties.tags).toEqual({
            type: "array",
            items: { type: "string" },
        });
    });

    it("should add additionalProperties to free-form object missing properties", () => {
        const schema = {
            type: "object",
            properties: {
                data: { type: "object" },
            },
        };

        sanitizeToolSchema("test_tool", schema);

        expect(schema.properties.data).toEqual({
            type: "object",
            additionalProperties: true,
        });
    });

    it("should NOT modify valid schemas", () => {
        const schema = {
            type: "object",
            properties: {
                name: { type: "string" },
                items: {
                    type: "array",
                    items: { type: "number" },
                },
                config: {
                    type: "object",
                    properties: {
                        key: { type: "string" },
                    },
                },
            },
        };

        const originalJson = JSON.stringify(schema);
        sanitizeToolSchema("test_tool", schema);
        expect(JSON.stringify(schema)).toBe(originalJson);
    });

    it("should handle deeply nested schemas", () => {
        const schema = {
            type: "object",
            properties: {
                outer: {
                    type: "object",
                    properties: {
                        inner: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    tags: { type: "array" }, // missing items
                                },
                            },
                        },
                    },
                },
            },
        };

        sanitizeToolSchema("test_tool", schema);

        expect(
            (schema.properties.outer as any).properties.inner.items.properties.tags.items
        ).toEqual({ type: "string" });
    });

    it("should handle anyOf/oneOf with bad nested schemas", () => {
        const schema = {
            type: "object",
            properties: {
                value: {
                    anyOf: [
                        { type: "string" },
                        { type: "array" }, // missing items
                    ],
                },
            },
        };

        sanitizeToolSchema("test_tool", schema);

        expect((schema.properties.value as any).anyOf[0]).toEqual({ type: "string" });
        expect((schema.properties.value as any).anyOf[1]).toEqual({
            type: "array",
            items: { type: "string" },
        });
    });

    it("should preserve existing items/additionalProperties values", () => {
        const schema = {
            type: "object",
            properties: {
                numbers: {
                    type: "array",
                    items: { type: "number" },
                },
                metadata: {
                    type: "object",
                    additionalProperties: { type: "string" },
                },
            },
        };

        const originalJson = JSON.stringify(schema);
        sanitizeToolSchema("test_tool", schema);
        expect(JSON.stringify(schema)).toBe(originalJson);
    });

    it("should return the same schema object reference", () => {
        const schema = { type: "object", properties: { x: { type: "string" } } };
        const result = sanitizeToolSchema("test_tool", schema);
        expect(result).toBe(schema);
    });
});
