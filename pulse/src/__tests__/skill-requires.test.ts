import { describe, it, expect } from "vitest";
import { parseSkillFile, loadBuiltInSkills } from "../agent/skills/skill-loader.js";

/**
 * Domain skills (ERPNext first) declare `requires:` — the tool names they teach.
 * They must reach only agents that have at least one of those tools: guidance for
 * tools an agent cannot call costs prompt tokens and invites hallucinated calls.
 */
describe("skill `requires:` frontmatter", () => {
    it("parses a comma-separated tool list", () => {
        const s = parseSkillFile("---\nname: x\ndescription: d\nrequires: erpnext_list, erpnext_get\n---\nbody");
        expect(s?.requires).toEqual(["erpnext_list", "erpnext_get"]);
    });
    it("is absent when not declared (legacy skills stay ungated)", () => {
        const s = parseSkillFile("---\nname: x\ndescription: d\n---\nbody");
        expect(s?.requires).toBeUndefined();
    });
    it("the built-in erpnext skill is gated on the erpnext tools", () => {
        const erp = loadBuiltInSkills().find((s) => s.name === "erpnext");
        expect(erp).toBeDefined();
        expect(erp!.requires).toContain("erpnext_list");
        // and it carries the two facts that caused real failures this week
        expect(erp!.body).toMatch(/docstatus/);
        expect(erp!.body).toMatch(/debit_in_account_currency/);
    });
});
