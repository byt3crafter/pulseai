import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Memory recall must never reach across people.
 *
 * These assert the shape of the predicate rather than run a query, because the
 * failure mode is a missing clause, not a wrong one — and a missing clause is
 * exactly what a source check catches and a happy-path integration test does
 * not. If recall silently widened to the whole tenant, every test that asks
 * "did I get results back" would still pass.
 */
const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("memory is scoped to the person", () => {
    it("recall matches the asker's memories OR workspace ones, never anyone else's", () => {
        const src = read("memory/hybrid-search.ts");
        expect(src).toMatch(/owner_user_id = '\$\{opts\.ownerUserId\}'::uuid OR owner_user_id IS NULL/);
    });

    it("the filter is only applied when an asker is known", () => {
        // An automation run has no asker; it must still recall workspace memory
        // rather than silently getting nothing.
        expect(read("memory/hybrid-search.ts")).toMatch(/if \(opts\.ownerUserId\) \{/);
    });

    it("storing a memory records who it belongs to", () => {
        expect(read("memory/memory-service.ts")).toMatch(/ownerUserId: opts\?\.ownerUserId \?\? null/);
    });

    it("the memory tools pass the acting user through", () => {
        const tools = read("agent/tools/built-in/memory-tools.ts");
        expect(tools).toMatch(/ownerUserId: \(args as any\)\._actorUserId \?\? null/);
        // both storing and searching, not just one
        expect(tools.match(/_actorUserId/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });

    it("the runtime scopes the automatic context injection too", () => {
        // The biggest leak surface: context is injected on every turn without
        // the agent asking for it.
        expect(read("agent/runtime.ts")).toMatch(/getRelevantContext[\s\S]{0,400}ownerUserId: inbound\.actorUserId/);
    });
});
