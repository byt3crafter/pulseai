/**
 * Turn a directory of skill folders into parsed skills.
 *
 * Split from the fetching deliberately: this half is pure and can be tested
 * against the real corpus, while the half that reaches the network is thin.
 *
 * See docs/SKILLS_PLAN.md.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseSkill, type ParsedSkill } from "./skill-parser.js";

export interface ImportedSkill extends ParsedSkill {
    /** Path within the pack, so a customer can find the source file. */
    sourcePath: string;
    /** Content hash — an upstream edit changes this and forces re-approval. */
    checksum: string;
    /**
     * The plugin/department this skill belongs to inside the pack, if any.
     * Upstream packs are organised as `<plugin>/skills/<skill>/SKILL.md`.
     */
    plugin: string | null;
    /** `plugin/name`, unique within a pack. See qualify() for why this exists. */
    qualifiedName: string;
}

export interface ImportReport {
    skills: ImportedSkill[];
    /** Files that looked like skills but could not be used, with the reason. */
    skipped: { path: string; reason: string }[];
    /** Hash over every skill, identifying the pack version as a whole. */
    packChecksum: string;
}

/** How deep to walk. Repos nest skills under category folders; nothing sane goes deeper. */
const MAX_DEPTH = 6;

function findSkillFiles(root: string, dir = root, depth = 0, out: string[] = []): string[] {
    if (depth > MAX_DEPTH) return out;
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const entry of entries) {
        // Skip VCS and dependency directories rather than walking into them —
        // node_modules in a skills repo would take minutes and find nothing.
        if (entry === ".git" || entry === "node_modules" || entry === ".github") continue;
        const full = join(dir, entry);
        let st;
        try {
            st = statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) findSkillFiles(root, full, depth + 1, out);
        else if (entry === "SKILL.md") out.push(full);
    }
    return out;
}

/**
 * Which plugin inside the pack a skill belongs to.
 *
 * Upstream packs lay out as `<plugin>/skills/<skill>/SKILL.md`, and the plugin
 * is part of the identity — `claude-for-legal` ships FOUR different skills all
 * named `customize`, one each for ai-governance, corporate, employment and
 * legal-builder-hub, with four different checksums. Keying on the bare name
 * would have silently kept one and dropped three real skills.
 */
function pluginOf(relPath: string): string | null {
    const parts = relPath.split(/[/\\]/);
    const i = parts.lastIndexOf("skills");
    if (i > 0) return parts[i - 1];
    return parts.length > 2 ? parts[0] : null;
}

function qualify(plugin: string | null, name: string): string {
    return plugin ? `${plugin}/${name}` : name;
}

/**
 * Read every SKILL.md under `root`.
 *
 * Collects failures instead of throwing. One malformed file must never stop an
 * import — `canvas` in the OpenClaw corpus ships with no frontmatter at all,
 * and a pack of 200 skills failing because of one is not a useful product.
 * Everything skipped is reported so it is visible rather than silently missing.
 */
export function importSkillsFromDirectory(root: string): ImportReport {
    if (!existsSync(root)) {
        return { skills: [], skipped: [{ path: root, reason: "Folder not found." }], packChecksum: "" };
    }

    const skills: ImportedSkill[] = [];
    const skipped: { path: string; reason: string }[] = [];
    const seenQualified = new Map<string, string>();
    const seenContent = new Map<string, string>();

    for (const file of findSkillFiles(root).sort()) {
        const rel = file.slice(root.length).replace(/^[/\\]/, "");
        let source: string;
        try {
            source = readFileSync(file, "utf8");
        } catch (e) {
            skipped.push({ path: rel, reason: `Could not read: ${(e as Error).message}` });
            continue;
        }

        // The folder name is the conventional fallback identity.
        const folder = rel.split(/[/\\]/).slice(-2, -1)[0] || "";
        try {
            const parsed = parseSkill(source, folder.toLowerCase());
            const checksum = createHash("sha256").update(source).digest("hex");
            const plugin = pluginOf(rel);
            const qualifiedName = qualify(plugin, parsed.name);

            /*
             * Identical content is the same skill, however many times a repo
             * mirrors it. `alirezarezvani/claude-skills` keeps byte-identical
             * copies under .claude/, .codex/ and .gemini/ for different agent
             * runtimes; importing four of each would quadruple the catalogue
             * every request pays for.
             */
            const sameContent = seenContent.get(checksum);
            if (sameContent) {
                skipped.push({ path: rel, reason: `Identical to ${sameContent}.` });
                continue;
            }
            const sameName = seenQualified.get(qualifiedName);
            if (sameName) {
                skipped.push({ path: rel, reason: `Duplicate skill '${qualifiedName}' (already at ${sameName}).` });
                continue;
            }
            seenContent.set(checksum, rel);
            seenQualified.set(qualifiedName, rel);
            skills.push({ ...parsed, sourcePath: rel, checksum, plugin, qualifiedName });
        } catch (e) {
            skipped.push({ path: rel, reason: (e as Error).message });
        }
    }

    // Order-independent: sorted by name, so an unrelated file move does not
    // look like a content change and force a pointless re-approval.
    const packChecksum = createHash("sha256")
        .update(
            [...skills]
                .sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName))
                .map((s) => `${s.qualifiedName}:${s.checksum}`)
                .join("\n"),
        )
        .digest("hex");

    return { skills, skipped, packChecksum };
}

/** The one line per skill that a prompt carries. Kept here so cost is measurable. */
export function catalogueLine(s: { qualifiedName: string; description: string }): string {
    // Single line, always: this is multiplied by every skill on every request.
    return `- ${s.qualifiedName}: ${s.description.replace(/\s+/g, " ").trim()}`;
}
