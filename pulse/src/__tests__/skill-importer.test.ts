import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { importSkillsFromDirectory, catalogueLine } from "../skills/skill-importer.js";

const REF = join(process.cwd(), "..", "openclaw_ref", "skills");

function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "skills-"));
    for (const [rel, content] of Object.entries(files)) {
        const full = join(root, rel);
        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, content);
    }
    return root;
}
const skill = (name: string, desc = "does a thing") => `---\nname: ${name}\ndescription: ${desc}\n---\nbody for ${name}`;

describe("importing a pack", () => {
    it("imports the real corpus and reports what it could not use", () => {
        const r = importSkillsFromDirectory(REF);
        expect(r.skills.length).toBeGreaterThan(40);
        // One bad file must not sink the import — this is the whole point.
        expect(r.skipped.map((s) => s.path)).toEqual(["canvas/SKILL.md"]);
        expect(r.skipped[0].reason).toMatch(/frontmatter/);
        // Every kept skill carries an identity an assignment can point at.
        expect(r.skills.every((s) => !!s.qualifiedName)).toBe(true);
    });

    it("finds skills nested under category folders", () => {
        // The upstream packs group by department (finance/, legal/…).
        const root = fixture({
            "finance/invoicing/SKILL.md": skill("invoicing"),
            "legal/nda-review/SKILL.md": skill("nda-review"),
        });
        const names = importSkillsFromDirectory(root).skills.map((s) => s.name).sort();
        expect(names).toEqual(["invoicing", "nda-review"]);
        rmSync(root, { recursive: true, force: true });
    });

    it("keeps same-named skills that belong to different plugins", () => {
        /*
         * The case that made this necessary: claude-for-legal ships TWELVE
         * different skills called `customize`, one per legal plugin, each with
         * different content. Keying on the bare name kept one and silently
         * dropped eleven real skills.
         */
        const root = fixture({
            "corporate-legal/skills/customize/SKILL.md": skill("customize", "for corporate"),
            "employment-legal/skills/customize/SKILL.md": skill("customize", "for employment"),
        });
        const r = importSkillsFromDirectory(root);
        expect(r.skills.map((s) => s.qualifiedName).sort())
            .toEqual(["corporate-legal/customize", "employment-legal/customize"]);
        expect(r.skipped).toEqual([]);
        rmSync(root, { recursive: true, force: true });
    });

    it("drops byte-identical copies of the same skill", () => {
        /*
         * alirezarezvani/claude-skills mirrors every skill under .claude/,
         * .codex/ and .gemini/ for different agent runtimes. Importing each
         * copy would multiply the catalogue every request pays for.
         */
        const body = skill("handoff");
        const root = fixture({
            "engineering/skills/handoff/SKILL.md": body,
            ".gemini/skills/handoff/SKILL.md": body,
            ".codex/skills/handoff/SKILL.md": body,
        });
        const r = importSkillsFromDirectory(root);
        expect(r.skills.length).toBe(1);
        expect(r.skipped.every((s) => /Identical to/.test(s.reason))).toBe(true);
        rmSync(root, { recursive: true, force: true });
    });

    it("refuses a true duplicate within one plugin", () => {
        const root = fixture({
            "p/skills/dup/SKILL.md": skill("dup", "one"),
            "p/skills/dup-again/SKILL.md": skill("dup", "two"),
        });
        const r = importSkillsFromDirectory(root);
        expect(r.skills.length).toBe(1);
        expect(r.skipped[0].reason).toMatch(/Duplicate skill 'p\/dup'/);
        rmSync(root, { recursive: true, force: true });
    });

    it("changes the pack checksum when a skill's content changes", () => {
        // This is what forces re-approval after an upstream edit.
        const a = fixture({ "x/SKILL.md": skill("x", "original") });
        const b = fixture({ "x/SKILL.md": skill("x", "edited upstream") });
        expect(importSkillsFromDirectory(a).packChecksum)
            .not.toBe(importSkillsFromDirectory(b).packChecksum);
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
    });

    it("does NOT change the checksum when a skill moves within its plugin", () => {
        // A reshuffle inside a plugin is not a content change, and forcing
        // re-approval for it would train people to approve without reading.
        const a = fixture({ "p/skills/m/SKILL.md": skill("m") });
        const b = fixture({ "p/skills/nested/deeper/m/SKILL.md": skill("m") });
        expect(importSkillsFromDirectory(a).packChecksum)
            .toBe(importSkillsFromDirectory(b).packChecksum);
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
    });

    it("DOES change the checksum when a skill moves to a different plugin", () => {
        // Identity is plugin + name, so this is a different skill: any agent
        // assigned `corporate-legal/customize` must not silently start running
        // the employment-legal one.
        const a = fixture({ "corporate-legal/skills/customize/SKILL.md": skill("customize") });
        const b = fixture({ "employment-legal/skills/customize/SKILL.md": skill("customize") });
        expect(importSkillsFromDirectory(a).packChecksum)
            .not.toBe(importSkillsFromDirectory(b).packChecksum);
        rmSync(a, { recursive: true, force: true });
        rmSync(b, { recursive: true, force: true });
    });

    it("does not walk into node_modules or .git", () => {
        const root = fixture({
            "real/SKILL.md": skill("real"),
            "node_modules/pkg/SKILL.md": skill("vendored"),
            ".git/hooks/SKILL.md": skill("gitjunk"),
        });
        expect(importSkillsFromDirectory(root).skills.map((s) => s.name)).toEqual(["real"]);
        rmSync(root, { recursive: true, force: true });
    });

    it("returns a reason, not a throw, for a missing folder", () => {
        const r = importSkillsFromDirectory(join(tmpdir(), "definitely-not-here-12345"));
        expect(r.skills).toEqual([]);
        expect(r.skipped[0].reason).toMatch(/not found/);
    });

    it("keeps the catalogue line to one line per skill", () => {
        // Anything multi-line here multiplies across every request.
        for (const s of importSkillsFromDirectory(REF).skills) {
            expect(catalogueLine(s)).not.toMatch(/\n/);
        }
    });
});
