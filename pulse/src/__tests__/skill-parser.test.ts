import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseSkill, SkillParseError } from "../skills/skill-parser.js";

/*
 * Parsed against the 52 real SKILL.md files vendored in openclaw_ref, not
 * against fixtures written to match the parser. A hand-rolled parser that only
 * ever sees its author's own examples is a parser that works exactly once.
 */
const REF = join(process.cwd(), "..", "openclaw_ref", "skills");

describe("SKILL.md parsing", () => {
    it("reads a real skill end to end", () => {
        const s = parseSkill(readFileSync(join(REF, "weather", "SKILL.md"), "utf8"));
        expect(s.name).toBe("weather");
        expect(s.description).toContain("weather");
        expect(s.body).toContain("# Weather Skill");
        // metadata: { "openclaw": { "requires": { "bins": ["curl"] } } }
        expect(s.requiresBins).toEqual(["curl"]);
    });

    it("parses the real corpus, and rejects exactly the one that is malformed", () => {
        const dirs = readdirSync(REF).filter((d) => existsSync(join(REF, d, "SKILL.md")));
        expect(dirs.length).toBeGreaterThan(40); // sanity: the corpus is actually there

        const ok: string[] = [];
        const rejected: string[] = [];
        for (const d of dirs) {
            try {
                const s = parseSkill(readFileSync(join(REF, d, "SKILL.md"), "utf8"), d);
                expect(s.name).toBeTruthy();
                expect(s.description).toBeTruthy();
                ok.push(d);
            } catch {
                rejected.push(d);
            }
        }

        /*
         * `canvas` ships with no frontmatter at all — a real file in a real
         * upstream repo. It is rejected on purpose: with no description it
         * could never be chosen from the catalogue, so importing it would add
         * weight for nothing.
         *
         * The number that matters is that everything else parses. An importer
         * pulling 200 skills must not be stopped by one bad file, which is why
         * importSkills below collects failures instead of throwing.
         */
        expect(rejected).toEqual(["canvas"]);
        expect(ok.length).toBe(dirs.length - 1);
    });

    it("keeps the catalogue cost near the measured 1.7k tokens for ~52 skills", () => {
        // The number the whole design rests on. If descriptions ever balloon,
        // the progressive-disclosure budget is wrong and this should say so.
        const dirs = readdirSync(REF).filter((d) => existsSync(join(REF, d, "SKILL.md")));
        const total = dirs.reduce((n, d) => {
            try {
                const s = parseSkill(readFileSync(join(REF, d, "SKILL.md"), "utf8"), d);
                return n + s.name.length + s.description.length;
            } catch {
                return n; // unparseable never reaches the catalogue
            }
        }, 0);
        expect(total / 4).toBeLessThan(3000); // tokens, roughly
    });

    it("rejects a file with no frontmatter", () => {
        expect(() => parseSkill("# Just markdown")).toThrow(SkillParseError);
    });

    it("rejects a skill with no description — it could never be chosen", () => {
        expect(() => parseSkill("---\nname: x\n---\nbody")).toThrow(/could never be selected/);
    });

    it("rejects a name that would not survive being an identifier", () => {
        // A name is a catalogue key and a tool argument. Rewriting it silently
        // would break the assignment that points at it.
        expect(() => parseSkill("---\nname: Bad Name!\ndescription: d\n---\nb")).toThrow(/not usable/);
        expect(() => parseSkill(`---\nname: ${"x".repeat(120)}\ndescription: d\n---\nb`)).toThrow(/not usable/);
    });

    it("accepts the namespaced names upstream packs actually use", () => {
        // Real names from the Anthropic packs. Rejecting these dropped skills.
        expect(parseSkill("---\nname: contact-center/android\ndescription: d\n---\nb").name)
            .toBe("contact-center/android");
        expect(parseSkill("---\nname: cocounsel-legal:deep-research\ndescription: d\n---\nb").name)
            .toBe("cocounsel-legal:deep-research");
    });

    it("falls back to the folder name when frontmatter omits one", () => {
        expect(parseSkill("---\ndescription: d\n---\nbody", "my-skill").name).toBe("my-skill");
    });

    it("handles CRLF and a UTF-8 BOM", () => {
        // Files come from public repos and Windows contributors exist.
        const s = parseSkill("﻿---\r\nname: crlf\r\ndescription: d\r\n---\r\nbody\r\n");
        expect(s.name).toBe("crlf");
        expect(s.body).toBe("body");
    });

    it("does not mistake a '---' inside the body for the end of frontmatter", () => {
        const s = parseSkill("---\nname: hr\ndescription: d\n---\nintro\n\n---\n\nmore");
        expect(s.body).toContain("more");
        expect(s.description).toBe("d");
    });
});

/*
 * YAML block scalars.
 *
 * Not an edge case: 179 of the 802 skills in the three real upstream packs
 * write their description as a folded or literal block — 126 of the 151 in
 * claude-for-legal alone. Reading the value as ">" gave those skills a
 * one-character description, and since the description is the ONLY thing the
 * agent sees in the catalogue, every one of them would have been impossible to
 * choose. The feature would have looked broken for a quarter of what it loaded.
 */
describe("block scalars", () => {
    it("folds a '>' description onto one line", () => {
        const s = parseSkill("---\nname: a\ndescription: >\n  first line\n  second line\n---\nbody");
        expect(s.description).toBe("first line second line");
    });

    it("keeps newlines for a '|' description", () => {
        const s = parseSkill("---\nname: a\ndescription: |\n  first\n  second\n---\nbody");
        expect(s.description).toBe("first\nsecond");
    });

    it("handles chomping indicators ('>-', '|+')", () => {
        expect(parseSkill("---\nname: a\ndescription: >-\n  x y\n---\nb").description).toBe("x y");
        expect(parseSkill("---\nname: a\ndescription: |+\n  x\n---\nb").description).toBe("x");
    });

    it("ends the block at the next unindented key", () => {
        const s = parseSkill("---\nname: a\ndescription: >\n  the text\nhomepage: http://x\n---\nbody");
        expect(s.description).toBe("the text");
        expect(s.meta.homepage).toBe("http://x");
    });

    it("keeps the body out of the block", () => {
        const s = parseSkill("---\nname: a\ndescription: >\n  desc\n---\nreal body here");
        expect(s.body).toBe("real body here");
    });

    it("every vendored skill ends up with a usable description", () => {
        // A one-character description means the parser silently mangled it.
        const dirs = readdirSync(REF).filter((d) => existsSync(join(REF, d, "SKILL.md")));
        for (const d of dirs) {
            try {
                const s = parseSkill(readFileSync(join(REF, d, "SKILL.md"), "utf8"), d);
                expect(s.description.length, `${d} has a mangled description`).toBeGreaterThan(11);
            } catch {
                /* the one file with no frontmatter is covered above */
            }
        }
    });
});
