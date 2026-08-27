import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Sharing, asserted at the source.
 *
 * Sharing is the one operation whose bug hands someone else's private work to a
 * colleague, and the dangerous version of that bug is a MISSING check rather
 * than a wrong one — a share action that forgets the owner test still shares
 * perfectly well, and every happy-path test still passes. So these pin the
 * checks themselves.
 *
 * See docs/MULTI_USER_PLAN.md and dashboard/src/utils/visibility.ts.
 */
const dash = (p: string) => readFileSync(join(process.cwd(), "..", "dashboard", "src", p), "utf8");

const VISIBILITY = "utils/visibility.ts";
const ACTIONS = "app/dashboard/share-actions.ts";

describe("shared rows resolve through resource_shares", () => {
    it("a shared row is visible to whoever appears in resource_shares", () => {
        const src = dash(VISIBILITY);
        expect(src).toMatch(/EXISTS \(/);
        expect(src).toMatch(/FROM resource_shares rs/);
        expect(src).toMatch(/rs\.user_id = \$\{userId\}::uuid/);
    });

    it("the share lookup is keyed by resource TYPE as well as id", () => {
        // Ids are uuids, so a collision across tables is not the worry — a
        // missing type clause is, because the same predicate is reused by five
        // tables and would start matching each other's shares.
        expect(dash(VISIBILITY)).toMatch(/rs\.resource_type = \$\{resourceType\}/);
    });

    it("omitting the resource type narrows what you see rather than widening it", () => {
        // Every call site should pass a type, but the failure when one forgets
        // must be 'I cannot see a chat shared with me', never 'I can see
        // everyone's'.
        const src = dash(VISIBILITY);
        expect(src).toMatch(/if \(resourceType\) \{/);
    });
});

describe("only an owner may give something away", () => {
    it("every mutating share action checks canShare", () => {
        const src = dash(ACTIONS);
        const mutators = ["shareAction", "unshareAction", "setWorkspaceVisibilityAction"];
        for (const fn of mutators) {
            const body = src.slice(src.indexOf(`export async function ${fn}`));
            const end = body.indexOf("\nexport ", 1);
            expect(end === -1 ? body : body.slice(0, end)).toMatch(/canShare\(row, check\.userId\)/);
        }
    });

    it("reading the access list is owner-only too", () => {
        // Who a private thing is shared with is itself information about it.
        const body = dash(ACTIONS).slice(dash(ACTIONS).indexOf("export async function getSharingAction"));
        expect(body).toMatch(/canShare\(found, check\.userId\)/);
    });

    it("the recipient must be in the same workspace", () => {
        // The one boundary that must never bend: a guessed user id from another
        // tenant would otherwise be a valid share target.
        expect(dash(ACTIONS)).toMatch(/recipient\.tenantId !== check\.tenantId/);
    });

    it("every share and unshare is audited", () => {
        const src = dash(ACTIONS);
        expect(src).toMatch(/action: "resource\.share"/);
        expect(src).toMatch(/action: "resource\.unshare"/);
    });
});

describe("visibility and the share rows stay consistent", () => {
    /*
     * These two are the pair that actually breaks in practice. A share row
     * written against a row still marked `private` is invisible to the person
     * it was shared with — the predicate never looks at resource_shares unless
     * visibility says to. And a row left `shared` with an empty list reads as
     * "still shared" in every badge that renders it.
     */
    it("sharing flips a private row to shared", () => {
        expect(dash(ACTIONS)).toMatch(/if \(row\.visibility === "private"\)[\s\S]{0,200}visibility: "shared"/);
    });

    it("removing the last share puts it back to private", () => {
        expect(dash(ACTIONS)).toMatch(/if \(left\.length === 0\)[\s\S]{0,200}visibility: "private"/);
    });

    it("closing workspace access keeps people who were named individually", () => {
        expect(dash(ACTIONS)).toMatch(/named\.length > 0 \? "shared" : "private"/);
    });
});
