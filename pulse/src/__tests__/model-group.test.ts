import { describe, it, expect } from "vitest";
import { orderModelsForTurn, normalizeGroup, type ResolvedGroup } from "../agent/providers/model-group-service.js";

/*
 * Model-group ordering. The whole point is zero hardcoding: the models and the
 * strategy come from config, and this decides the order to try them for a turn.
 * The first that answers wins, so every strategy keeps the full group as
 * fallback — the failure that matters is a strategy that DROPS a model and so
 * removes its failover.
 *
 * Uses real registry model ids so getModelById validation is exercised.
 */
const g = (strategy: string, models: string[]): ResolvedGroup =>
    ({ strategy: strategy as any, models });
const ctx = (over: Partial<{ text: string; hasTools: boolean; hasAttachments: boolean }> = {}) =>
    ({ text: "hello there", hasTools: false, hasAttachments: false, ...over });

const CHEAP = "MiniMax-M3";
const CAPABLE = "gpt-5.5";

describe("failover strategy", () => {
    it("keeps the configured order regardless of the message", () => {
        const group = g("failover", [CHEAP, CAPABLE]);
        expect(orderModelsForTurn(group, ctx())).toEqual([CHEAP, CAPABLE]);
        expect(orderModelsForTurn(group, ctx({ text: "write me a 5-page report on X?" }))).toEqual([CHEAP, CAPABLE]);
    });
});

describe("cost strategy leads with the right model but never drops the rest", () => {
    it("a simple, tool-free statement leads with the cheap model", () => {
        expect(orderModelsForTurn(g("cost", [CHEAP, CAPABLE]), ctx({ text: "thanks, noted" })))
            .toEqual([CHEAP, CAPABLE]);
    });

    it("a question leads with the capable model, cheap trails as fallback", () => {
        expect(orderModelsForTurn(g("cost", [CHEAP, CAPABLE]), ctx({ text: "what is the total?" })))
            .toEqual([CAPABLE, CHEAP]);
    });

    it("a tool-carrying turn is never sent cheap-first", () => {
        expect(orderModelsForTurn(g("cost", [CHEAP, CAPABLE]), ctx({ text: "hi", hasTools: true })))
            .toEqual([CAPABLE, CHEAP]);
    });

    it("attachments, code and URLs all count as complex", () => {
        for (const over of [{ hasAttachments: true }, { text: "```x```" }, { text: "see https://a.com" }]) {
            expect(orderModelsForTurn(g("cost", [CHEAP, CAPABLE]), ctx(over))[0]).toBe(CAPABLE);
        }
    });

    it("every strategy keeps the whole group so failover is never lost", () => {
        for (const strat of ["failover", "cost", "both"]) {
            const out = orderModelsForTurn(g(strat, [CHEAP, CAPABLE]), ctx({ text: "what?" }));
            expect(new Set(out)).toEqual(new Set([CHEAP, CAPABLE]));
            expect(out.length).toBe(2);
        }
    });
});

describe("validation", () => {
    it("drops unknown model ids so a typo can't select a non-existent model", () => {
        expect(orderModelsForTurn(g("failover", ["not-a-real-model", CAPABLE]), ctx())).toEqual([CAPABLE]);
    });

    it("normalizeGroup rejects an empty or malformed group", () => {
        expect(normalizeGroup(null)).toBeNull();
        expect(normalizeGroup({ strategy: "failover", models: [] })).toBeNull();
        expect(normalizeGroup({ strategy: "failover", models: "nope" as any })).toBeNull();
    });

    it("normalizeGroup falls back to failover for an unknown strategy", () => {
        expect(normalizeGroup({ strategy: "wat", models: [CHEAP] })?.strategy).toBe("failover");
    });
});
