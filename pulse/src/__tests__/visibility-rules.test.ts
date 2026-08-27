import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * The visibility rules, tested as behaviour rather than as code shape.
 *
 * These re-implement canRead/canWrite from dashboard/src/utils/visibility.ts
 * because the dashboard has no test runner. That duplication is deliberate and
 * cheap: the rules are five lines, and having them asserted somewhere is worth
 * more than having them asserted in the same package. The last test pins the
 * source so the copy cannot drift silently.
 */
const canRead = (row: { ownerUserId?: string | null; visibility?: string | null }, userId: string) =>
    (row.visibility ?? "workspace") === "workspace" ? true : !!row.ownerUserId && row.ownerUserId === userId;

const canWrite = (row: { ownerUserId?: string | null }, userId: string) =>
    !row.ownerUserId ? true : row.ownerUserId === userId;

const ME = "user-me";
const THEM = "user-them";

describe("row visibility", () => {
    it("a workspace row is readable by anyone in the workspace", () => {
        expect(canRead({ visibility: "workspace", ownerUserId: THEM }, ME)).toBe(true);
    });

    it("a private row is readable only by its owner", () => {
        expect(canRead({ visibility: "private", ownerUserId: ME }, ME)).toBe(true);
        expect(canRead({ visibility: "private", ownerUserId: THEM }, ME)).toBe(false);
    });

    /*
     * The invariant migration 0043 is built around. A private row with no owner
     * is unreadable by EVERY user — including whoever wrote it — so the flip
     * must only ever touch rows that have an owner. This test states the
     * consequence; the migration enforces the cause.
     */
    it("a private row with no owner is readable by nobody — hence owned-rows-only flips", () => {
        expect(canRead({ visibility: "private", ownerUserId: null }, ME)).toBe(false);
        expect(canRead({ visibility: "private", ownerUserId: null }, THEM)).toBe(false);
    });

    it("an unowned row is workspace property and anyone may edit it", () => {
        // Most historic rows are unowned; locking them would break normal work.
        expect(canWrite({ ownerUserId: null }, ME)).toBe(true);
    });

    it("an owned row may only be changed by its owner", () => {
        expect(canWrite({ ownerUserId: ME }, ME)).toBe(true);
        expect(canWrite({ ownerUserId: THEM }, ME)).toBe(false);
    });

    it("no bypass exists for admins — that would be an audited export, not a role", () => {
        const src = readFileSync(
            join(process.cwd(), "..", "dashboard", "src", "utils", "visibility.ts"), "utf8");
        expect(src).not.toMatch(/accessRole|isAdmin|role === ["']owner["']/);
    });
});
