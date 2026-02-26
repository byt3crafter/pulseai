import { describe, it, expect } from "vitest";
import { applyTemporalDecay } from "../../src/memory/temporal-decay.js";

describe("applyTemporalDecay", () => {
    it("returns full score for memory created right now", () => {
        const score = applyTemporalDecay(1.0, new Date());
        expect(score).toBeCloseTo(1.0, 2);
    });

    it("returns approximately half score at half-life", () => {
        const halfLifeDays = 30;
        const thirtyDaysAgo = new Date(Date.now() - halfLifeDays * 24 * 60 * 60 * 1000);
        const score = applyTemporalDecay(1.0, thirtyDaysAgo, halfLifeDays);
        expect(score).toBeCloseTo(0.5, 1);
    });

    it("returns approximately quarter score at 2x half-life", () => {
        const halfLifeDays = 30;
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        const score = applyTemporalDecay(1.0, sixtyDaysAgo, halfLifeDays);
        expect(score).toBeCloseTo(0.25, 1);
    });

    it("preserves relative ordering — newer always scores higher", () => {
        const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

        const s1 = applyTemporalDecay(1.0, oneDayAgo);
        const s2 = applyTemporalDecay(1.0, tenDaysAgo);
        const s3 = applyTemporalDecay(1.0, hundredDaysAgo);

        expect(s1).toBeGreaterThan(s2);
        expect(s2).toBeGreaterThan(s3);
    });

    it("scales with input score", () => {
        const date = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
        const s1 = applyTemporalDecay(1.0, date, 30);
        const s2 = applyTemporalDecay(0.5, date, 30);
        expect(s2).toBeCloseTo(s1 * 0.5, 5);
    });

    it("shorter half-life decays faster", () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const slow = applyTemporalDecay(1.0, thirtyDaysAgo, 60);
        const fast = applyTemporalDecay(1.0, thirtyDaysAgo, 10);
        expect(slow).toBeGreaterThan(fast);
    });

    it("uses default half-life of 30 days", () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const score = applyTemporalDecay(1.0, thirtyDaysAgo);
        expect(score).toBeCloseTo(0.5, 1);
    });

    it("returns 0 for score of 0", () => {
        expect(applyTemporalDecay(0, new Date())).toBe(0);
    });
});
