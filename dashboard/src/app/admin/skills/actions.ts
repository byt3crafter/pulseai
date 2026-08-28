"use server";

/**
 * Admin actions for skill packs.
 *
 * The import itself runs in the GATEWAY, not here: the parser, tar reader and
 * SSRF guard all live there, and a second copy of the identity/dedup rules
 * would be a second place for them to drift — those rules are what stop real
 * skills being silently lost on import.
 *
 * See docs/SKILLS_PLAN.md.
 */

import { db } from "../../../storage/db";
import { skillPacks, skillDefinitions } from "../../../storage/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../../utils/admin-auth";
import { logAudit } from "../../../utils/audit";

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}

export async function addPackAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    const name = String(formData.get("name") || "").trim();
    const sourceUrl = String(formData.get("sourceUrl") || "").trim();
    const sourceRef = String(formData.get("sourceRef") || "main").trim() || "main";

    if (!name || !sourceUrl) return { success: false, message: "Name and repository URL are required." };
    if (!/^https:\/\/(www\.)?(github|gitlab)\.com\//i.test(sourceUrl)) {
        return { success: false, message: "Only GitHub and GitLab repository URLs are supported." };
    }

    try {
        await db.insert(skillPacks).values({
            name,
            slug: slugify(name) || `pack-${Date.now()}`,
            sourceType: "git",
            sourceUrl,
            sourceRef,
        });
        await logAudit({
            action: "skills.pack.add",
            targetType: "skill_pack",
            summary: `Added skill pack '${name}'`,
            metadata: { sourceUrl, sourceRef },
        });
        revalidatePath("/admin/skills");
        return { success: true, message: "Pack added. Import it to pull its skills in." };
    } catch (error) {
        console.error("Failed to add skill pack:", error);
        return { success: false, message: "Failed to add pack. The name may already be in use." };
    }
}

export async function importPackAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    const packId = String(formData.get("packId") || "");
    if (!packId) return { success: false, message: "No pack selected." };

    const base = process.env.PULSE_GATEWAY_URL || "http://pulse-gateway:8080";
    const key = process.env.ADMIN_API_KEY;
    if (!key) return { success: false, message: "Admin API is not configured on this deployment." };

    try {
        const res = await fetch(`${base.replace(/\/$/, "")}/api/admin/skills/packs/${packId}/import`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            // A large repo takes a few seconds to download and parse.
            signal: AbortSignal.timeout(120_000),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            // The gateway's message describes the operator's own input (bad URL
            // or branch), so passing it through is useful rather than leaky.
            return { success: false, message: (body as any)?.error || "Import failed." };
        }

        await logAudit({
            action: "skills.pack.import",
            targetType: "skill_pack",
            targetId: packId,
            summary: `Imported ${(body as any).imported} skills`,
            metadata: body as any,
        });
        revalidatePath("/admin/skills");

        const b = body as any;
        return {
            success: true,
            message: b.approvalCleared
                ? `Imported ${b.imported} skills. The content changed, so approval was cleared — agents will not see these until you approve again.`
                : `Imported ${b.imported} skills${b.skipped ? `, ${b.skipped} skipped` : ""}.`,
        };
    } catch (error) {
        console.error("Failed to import skill pack:", error);
        return { success: false, message: "Could not reach the gateway to run the import." };
    }
}

export async function approvePackAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    const packId = String(formData.get("packId") || "");
    if (!packId) return { success: false, message: "No pack selected." };

    try {
        const pack = await db.query.skillPacks.findFirst({ where: eq(skillPacks.id, packId) });
        if (!pack) return { success: false, message: "Pack not found." };
        if (!pack.packChecksum) return { success: false, message: "Import the pack before approving it." };

        /*
         * Approval pins the CURRENT content hash. If the pack is re-imported
         * and the content changed, the two stop matching and every agent loses
         * these skills until an admin looks again — the point being that a
         * change upstream cannot silently alter what an agent is told to do.
         */
        await db
            .update(skillPacks)
            .set({
                approvedChecksum: pack.packChecksum,
                approvedBy: adminCheck.userId ?? null,
                approvedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(skillPacks.id, packId));

        await logAudit({
            action: "skills.pack.approve",
            targetType: "skill_pack",
            targetId: packId,
            summary: `Approved skill pack '${pack.name}' (${pack.skillCount} skills)`,
            metadata: { checksum: pack.packChecksum },
        });
        revalidatePath("/admin/skills");
        return { success: true, message: "Approved. Workspaces can now add these skills to their library." };
    } catch (error) {
        console.error("Failed to approve skill pack:", error);
        return { success: false, message: "Failed to approve pack." };
    }
}

export async function revokePackAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    const packId = String(formData.get("packId") || "");
    try {
        await db
            .update(skillPacks)
            .set({ approvedChecksum: null, approvedBy: null, approvedAt: null, updatedAt: new Date() })
            .where(eq(skillPacks.id, packId));
        await logAudit({
            action: "skills.pack.revoke",
            targetType: "skill_pack",
            targetId: packId,
            summary: "Revoked approval for a skill pack",
        });
        revalidatePath("/admin/skills");
        // Deliberately blunt about the consequence: this takes skills away from
        // running agents immediately.
        return { success: true, message: "Approval revoked. Agents no longer receive these skills." };
    } catch (error) {
        console.error("Failed to revoke skill pack:", error);
        return { success: false, message: "Failed to revoke approval." };
    }
}

export async function deletePackAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    const packId = String(formData.get("packId") || "");
    try {
        // Skills, grants and assignments cascade — the skills genuinely no
        // longer exist, so leaving assignments pointing at them would be worse.
        await db.delete(skillPacks).where(eq(skillPacks.id, packId));
        await logAudit({
            action: "skills.pack.delete",
            targetType: "skill_pack",
            targetId: packId,
            summary: "Deleted a skill pack and its skills",
        });
        revalidatePath("/admin/skills");
        return { success: true, message: "Pack deleted." };
    } catch (error) {
        console.error("Failed to delete skill pack:", error);
        return { success: false, message: "Failed to delete pack." };
    }
}

export interface PackRow {
    id: string;
    name: string;
    sourceUrl: string | null;
    sourceRef: string | null;
    skillCount: number;
    skippedCount: number;
    approved: boolean;
    /** Imported since approval, with different content — inert until re-approved. */
    driftedSinceApproval: boolean;
    lastImportAt: Date | null;
    lastImportError: string | null;
    skipped: { path: string; reason: string }[];
    grantedCount: number;
}

export async function listPacks(): Promise<PackRow[]> {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return [];

    try {
        const rows = await db.select().from(skillPacks).orderBy(skillPacks.name);
        const counts = await db
            .select({ packId: skillDefinitions.packId, n: sql<number>`count(*)` })
            .from(skillDefinitions)
            .groupBy(skillDefinitions.packId);
        const byPack = new Map(counts.map((c) => [c.packId, Number(c.n)]));

        return rows.map((p) => ({
            id: p.id,
            name: p.name,
            sourceUrl: p.sourceUrl,
            sourceRef: p.sourceRef,
            skillCount: byPack.get(p.id) ?? p.skillCount,
            skippedCount: p.skippedCount,
            approved: !!p.approvedChecksum && p.approvedChecksum === p.packChecksum,
            driftedSinceApproval: !!p.approvedChecksum && p.approvedChecksum !== p.packChecksum,
            lastImportAt: p.lastImportAt,
            lastImportError: p.lastImportError,
            skipped: Array.isArray(p.skipped) ? (p.skipped as any[]).slice(0, 50) : [],
            grantedCount: 0,
        }));
    } catch (error) {
        console.error("Failed to list skill packs:", error);
        return [];
    }
}
