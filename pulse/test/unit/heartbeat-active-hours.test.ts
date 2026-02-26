import { describe, it, expect, vi, afterEach } from "vitest";
import { isWithinActiveHours } from "../../src/infra/heartbeat-active-hours.js";

/**
 * Helper: replace Intl.DateTimeFormat with a class-based mock that returns a fixed time.
 * Stores the original so it can be restored in afterEach.
 */
const OriginalDateTimeFormat = Intl.DateTimeFormat;

function mockCurrentTime(timeStr: string) {
    // @ts-expect-error — replacing with a class mock
    Intl.DateTimeFormat = class MockDateTimeFormat {
        format() { return timeStr; }
        formatToParts() { return []; }
        resolvedOptions() { return {} as any; }
        formatRange() { return ""; }
        formatRangeToParts() { return []; }
    };
}

describe("isWithinActiveHours", () => {
    afterEach(() => {
        Intl.DateTimeFormat = OriginalDateTimeFormat;
    });

    it("returns true when no active hours configured", () => {
        expect(isWithinActiveHours(undefined)).toBe(true);
        expect(isWithinActiveHours({} as any)).toBe(true);
        expect(isWithinActiveHours({ start: "", end: "", timezone: "UTC" })).toBe(true);
    });

    it("returns true for invalid HH:MM format", () => {
        expect(isWithinActiveHours({ start: "invalid", end: "17:00", timezone: "UTC" })).toBe(true);
        expect(isWithinActiveHours({ start: "09:00", end: "bad", timezone: "UTC" })).toBe(true);
    });

    it("handles normal range (e.g. 08:00-18:00)", () => {
        mockCurrentTime("12:00");
        expect(isWithinActiveHours({ start: "08:00", end: "18:00", timezone: "UTC" })).toBe(true);
    });

    it("rejects time outside normal range", () => {
        mockCurrentTime("06:00");
        expect(isWithinActiveHours({ start: "08:00", end: "18:00", timezone: "UTC" })).toBe(false);
    });

    it("handles midnight wrapping (e.g. 22:00-06:00)", () => {
        mockCurrentTime("23:00");
        expect(isWithinActiveHours({ start: "22:00", end: "06:00", timezone: "UTC" })).toBe(true);
    });

    it("handles midnight wrapping — early morning side", () => {
        mockCurrentTime("03:00");
        expect(isWithinActiveHours({ start: "22:00", end: "06:00", timezone: "UTC" })).toBe(true);
    });

    it("rejects time outside midnight-wrapped range", () => {
        mockCurrentTime("12:00");
        expect(isWithinActiveHours({ start: "22:00", end: "06:00", timezone: "UTC" })).toBe(false);
    });

    it("handles edge: time exactly at start (inclusive)", () => {
        mockCurrentTime("09:00");
        expect(isWithinActiveHours({ start: "09:00", end: "17:00", timezone: "UTC" })).toBe(true);
    });

    it("handles edge: time exactly at end (exclusive)", () => {
        mockCurrentTime("17:00");
        expect(isWithinActiveHours({ start: "09:00", end: "17:00", timezone: "UTC" })).toBe(false);
    });
});
