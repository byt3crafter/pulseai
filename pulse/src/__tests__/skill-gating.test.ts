import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatSkillCatalogue } from "../skills/skill-service.js";

/*
 * The gating chain, asserted at the source.
 *
 * Same reasoning as the memory and sharing tests: the dangerous failure is a
 * MISSING clause, not a wrong one. A resolver that forgot the tenant grant
 * still returns skills, still looks correct in every happy-path test, and
 * quietly hands an agent something the workspace never admitted.
 */
const src = readFileSync(join(process.cwd(), "src", "skills", "skill-service.ts"), "utf8");

// Both entry points must enforce the whole chain, not just the listing one.
const fns = ["getAgentSkills", "readAgentSkill"];
function bodyOf(fn: string): string {
    const start = src.indexOf(`export async function ${fn}`);
    expect(start).toBeGreaterThan(-1);
    const rest = src.slice(start + 1);
    const end = rest.indexOf("\nexport ");
    return end === -1 ? rest : rest.slice(0, end);
}

describe("a skill reaches an agent only through all three gates", () => {
    it.each(fns)("%s requires the agent assignment", (fn) => {
        expect(bodyOf(fn)).toMatch(/eq\(agentSkillAssignments\.agentProfileId, agentProfileId\)/);
    });

    it.each(fns)("%s requires an enabled tenant grant", (fn) => {
        const b = bodyOf(fn);
        expect(b).toMatch(/eq\(tenantSkillGrants\.tenantId, tenantId\)/);
        expect(b).toMatch(/eq\(tenantSkillGrants\.enabled, true\)/);
    });

    it.each(fns)("%s requires the pack to still be approved", (fn) => {
        expect(bodyOf(fn)).toMatch(/PACK_APPROVED/);
    });

    it.each(fns)("%s scopes the assignment to the tenant as well as the agent", (fn) => {
        // Without this a stale assignment row for a re-homed agent would cross
        // a workspace boundary.
        expect(bodyOf(fn)).toMatch(/eq\(agentSkillAssignments\.tenantId, tenantId\)/);
    });

    it("approval means the approved hash still matches the current content", () => {
        // Approving once must not bless every future upstream edit.
        expect(src).toMatch(/approved_checksum\s+IS NOT NULL/);
        expect(src).toMatch(/approved_checksum\s*=\s*p\.pack_checksum/);
    });

    it("a tenant's own authored skill needs no pack approval", () => {
        // It has no pack, and the workspace wrote it themselves.
        expect(src).toMatch(/packId\} IS NULL/);
    });

    it("re-resolves the body instead of trusting the name the agent supplied", () => {
        // The agent chooses the argument. If readAgentSkill looked the name up
        // without the chain, an agent could read any skill in the deployment.
        expect(bodyOf("readAgentSkill")).toMatch(/eq\(skillDefinitions\.qualifiedName, qualifiedName\)/);
    });

    it("fails closed — a broken query yields no skills, never all of them", () => {
        expect(src).toMatch(/catch[\s\S]{0,300}return \[\]/);
        expect(src).toMatch(/catch[\s\S]{0,300}return null/);
    });
});

describe("the catalogue costs nothing when unused", () => {
    it("adds absolutely nothing to the prompt for an agent with no skills", () => {
        // An agent without skills must cost exactly what it costs today.
        expect(formatSkillCatalogue([])).toBe("");
    });

    it("emits one line per skill and never a body", () => {
        const out = formatSkillCatalogue([
            { id: "1", qualifiedName: "legal/nda", description: "Review an NDA", requiresBins: [] },
            { id: "2", qualifiedName: "fin/invoice", description: "Raise an invoice", requiresBins: [] },
        ]);
        expect(out).toContain("- legal/nda: Review an NDA");
        expect(out).toContain("- fin/invoice: Raise an invoice");
        expect(out.split("\n").filter((l) => l.startsWith("- ")).length).toBe(2);
    });

    it("flattens a multi-line description onto one line", () => {
        // Descriptions come from third-party files; a stray newline in one
        // would corrupt the list for every request that carries it.
        const out = formatSkillCatalogue([
            { id: "1", qualifiedName: "a/b", description: "first\nsecond   third", requiresBins: [] },
        ]);
        expect(out).toContain("- a/b: first second third");
        expect(out.split("\n").filter((l) => l.startsWith("- ")).length).toBe(1);
    });

    it("tells the agent to read before acting, not to guess from the description", () => {
        const out = formatSkillCatalogue([
            { id: "1", qualifiedName: "a/b", description: "d", requiresBins: [] },
        ]);
        expect(out).toMatch(/skill_read/);
        expect(out).toMatch(/BEFORE acting/);
    });
});
