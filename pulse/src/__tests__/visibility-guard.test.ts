import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Row visibility cannot be re-implemented ad hoc.
 *
 * The realistic failure in multi-user work is not a wrong rule — it is the right
 * rule applied in nineteen query sites and forgotten in the twentieth, which
 * shows one customer's private note to a colleague. A reviewer will not catch
 * that reliably; this will.
 *
 * The rule: a file that reads a scoped table must import the visibility helper.
 * Deliberately blunt. It cannot prove the predicate is used correctly, only that
 * whoever wrote the query had to think about it — which is the failure mode that
 * actually happens.
 *
 * See docs/MULTI_USER_PLAN.md and dashboard/src/utils/visibility.ts.
 */

const SCOPED = ["conversations", "contacts", "notes", "todos", "bookmarks", "expenses", "documents"];
const DASH = join(process.cwd(), "..", "dashboard", "src");

/*
 * Files that read a scoped table but legitimately must not filter by user.
 * Every entry needs a reason — an allowlist without reasons becomes the place
 * exceptions go to hide.
 */
const ALLOWED: Record<string, string> = {
    "app/dashboard/conversations/actions.ts": "cross-channel admin view; deletion is tenant-checked",
    "app/dashboard/conversations/ConversationsClient.tsx": "client component, no db access",
    "app/dashboard/assistant/actions.ts": "chat scoping is by contact id, its own mechanism",
    "app/dashboard/assistant/history/page.tsx": "delegates to assistant/actions.ts",
    "utils/run-queries.ts": "reads agent_runs, which is not a scoped table",
    "app/admin/conversations/page.tsx": "admin plane — cross-tenant support view, gated by requireAdmin",
    "app/admin/conversations/[id]/page.tsx": "admin plane — cross-tenant support view, gated by requireAdmin",
};

function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e)) out.push(p);
    }
    return out;
}

describe("row visibility is never hand-rolled", () => {
    it("every file querying a scoped table imports the visibility helper", () => {
        const offenders: string[] = [];
        for (const file of walk(DASH)) {
            const rel = file.slice(DASH.length + 1);
            if (rel.startsWith("utils/visibility")) continue;
            if (ALLOWED[rel]) continue;

            const src = readFileSync(file, "utf8");
            // A real query against a scoped table, not a mention of the word.
            const queries = SCOPED.some((t) =>
                new RegExp(`\\.from\\(${t}\\)|db\\.query\\.${t}\\.`).test(src));
            if (!queries) continue;

            if (!/utils\/visibility/.test(src)) offenders.push(rel);
        }

        expect(offenders,
            `These read a scoped table without the visibility helper. Use scopedTo()/visibleTo() ` +
            `from utils/visibility, or add the file to ALLOWED with the reason it must not filter:\n  ` +
            offenders.join("\n  ")).toEqual([]);
    });

    it("the allowlist explains itself", () => {
        for (const [file, reason] of Object.entries(ALLOWED)) {
            expect(reason.length, `${file} needs a real reason`).toBeGreaterThan(15);
        }
    });
});
