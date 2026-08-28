/**
 * SKILL.md parsing.
 *
 * A skill is YAML frontmatter plus a markdown body. Only three things matter to
 * Pulse: the `name` (identity), the `description` (the one line that goes in
 * every prompt), and the body (fetched on demand).
 *
 * Deliberately hand-rolled rather than pulling a YAML dependency. The
 * frontmatter we must read is flat scalars plus one nested `metadata` object,
 * and a full YAML parser on untrusted third-party files is a larger attack
 * surface than the thing it parses — these files come from public repos.
 * Anything we cannot parse is reported, never guessed at.
 *
 * See docs/SKILLS_PLAN.md.
 */

export interface ParsedSkill {
    name: string;
    description: string;
    body: string;
    /** Binaries or tools the skill says it needs, for the assignment warning. */
    requiresBins: string[];
    /** Everything else in the frontmatter, kept verbatim for display. */
    meta: Record<string, string>;
}

export class SkillParseError extends Error {}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * A skill name becomes part of a prompt catalogue and a tool argument, so it is
 * constrained rather than trusted. `/` and `:` are allowed because upstream
 * packs genuinely use them as namespace separators — `contact-center/android`
 * and `cocounsel-legal:deep-research` are real names in the Anthropic packs,
 * and rejecting them dropped working skills on the floor.
 *
 * Anything outside this set is a parse failure, not a silent rewrite: a skill
 * whose name changed on import would no longer match its assignment.
 */
const NAME_RE = /^[a-z0-9][a-z0-9_\-\/:]{0,95}$/;

function stripQuotes(v: string): string {
    const t = v.trim();
    if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
        return t.slice(1, -1);
    }
    return t;
}

/** Pull `bins` out of the loosely-shaped `metadata` line, if present. */
function extractBins(frontmatter: string): string[] {
    // e.g. metadata: { "openclaw": { "requires": { "bins": ["curl","jq"] } } }
    const m = frontmatter.match(/"bins"\s*:\s*\[([^\]]*)\]/);
    if (!m) return [];
    return m[1]
        .split(",")
        .map((s) => stripQuotes(s))
        .filter(Boolean);
}

export function parseSkill(source: string, fallbackName?: string): ParsedSkill {
    const match = FRONTMATTER.exec(source.replace(/^﻿/, ""));
    if (!match) {
        throw new SkillParseError("No YAML frontmatter — a SKILL.md must open with a '---' block.");
    }
    const [, frontmatter, body] = match;

    const meta: Record<string, string> = {};
    const lines = frontmatter.split(/\r?\n/);
    let currentKey: string | null = null;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];

        // A list item continues the previous key (read_when: / - a / - b).
        if (/^\s*-\s+/.test(raw)) {
            if (currentKey) {
                const item = stripQuotes(raw.replace(/^\s*-\s+/, ""));
                meta[currentKey] = meta[currentKey] ? `${meta[currentKey]}; ${item}` : item;
            }
            continue;
        }

        const kv = raw.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
        if (!kv) continue;
        currentKey = kv[1];
        const rawValue = kv[2].trim();

        /*
         * YAML block scalars: `description: >` (folded) or `|` (literal),
         * with an optional chomping indicator, followed by indented lines.
         *
         * Not an edge case — 179 of the 802 skills in the three upstream packs
         * write their description this way, including 126 of the 151 in
         * claude-for-legal. Reading the value as ">" gave those skills a
         * one-character description, and since the description is the only
         * thing the agent ever sees in the catalogue, every one of them would
         * have been impossible to choose.
         */
        if (/^[|>][-+]?[0-9]*$/.test(rawValue)) {
            const folded = rawValue.startsWith(">");
            const block: string[] = [];
            while (i + 1 < lines.length) {
                const next = lines[i + 1];
                // A blank line belongs to the block; a non-indented line ends it.
                if (next.trim() !== "" && !/^\s/.test(next)) break;
                block.push(next.trim());
                i++;
            }
            while (block.length && block.at(-1) === "") block.pop();
            const value = folded ? block.join(" ").replace(/\s+/g, " ").trim() : block.join("\n").trim();
            if (value) meta[currentKey] = value;
            continue;
        }

        const value = stripQuotes(rawValue);
        if (value) meta[currentKey] = value;
    }

    const name = (meta.name || fallbackName || "").trim().toLowerCase();
    if (!name) throw new SkillParseError("Skill has no 'name' in its frontmatter.");
    if (!NAME_RE.test(name)) {
        throw new SkillParseError(
            `Skill name '${name}' is not usable — expected lowercase letters, digits, '-', '_', '/' or ':' (max 96).`,
        );
    }

    const description = (meta.description || "").trim();
    if (!description) {
        // The description is the ONLY thing most requests ever see. A skill
        // without one can never be chosen, so importing it silently would just
        // add weight to the catalogue for nothing.
        throw new SkillParseError(`Skill '${name}' has no 'description' — it could never be selected.`);
    }

    return {
        name,
        description,
        body: body.trim(),
        requiresBins: extractBins(frontmatter),
        meta,
    };
}
