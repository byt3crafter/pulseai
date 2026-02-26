import { describe, it, expect } from "vitest";
import { parseSandboxConfig, DEFAULT_SANDBOX_CONFIG } from "../../src/agent/tools/built-in/sandbox-config.js";

describe("parseSandboxConfig", () => {
    it("returns defaults for null/undefined/non-object", () => {
        expect(parseSandboxConfig(null)).toEqual(DEFAULT_SANDBOX_CONFIG);
        expect(parseSandboxConfig(undefined)).toEqual(DEFAULT_SANDBOX_CONFIG);
        expect(parseSandboxConfig("string")).toEqual(DEFAULT_SANDBOX_CONFIG);
        expect(parseSandboxConfig(42)).toEqual(DEFAULT_SANDBOX_CONFIG);
    });

    it("returns defaults for empty object", () => {
        const result = parseSandboxConfig({});
        expect(result.mode).toBe("off");
        expect(result.scope).toBe("session");
        expect(result.workspaceAccess).toBe("none");
        expect(result.docker).toBeUndefined();
    });

    it("parses valid mode values", () => {
        expect(parseSandboxConfig({ mode: "off" }).mode).toBe("off");
        expect(parseSandboxConfig({ mode: "non-main" }).mode).toBe("non-main");
        expect(parseSandboxConfig({ mode: "all" }).mode).toBe("all");
    });

    it("rejects invalid mode values (falls back to off)", () => {
        expect(parseSandboxConfig({ mode: "invalid" }).mode).toBe("off");
        expect(parseSandboxConfig({ mode: "" }).mode).toBe("off");
    });

    it("parses valid scope values", () => {
        expect(parseSandboxConfig({ scope: "session" }).scope).toBe("session");
        expect(parseSandboxConfig({ scope: "agent" }).scope).toBe("agent");
        expect(parseSandboxConfig({ scope: "shared" }).scope).toBe("shared");
    });

    it("rejects invalid scope values (falls back to session)", () => {
        expect(parseSandboxConfig({ scope: "global" }).scope).toBe("session");
    });

    it("parses valid workspaceAccess values", () => {
        expect(parseSandboxConfig({ workspaceAccess: "none" }).workspaceAccess).toBe("none");
        expect(parseSandboxConfig({ workspaceAccess: "ro" }).workspaceAccess).toBe("ro");
        expect(parseSandboxConfig({ workspaceAccess: "rw" }).workspaceAccess).toBe("rw");
    });

    it("parses docker overrides", () => {
        const result = parseSandboxConfig({
            mode: "all",
            docker: {
                image: "python:3.12-slim",
                memoryLimit: "256m",
                cpuLimit: "1.0",
                setupCommand: "pip install numpy",
            },
        });
        expect(result.docker).toEqual({
            image: "python:3.12-slim",
            memoryLimit: "256m",
            cpuLimit: "1.0",
            setupCommand: "pip install numpy",
        });
    });

    it("strips empty docker fields to undefined", () => {
        const result = parseSandboxConfig({
            docker: { image: "", memoryLimit: "", cpuLimit: "", setupCommand: "" },
        });
        expect(result.docker?.image).toBeUndefined();
        expect(result.docker?.memoryLimit).toBeUndefined();
    });

    it("handles full valid config", () => {
        const result = parseSandboxConfig({
            mode: "non-main",
            scope: "agent",
            workspaceAccess: "ro",
            docker: { image: "alpine" },
        });
        expect(result).toEqual({
            mode: "non-main",
            scope: "agent",
            workspaceAccess: "ro",
            docker: { image: "alpine", memoryLimit: undefined, cpuLimit: undefined, setupCommand: undefined },
        });
    });
});
