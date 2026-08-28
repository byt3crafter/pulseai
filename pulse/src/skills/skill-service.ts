/**
 * Resolving which skills an agent actually carries.
 *
 * This is the whole gating chain in one query, deliberately: the failure that
 * matters is a skill reaching an agent it was never granted to, and that is far
 * easier to prevent in one place than to check in four callers.
 *
 *   admin approved the PACK  →  tenant GRANTED the skill  →  agent ASSIGNED it
 *
 * Every step is required. Miss any one and the skill does not load.
 *
 * See docs/SKILLS_PLAN.md.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../storage/db.js";
import {
    skillPacks,
    skillDefinitions,
    tenantSkillGrants,
    agentSkillAssignments,
} from "../storage/schema.js";
import { logger } from "../utils/logger.js";

export interface ResolvedSkill {
    id: string;
    qualifiedName: string;
    description: string;
    requiresBins: string[];
}

/**
 * A pack counts as approved only when what an admin signed off still matches
 * what the pack now contains.
 *
 * Expressed as SQL rather than fetched-and-compared so it cannot be forgotten
 * by a caller. A tenant-authored skill has no pack and needs no approval — the
 * workspace wrote it themselves.
 */
const PACK_APPROVED = sql`(
    ${skillDefinitions.packId} IS NULL
    OR EXISTS (
        SELECT 1 FROM skill_packs p
         WHERE p.id = ${skillDefinitions.packId}
           AND p.approved_checksum IS NOT NULL
           AND p.approved_checksum = p.pack_checksum
    )
)`;

/**
 * The catalogue for one agent: name + description only.
 *
 * Bodies are excluded on purpose. Across the three real upstream packs, 802
 * skills' descriptions are ~64k tokens and their bodies are far more; a
 * catalogue that carried bodies would cost more per message than the
 * conversation it is part of.
 */
export async function getAgentSkills(
    tenantId: string,
    agentProfileId: string,
): Promise<ResolvedSkill[]> {
    try {
        const rows = await db
            .select({
                id: skillDefinitions.id,
                qualifiedName: skillDefinitions.qualifiedName,
                description: skillDefinitions.description,
                requiresBins: skillDefinitions.requiresBins,
            })
            .from(agentSkillAssignments)
            .innerJoin(skillDefinitions, eq(skillDefinitions.id, agentSkillAssignments.skillId))
            .innerJoin(
                tenantSkillGrants,
                and(
                    eq(tenantSkillGrants.skillId, skillDefinitions.id),
                    eq(tenantSkillGrants.tenantId, tenantId),
                    eq(tenantSkillGrants.enabled, true),
                ),
            )
            .where(
                and(
                    eq(agentSkillAssignments.agentProfileId, agentProfileId),
                    // Assignments carry the tenant too, so a stale row pointing
                    // at a re-homed agent cannot cross a workspace boundary.
                    eq(agentSkillAssignments.tenantId, tenantId),
                    PACK_APPROVED,
                ),
            )
            .orderBy(skillDefinitions.qualifiedName);

        return rows.map((r) => ({
            id: r.id,
            qualifiedName: r.qualifiedName,
            description: r.description,
            requiresBins: Array.isArray(r.requiresBins) ? (r.requiresBins as string[]) : [],
        }));
    } catch (err) {
        // A skills failure must never take down a conversation: the agent
        // simply has no skills this turn, which is the pre-Phase-3 behaviour.
        logger.warn({ err, tenantId, agentProfileId }, "Failed to resolve agent skills (non-fatal)");
        return [];
    }
}

/**
 * One skill's body, re-checked through the same chain.
 *
 * The agent supplies the name, so this cannot trust it: without re-checking,
 * an agent that had seen a name once could read any skill in the deployment,
 * including another tenant's authored one.
 */
export async function readAgentSkill(
    tenantId: string,
    agentProfileId: string,
    qualifiedName: string,
): Promise<{ qualifiedName: string; body: string } | null> {
    try {
        const rows = await db
            .select({
                qualifiedName: skillDefinitions.qualifiedName,
                body: skillDefinitions.body,
            })
            .from(agentSkillAssignments)
            .innerJoin(skillDefinitions, eq(skillDefinitions.id, agentSkillAssignments.skillId))
            .innerJoin(
                tenantSkillGrants,
                and(
                    eq(tenantSkillGrants.skillId, skillDefinitions.id),
                    eq(tenantSkillGrants.tenantId, tenantId),
                    eq(tenantSkillGrants.enabled, true),
                ),
            )
            .where(
                and(
                    eq(agentSkillAssignments.agentProfileId, agentProfileId),
                    eq(agentSkillAssignments.tenantId, tenantId),
                    eq(skillDefinitions.qualifiedName, qualifiedName),
                    PACK_APPROVED,
                ),
            )
            .limit(1);

        return rows[0] ?? null;
    } catch (err) {
        logger.warn({ err, tenantId, agentProfileId }, "Failed to read skill (non-fatal)");
        return null;
    }
}

/**
 * The catalogue section for the system prompt.
 *
 * Returns empty when the agent has no skills, so nothing is added to the prompt
 * at all — an agent without skills must cost exactly what it costs today.
 */
export function formatSkillCatalogue(skills: ResolvedSkill[]): string {
    if (skills.length === 0) return "";
    const lines = skills.map((s) => `- ${s.qualifiedName}: ${s.description.replace(/\s+/g, " ").trim()}`);
    return [
        "\n\n## Skills",
        "",
        "Playbooks you can consult. Each line is a name and when it applies.",
        "When one fits the task, call `skill_read` with its name to get the full",
        "instructions BEFORE acting. Do not guess a skill's contents from its",
        "description, and do not mention this list to the user.",
        "",
        ...lines,
    ].join("\n");
}

/**
 * Persist an import into a pack, replacing its skills.
 *
 * Replace rather than merge: a skill deleted upstream must disappear here too,
 * and a merge would leave it assigned to agents forever. Assignments and grants
 * pointing at a removed skill go with it (ON DELETE CASCADE), which is the
 * honest outcome — the skill genuinely no longer exists.
 *
 * The pack is left UNAPPROVED whenever its content hash changes, so importing
 * never silently changes what an agent is told to do.
 */
export async function persistImport(
    packId: string,
    report: { skills: any[]; skipped: { path: string; reason: string }[]; packChecksum: string },
): Promise<{ inserted: number; approvalCleared: boolean }> {
    const existing = await db
        .select({ approvedChecksum: skillPacks.approvedChecksum })
        .from(skillPacks)
        .where(eq(skillPacks.id, packId))
        .limit(1);

    const approvalCleared =
        !!existing[0]?.approvedChecksum && existing[0].approvedChecksum !== report.packChecksum;

    await db.transaction(async (tx) => {
        await tx.delete(skillDefinitions).where(eq(skillDefinitions.packId, packId));

        if (report.skills.length > 0) {
            // Chunked: a pack can carry 800+ skills and a single insert of that
            // size exceeds the parameter limit.
            for (let i = 0; i < report.skills.length; i += 200) {
                await tx.insert(skillDefinitions).values(
                    report.skills.slice(i, i + 200).map((s) => ({
                        packId,
                        name: s.name,
                        plugin: s.plugin ?? null,
                        qualifiedName: s.qualifiedName,
                        description: s.description,
                        body: s.body,
                        requiresBins: s.requiresBins ?? [],
                        sourcePath: s.sourcePath ?? null,
                        checksum: s.checksum,
                    })),
                );
            }
        }

        await tx
            .update(skillPacks)
            .set({
                packChecksum: report.packChecksum,
                skillCount: report.skills.length,
                skippedCount: report.skipped.length,
                skipped: report.skipped.slice(0, 500),
                lastImportAt: new Date(),
                lastImportError: null,
                updatedAt: new Date(),
            })
            .where(eq(skillPacks.id, packId));
    });

    return { inserted: report.skills.length, approvalCleared };
}
