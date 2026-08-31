"use server";

/**
 * Model groups — a named, ordered set of models an agent auto-picks from.
 *
 * The group IS the config: the model list and the strategy are stored and
 * edited here, replacing the hardcoded fallback map. Nothing about which models
 * or how they're chosen lives in code.
 *
 * See docs/MODEL_GROUPS_PLAN.md.
 */

import { db } from "../../../../storage/db";
import { modelGroups, agentProfiles } from "../../../../storage/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../../utils/tenant-auth";
import { logAudit } from "../../../../utils/audit";

export type Strategy = "failover" | "cost" | "both";
const STRATEGIES = new Set<Strategy>(["failover", "cost", "both"]);

export interface ModelGroupRow {
    id: string;
    name: string;
    strategy: Strategy;
    models: string[];
    agentCount: number;
}

export async function listModelGroups(): Promise<ModelGroupRow[]> {
    const check = await requireTenant();
    if (!check.authorized) return [];
    try {
        const rows = await db.select().from(modelGroups)
            .where(eq(modelGroups.tenantId, check.tenantId))
            .orderBy(modelGroups.name);
        const counts = await db
            .select({ gid: agentProfiles.modelGroupId, n: sql<number>`count(*)` })
            .from(agentProfiles)
            .where(eq(agentProfiles.tenantId, check.tenantId))
            .groupBy(agentProfiles.modelGroupId);
        const byGroup = new Map(counts.map((c) => [c.gid, Number(c.n)]));
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            strategy: (r.strategy as Strategy),
            models: Array.isArray(r.models) ? (r.models as string[]) : [],
            agentCount: byGroup.get(r.id) ?? 0,
        }));
    } catch (error) {
        console.error("Failed to list model groups:", error);
        return [];
    }
}

export async function saveModelGroupAction(formData: FormData) {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };

    const id = String(formData.get("id") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const strategy = String(formData.get("strategy") || "failover") as Strategy;
    // models arrive as a comma-joined ordered list of ids.
    const models = String(formData.get("models") || "").split(",").map((m) => m.trim()).filter(Boolean);

    if (!name) return { success: false, message: "Give the group a name." };
    if (!STRATEGIES.has(strategy)) return { success: false, message: "Unknown strategy." };
    if (models.length < 2) {
        // A one-model "group" is just a model — the point is more than one, so
        // there is something to fall through to or choose between.
        return { success: false, message: "A group needs at least two models." };
    }

    try {
        const values = { tenantId: check.tenantId, name, strategy, models, updatedAt: new Date() };
        if (id) {
            await db.update(modelGroups).set(values).where(and(eq(modelGroups.id, id), eq(modelGroups.tenantId, check.tenantId)));
        } else {
            await db.insert(modelGroups).values(values);
        }
        await logAudit({
            action: id ? "model_group.update" : "model_group.create",
            targetType: "model_group",
            tenantId: check.tenantId,
            summary: `${id ? "Updated" : "Created"} model group '${name}' (${strategy}, ${models.length} models)`,
            metadata: { strategy, models },
        });
        revalidatePath("/dashboard/agents/model-groups");
        return { success: true, message: "Saved." };
    } catch (error) {
        console.error("Failed to save model group:", error);
        return { success: false, message: "Failed to save. The name may already be in use." };
    }
}

export async function deleteModelGroupAction(formData: FormData) {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const id = String(formData.get("id") || "");
    try {
        // Agents pointing at it fall back to their single model (ON DELETE SET NULL).
        await db.delete(modelGroups).where(and(eq(modelGroups.id, id), eq(modelGroups.tenantId, check.tenantId)));
        await logAudit({ action: "model_group.delete", targetType: "model_group", targetId: id, tenantId: check.tenantId, summary: "Deleted a model group" });
        revalidatePath("/dashboard/agents/model-groups");
        return { success: true, message: "Deleted. Agents that used it fall back to their own model." };
    } catch (error) {
        console.error("Failed to delete model group:", error);
        return { success: false, message: "Failed to delete." };
    }
}
