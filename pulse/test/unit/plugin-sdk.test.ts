import { describe, it, expect } from "vitest";
import { definePlugin } from "../../src/plugins/sdk/index.js";

describe("definePlugin", () => {
    it("returns the manifest object unchanged", () => {
        const manifest = {
            name: "test-plugin",
            version: "1.0.0",
            description: "A test plugin",
        };
        const result = definePlugin(manifest);
        expect(result).toEqual(manifest);
    });

    it("preserves tools array", () => {
        const manifest = {
            name: "tool-plugin",
            version: "2.0.0",
            description: "Plugin with tools",
            tools: [
                {
                    name: "my_tool",
                    description: "Does something",
                    parameters: { type: "object", properties: {}, required: [] },
                    execute: async () => ({ result: "ok" }),
                },
            ],
        };
        const result = definePlugin(manifest);
        expect(result.tools).toHaveLength(1);
        expect(result.tools![0].name).toBe("my_tool");
    });

    it("preserves hooks", () => {
        const manifest = {
            name: "hook-plugin",
            version: "1.0.0",
            description: "Plugin with hooks",
            hooks: {
                "gateway-start": async () => {},
                "message-received": async (ctx: any) => ctx,
            },
        };
        const result = definePlugin(manifest);
        expect(result.hooks).toBeDefined();
        expect(result.hooks!["gateway-start"]).toBeDefined();
        expect(result.hooks!["message-received"]).toBeDefined();
    });

    it("preserves routes", () => {
        const manifest = {
            name: "route-plugin",
            version: "1.0.0",
            description: "Plugin with routes",
            routes: [
                {
                    method: "GET" as const,
                    path: "/status",
                    handler: async () => ({ ok: true }),
                },
            ],
        };
        const result = definePlugin(manifest);
        expect(result.routes).toHaveLength(1);
        expect(result.routes![0].method).toBe("GET");
    });
});
