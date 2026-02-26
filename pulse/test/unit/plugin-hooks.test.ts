import { describe, it, expect, beforeEach } from "vitest";
import { HookRegistry } from "../../src/plugins/hooks.js";

describe("HookRegistry", () => {
    let registry: HookRegistry;

    beforeEach(() => {
        registry = new HookRegistry();
    });

    it("returns unmodified context when no hooks registered", async () => {
        const ctx = { value: 42 };
        const result = await registry.run("test-hook", ctx);
        expect(result).toBe(ctx);
    });

    it("runs a single hook and returns modified context", async () => {
        registry.register("test-hook", async (ctx: any) => ({ ...ctx, modified: true }), "test-plugin");
        const result = await registry.run("test-hook", { value: 42 });
        expect(result).toEqual({ value: 42, modified: true });
    });

    it("runs multiple hooks in priority order (higher first)", async () => {
        const order: number[] = [];

        registry.register("test-hook", async (ctx: any) => { order.push(1); return ctx; }, "plugin-low", 1);
        registry.register("test-hook", async (ctx: any) => { order.push(10); return ctx; }, "plugin-high", 10);
        registry.register("test-hook", async (ctx: any) => { order.push(5); return ctx; }, "plugin-mid", 5);

        await registry.run("test-hook", {});
        expect(order).toEqual([10, 5, 1]);
    });

    it("each hook receives the context from the previous one", async () => {
        registry.register("test-hook", async (ctx: any) => ({ ...ctx, a: 1 }), "p1", 2);
        registry.register("test-hook", async (ctx: any) => ({ ...ctx, b: ctx.a + 1 }), "p2", 1);

        const result = await registry.run("test-hook", {});
        expect(result).toEqual({ a: 1, b: 2 });
    });

    it("skips null/undefined returns (context unchanged)", async () => {
        registry.register("test-hook", async () => null, "p1");
        registry.register("test-hook", async (ctx: any) => ({ ...ctx, touched: true }), "p2");

        const result = await registry.run("test-hook", { initial: true });
        expect(result).toEqual({ initial: true, touched: true });
    });

    it("catches errors without breaking the pipeline", async () => {
        registry.register("test-hook", async () => { throw new Error("boom"); }, "bad-plugin", 10);
        registry.register("test-hook", async (ctx: any) => ({ ...ctx, safe: true }), "good-plugin", 1);

        const result = await registry.run("test-hook", {});
        expect(result).toEqual({ safe: true });
    });

    it("emit runs all handlers (void hooks)", async () => {
        const called: string[] = [];
        registry.register("event", async () => { called.push("a"); }, "p1");
        registry.register("event", async () => { called.push("b"); }, "p2");

        await registry.emit("event", {});
        expect(called).toContain("a");
        expect(called).toContain("b");
    });

    it("emit handles errors gracefully", async () => {
        const called: string[] = [];
        registry.register("event", async () => { throw new Error("fail"); }, "bad");
        registry.register("event", async () => { called.push("ok"); }, "good");

        await registry.emit("event");
        expect(called).toContain("ok");
    });

    it("getRegisteredHooks returns hook names", () => {
        registry.register("hook-a", async () => {}, "p1");
        registry.register("hook-b", async () => {}, "p2");
        expect(registry.getRegisteredHooks()).toContain("hook-a");
        expect(registry.getRegisteredHooks()).toContain("hook-b");
    });

    it("getHookCount returns correct count", () => {
        registry.register("hook-a", async () => {}, "p1");
        registry.register("hook-a", async () => {}, "p2");
        registry.register("hook-b", async () => {}, "p3");
        expect(registry.getHookCount("hook-a")).toBe(2);
        expect(registry.getHookCount("hook-b")).toBe(1);
        expect(registry.getHookCount("hook-c")).toBe(0);
    });

    it("clear removes all hooks", () => {
        registry.register("hook-a", async () => {}, "p1");
        registry.register("hook-b", async () => {}, "p2");
        registry.clear();
        expect(registry.getRegisteredHooks()).toHaveLength(0);
    });
});
