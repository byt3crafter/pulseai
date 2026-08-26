import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every gated built-in tool must appear in the Workspace Tools catalog.
 *
 * `tenant_skills` gates built-in tools BY NAME, and the settings UI can only
 * toggle what the catalog lists. A tool that exists in the registry but is
 * missing from the catalog is therefore permanently invisible: no workspace can
 * ever enable it, and the agent reports the capability as unavailable no matter
 * how the rest of it is configured.
 *
 * That is not hypothetical — server_exec/server_list and bash_sandbox were all
 * missing, so an agent with servers configured, enabled and granted still said
 * "the SSH server tools are not exposed in this session". This test exists so
 * that cannot silently happen again.
 */

const REPO = join(import.meta.dirname, "../../..");
const CATALOG = join(REPO, "dashboard/src/utils/tenant-skills-catalog.ts");

/**
 * Tools deliberately outside the catalog, with the reason. Anything here is
 * injected by its own explicit gate rather than the tenant_skills switch.
 */
const INTENTIONALLY_UNCATALOGUED = new Map<string, string>([
    ["workspace_update", "injected only when an agent has selfConfigEnabled (registry.ts)"],
]);

function toolNamesIn(source: string): string[] {
    // Matches both the registry's `    name: "x",` and the catalog's
    // `{ name: "x", label: … }`. Only quoted string values, so schema
    // properties written as `name: { … }` are not picked up.
    return [...source.matchAll(/\bname: "([a-z0-9_]+)"/g)].map((m) => m[1]);
}

function collectRegisteredTools(): Set<string> {
    const names = new Set<string>();
    const dirs = [
        join(REPO, "pulse/src/agent/tools/built-in"),
        join(REPO, "pulse/src/servers"),
    ];
    for (const dir of dirs) {
        for (const file of readdirSync(dir)) {
            if (!file.endsWith(".ts")) continue;
            for (const name of toolNamesIn(readFileSync(join(dir, file), "utf8"))) {
                names.add(name);
            }
        }
    }
    return names;
}

describe("workspace tool catalog", () => {
    const registered = collectRegisteredTools();
    const catalogued = new Set(toolNamesIn(readFileSync(CATALOG, "utf8")));

    it("finds the registered built-in tools", () => {
        // Guards the scraper itself: if this collapses to nothing, the test below
        // would pass vacuously and stop protecting anything.
        expect(registered.size).toBeGreaterThan(50);
        expect(registered.has("email_send")).toBe(true);
    });

    it("lists every gated tool, so each one can actually be switched on", () => {
        const missing = [...registered]
            .filter((n) => !catalogued.has(n))
            .filter((n) => !INTENTIONALLY_UNCATALOGUED.has(n))
            .sort();

        expect(
            missing,
            `These tools exist but are absent from ${"tenant-skills-catalog.ts"}, so no workspace can ever enable them. ` +
            "Add them to a group, or record why they are exempt in INTENTIONALLY_UNCATALOGUED.",
        ).toEqual([]);
    });

    it("covers the server and sandbox tools specifically", () => {
        // The exact set whose absence produced "SSH server tools are not exposed".
        for (const name of ["server_list", "server_exec", "bash_sandbox"]) {
            expect(catalogued.has(name), `${name} must be in the catalog`).toBe(true);
        }
    });

    it("does not list tools that no longer exist", () => {
        const stale = [...catalogued].filter((n) => !registered.has(n)).sort();
        expect(stale, "Catalog lists tools with no implementation — they would toggle nothing.").toEqual([]);
    });
});
