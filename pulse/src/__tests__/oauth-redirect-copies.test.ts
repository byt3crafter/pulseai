import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The redirect matcher exists twice, and must stay identical.
 *
 * The two packages share no library and TypeScript's rootDir will not let
 * either import the other, so the file is duplicated — the same arrangement
 * schema.ts already lives under, except schema.ts has nothing checking it and
 * has drifted before. A security check that drifts between the endpoint that
 * ISSUES a code and the one that REDEEMS it is worse than one copy: the two
 * would disagree about what is allowed, and only one of them would be right.
 */
describe("the two copies of the redirect matcher", () => {
    it("are byte-for-byte identical", () => {
        const a = readFileSync(join(process.cwd(), "src", "gateway", "oauth-redirect.ts"), "utf8");
        const b = readFileSync(
            join(process.cwd(), "..", "dashboard", "src", "utils", "oauth-redirect.ts"),
            "utf8",
        );
        expect(a).toBe(b);
    });
});
