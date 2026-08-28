"use server";

/**
 * A workspace's skill library, and which agents carry what.
 *
 * Two steps on purpose, matching the tool-policy chain: granting admits a skill
 * into the workspace, assigning puts it on an agent. Keeping them separate is
 * what keeps the catalogue small — the three upstream packs hold 802 skills,
 * which would be ~64k tokens on every single request if one agent held them all.
 *
 * See docs/SKILLS_PLAN.md.
 */

import { db } from "../../../storage/db";
import {
    skillPacks, skillDefinitions, tenantSkillGrants, agentSkillAssignments, agentProfiles,
} from "../../../storage/schema";
import { and, eq, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../utils/tenant-auth";
import { logAudit } from "../../../utils/audit";

export interface LibrarySkill {
    id: string;
    qualifiedName: string;
    plugin: string | null;
    description: string;
    packName: string;
    granted: boolean;
    /** How many of this workspace's agents currently carry it. */
    agentCount: number;
}

/** Only skills from packs an admin has approved, and whose content still matches. */
const APPROVED = sql`(
    ${skillDefinitions.packId} IS NULL
    OR EXISTS (
        SELECT 1 FROM skill_packs p
         WHERE p.id = ${skillDefinitions.packId}
           AND p.approved_checksum IS NOT NULL
           AND p.approved_checksum = p.pack_checksum
    )
)`;

export async function listLibrary(): Promise<LibrarySkill[]> {
    const check = await requireTenant();
    if (!check.authorized) return [];

    try {
        const rows = await db
            .select({
                id: skillDefinitions.id,
                qualifiedName: skillDefinitions.qualifiedName,
                plugin: skillDefinitions.plugin,
                description: skillDefinitions.description,
                packName: skillPacks.name,
                grantEnabled: tenantSkillGrants.enabled,
            })
            .from(skillDefinitions)
            .leftJoin(skillPacks, eq(skillPacks.id, skillDefinitions.packId))
            .leftJoin(
                tenantSkillGrants,
                and(
                    eq(tenantSkillGrants.skillId, skillDefinitions.id),
                    eq(tenantSkillGrants.tenantId, check.tenantId),
                ),
            )
            .where(APPROVED)
            .orderBy(skillDefinitions.qualifiedName)
            .limit(2000);

        const counts = await db
            .select({ skillId: agentSkillAssignments.skillId, n: sql<number>`count(*)` })
            .from(agentSkillAssignments)
            .where(eq(agentSkillAssignments.tenantId, check.tenantId))
            .groupBy(agentSkillAssignments.skillId);
        const bySkill = new Map(counts.map((c) => [c.skillId, Number(c.n)]));

        return rows.map((r) => ({
            id: r.id,
            qualifiedName: r.qualifiedName,
            plugin: r.plugin,
            description: r.description,
            packName: r.packName ?? "Workspace",
            granted: r.grantEnabled === true,
            agentCount: bySkill.get(r.id) ?? 0,
        }));
    } catch (error) {
        console.error("Failed to list skill library:", error);
        return [];
    }
}

/** Add or remove skills from the workspace library. Bulk, because 800 skills. */
export async function setGrantsAction(skillIds: string[], granted: boolean) {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };

    const ids = (skillIds || []).filter(Boolean).slice(0, 2000);
    if (ids.length === 0) return { success: false, message: "Nothing selected." };

    try {
        // Only skills from approved packs may be granted — otherwise a stale id
        // from a page loaded before a revocation would slip back in.
        const allowed = await db
            .select({ id: skillDefinitions.id })
            .from(skillDefinitions)
            .where(and(inArray(skillDefinitions.id, ids), APPROVED));
        const allowedIds = allowed.map((a) => a.id);
        if (allowedIds.length === 0) return { success: false, message: "Those skills are not available." };

        if (granted) {
            await db
                .insert(tenantSkillGrants)
                .values(allowedIds.map((id) => ({ tenantId: check.tenantId, skillId: id, enabled: true, grantedBy: check.userId })))
                .onConflictDoUpdate({
                    target: [tenantSkillGrants.tenantId, tenantSkillGrants.skillId],
                    set: { enabled: true },
                });
        } else {
            /*
             * Removing a grant also removes the assignments that depended on it.
             * Leaving them would make the agent editor show skills the agent
             * cannot actually use — the resolver requires the grant.
             */
            await db.delete(agentSkillAssignments).where(
                and(
                    eq(agentSkillAssignments.tenantId, check.tenantId),
                    inArray(agentSkillAssignments.skillId, allowedIds),
                ),
            );
            await db.delete(tenantSkillGrants).where(
                and(
                    eq(tenantSkillGrants.tenantId, check.tenantId),
                    inArray(tenantSkillGrants.skillId, allowedIds),
                ),
            );
        }

        await logAudit({
            action: granted ? "skills.grant" : "skills.revoke",
            targetType: "skill",
            tenantId: check.tenantId,
            summary: `${granted ? "Added" : "Removed"} ${allowedIds.length} skill(s) ${granted ? "to" : "from"} the workspace library`,
        });
        revalidatePath("/dashboard/skills");
        return {
            success: true,
            message: granted
                ? `Added ${allowedIds.length} skill(s). Assign them to an agent to put them to work.`
                : `Removed ${allowedIds.length} skill(s) from the library and from any agent carrying them.`,
        };
    } catch (error) {
        console.error("Failed to change skill grants:", error);
        return { success: false, message: "Failed to update the library." };
    }
}

export interface AgentSkillView {
    agentId: string;
    agentName: string;
    skillIds: string[];
}

export async function listAgentAssignments(): Promise<AgentSkillView[]> {
    const check = await requireTenant();
    if (!check.authorized) return [];

    try {
        const agents = await db
            .select({ id: agentProfiles.id, name: agentProfiles.name })
            .from(agentProfiles)
            .where(eq(agentProfiles.tenantId, check.tenantId))
            .orderBy(agentProfiles.name);

        const assignments = await db
            .select({ agentProfileId: agentSkillAssignments.agentProfileId, skillId: agentSkillAssignments.skillId })
            .from(agentSkillAssignments)
            .where(eq(agentSkillAssignments.tenantId, check.tenantId));

        return agents.map((a) => ({
            agentId: a.id,
            agentName: a.name,
            skillIds: assignments.filter((x) => x.agentProfileId === a.id).map((x) => x.skillId),
        }));
    } catch (error) {
        console.error("Failed to list agent skill assignments:", error);
        return [];
    }
}

export async function setAgentSkillsAction(agentId: string, skillIds: string[]) {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };

    try {
        // The agent must belong to this workspace — the id comes from the page.
        const agent = await db.query.agentProfiles.findFirst({
            where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, check.tenantId)),
        });
        if (!agent) return { success: false, message: "Agent not found." };

        // Only skills the workspace has actually granted may be assigned.
        // Generous: the library can hold ~900, and a hard truncation here would
        // silently drop assignments the person just made.
        const ids = (skillIds || []).filter(Boolean).slice(0, 2000);
        const granted = ids.length
            ? await db
                  .select({ skillId: tenantSkillGrants.skillId })
                  .from(tenantSkillGrants)
                  .where(and(
                      eq(tenantSkillGrants.tenantId, check.tenantId),
                      eq(tenantSkillGrants.enabled, true),
                      inArray(tenantSkillGrants.skillId, ids),
                  ))
            : [];
        const grantedIds = granted.map((g) => g.skillId);

        await db.transaction(async (tx) => {
            await tx.delete(agentSkillAssignments).where(
                and(
                    eq(agentSkillAssignments.tenantId, check.tenantId),
                    eq(agentSkillAssignments.agentProfileId, agentId),
                ),
            );
            if (grantedIds.length) {
                await tx.insert(agentSkillAssignments).values(
                    grantedIds.map((id) => ({
                        tenantId: check.tenantId,
                        agentProfileId: agentId,
                        skillId: id,
                        assignedBy: check.userId,
                    })),
                );
            }
        });

        await logAudit({
            action: "skills.assign",
            targetType: "agent",
            targetId: agentId,
            tenantId: check.tenantId,
            summary: `${agent.name} now carries ${grantedIds.length} skill(s)`,
        });
        revalidatePath("/dashboard/skills");
        return { success: true, message: `${agent.name} now carries ${grantedIds.length} skill(s).` };
    } catch (error) {
        console.error("Failed to assign skills:", error);
        return { success: false, message: "Failed to update the agent's skills." };
    }
}
