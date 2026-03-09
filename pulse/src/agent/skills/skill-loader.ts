/**
 * Skill Loader — Discovers, parses, and resolves skills for agents.
 *
 * Skills are markdown documents injected into the system prompt that teach
 * the LLM how to use tools effectively. Unlike tools (which define capabilities),
 * skills encode procedures, patterns, and domain knowledge.
 *
 * Resolution chain:
 * 1. Load all built-in skills from disk (*.skill.md)
 * 2. Check admin global defaults (globalSettings.gatewayConfig.defaultSkills)
 * 3. Apply agent overrides (agentProfiles.skillConfig)
 * 4. Add custom agent skills
 * 5. Return final list of enabled skills
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "../../storage/db.js";
import { globalSettings, agentProfiles } from "../../storage/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SkillEntry {
    name: string;
    description: string;
    body: string;
    source: "built-in" | "custom";
}

export interface SkillConfig {
    enabledBuiltIn?: string[];
    disabledBuiltIn?: string[];
    customSkills?: Array<{
        name: string;
        description: string;
        body: string;
    }>;
}

// ─── Parsing ──────────────────────────────────────────────────────

/**
 * Parse a .skill.md file with YAML frontmatter into a SkillEntry.
 * Expects format:
 * ---
 * name: skill-name
 * description: When to use this skill
 * ---
 * # Markdown body...
 */
export function parseSkillFile(content: string): SkillEntry | null {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const frontmatter = match[1];
    const body = match[2].trim();

    // Simple YAML parsing for name and description
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

    if (!nameMatch || !descMatch) return null;

    return {
        name: nameMatch[1].trim(),
        description: descMatch[1].trim(),
        body,
        source: "built-in",
    };
}

// ─── Loading ──────────────────────────────────────────────────────

let _builtInCache: SkillEntry[] | null = null;

/**
 * Load all built-in skills from the skills directory.
 * Results are cached in memory after first load.
 */
export function loadBuiltInSkills(): SkillEntry[] {
    if (_builtInCache) return _builtInCache;

    const skills: SkillEntry[] = [];
    const skillsDir = __dirname;

    try {
        const files = readdirSync(skillsDir).filter((f) => f.endsWith(".skill.md"));
        for (const file of files) {
            const content = readFileSync(join(skillsDir, file), "utf-8");
            const skill = parseSkillFile(content);
            if (skill) {
                skills.push(skill);
            } else {
                logger.warn({ file }, "Failed to parse skill file");
            }
        }
        logger.info({ count: skills.length, skills: skills.map((s) => s.name) }, "Loaded built-in skills");
    } catch (err) {
        logger.error({ err }, "Failed to load built-in skills directory");
    }

    _builtInCache = skills;
    return skills;
}

/**
 * Clear the built-in skills cache (useful for testing or hot-reload).
 */
export function clearSkillCache(): void {
    _builtInCache = null;
}

// ─── Resolution ───────────────────────────────────────────────────

/**
 * Resolve the final set of skills for a given agent.
 *
 * Resolution chain:
 * 1. Load all built-in skills
 * 2. Get admin default skills (if set)
 * 3. Apply agent overrides (enable/disable)
 * 4. Add agent custom skills
 */
export async function resolveAgentSkills(
    tenantId: string,
    agentProfileId: string
): Promise<SkillEntry[]> {
    const builtIn = loadBuiltInSkills();

    // Get admin global defaults
    let defaultSkills: string[] | null = null;
    try {
        const settings = await db.query.globalSettings.findFirst({
            where: eq(globalSettings.id, "root"),
        });
        const gatewayConfig = settings?.gatewayConfig as any;
        if (gatewayConfig?.defaultSkills && Array.isArray(gatewayConfig.defaultSkills)) {
            defaultSkills = gatewayConfig.defaultSkills;
        }
    } catch (err) {
        logger.warn({ err }, "Failed to load global default skills");
    }

    // Get agent-level overrides
    let skillConfig: SkillConfig = {};
    try {
        const profile = await db.query.agentProfiles.findFirst({
            where: eq(agentProfiles.id, agentProfileId),
        });
        if (profile?.skillConfig && typeof profile.skillConfig === "object") {
            skillConfig = profile.skillConfig as SkillConfig;
        }
    } catch (err) {
        logger.warn({ err }, "Failed to load agent skill config");
    }

    // Resolve which built-in skills are enabled
    const enabledSkills: SkillEntry[] = [];

    for (const skill of builtIn) {
        // If agent explicitly disabled this skill, skip it
        if (skillConfig.disabledBuiltIn?.includes(skill.name)) {
            continue;
        }

        // If agent explicitly enabled this skill, include it
        if (skillConfig.enabledBuiltIn?.includes(skill.name)) {
            enabledSkills.push(skill);
            continue;
        }

        // Fall back to admin defaults
        if (defaultSkills !== null) {
            // Admin has set defaults — only include if in the list
            if (defaultSkills.includes(skill.name)) {
                enabledSkills.push(skill);
            }
        } else {
            // No admin defaults set — all built-in skills enabled by default
            enabledSkills.push(skill);
        }
    }

    // Add custom skills from agent config
    if (skillConfig.customSkills) {
        for (const custom of skillConfig.customSkills) {
            enabledSkills.push({
                name: custom.name,
                description: custom.description,
                body: custom.body,
                source: "custom",
            });
        }
    }

    return enabledSkills;
}

// ─── Formatting ───────────────────────────────────────────────────

/**
 * Format resolved skills into a system prompt section.
 */
export function formatSkillsForPrompt(skills: SkillEntry[]): string {
    if (skills.length === 0) return "";

    const sections = skills.map((skill) => {
        return `### Skill: ${skill.name}\n_${skill.description}_\n\n${skill.body}`;
    });

    return [
        "## Skills (Tool Usage Guidance)",
        "The following skills provide detailed guidance on how to use your tools effectively.",
        "",
        ...sections,
    ].join("\n");
}
