"use server";

import { db } from "../../../storage/db";
import {
    channels,
    channelAgents,
    channelMembers,
    channelMemberAgents,
    agentProfiles,
    users,
} from "../../../storage/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../utils/tenant-auth";

const PATH = "/dashboard/departments";

type Result = { success: boolean; message: string };

// ── Ownership guards (never trust ids from the client) ──
async function ownsChannel(tenantId: string, channelId: string) {
    const [row] = await db.select({ id: channels.id, kind: channels.kind })
        .from(channels)
        .where(and(eq(channels.id, channelId), eq(channels.tenantId, tenantId)))
        .limit(1);
    return row || null;
}
async function ownsAgent(tenantId: string, agentId: string) {
    const [row] = await db.select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, tenantId)))
        .limit(1);
    return !!row;
}
async function ownsUser(tenantId: string, userId: string) {
    const [row] = await db.select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
        .limit(1);
    return !!row;
}

// ── Channels (departments + groups) ──
export async function createChannelAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const kind = (formData.get("kind") as string) === "group" ? "group" : "department";
    const name = (formData.get("name") as string)?.trim();
    const description = ((formData.get("description") as string) || "").trim() || null;
    const mode = (formData.get("mode") as string) === "multi_human" ? "multi_human" : "single_human";
    const parentIdRaw = (formData.get("parentId") as string) || "";

    if (!name) return { success: false, message: "A name is required." };

    let parentId: string | null = null;
    if (kind === "group") {
        if (!parentIdRaw) return { success: false, message: "A group must belong to a department." };
        const parent = await ownsChannel(tenantId, parentIdRaw);
        if (!parent || parent.kind !== "department") {
            return { success: false, message: "Invalid parent department." };
        }
        parentId = parentIdRaw;
    }

    try {
        await db.insert(channels).values({ tenantId, kind, parentId, name, description, mode });
        revalidatePath(PATH);
        return { success: true, message: `${kind === "group" ? "Group" : "Department"} created.` };
    } catch (error) {
        console.error("Failed to create channel:", error);
        return { success: false, message: "Could not create it — the name may already be in use." };
    }
}

export async function updateChannelAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const channelId = formData.get("channelId") as string;
    if (!channelId || !(await ownsChannel(tenantId, channelId))) {
        return { success: false, message: "Not found." };
    }
    const name = (formData.get("name") as string)?.trim();
    const description = ((formData.get("description") as string) || "").trim() || null;
    const mode = (formData.get("mode") as string) === "multi_human" ? "multi_human" : "single_human";
    if (!name) return { success: false, message: "A name is required." };

    try {
        await db.update(channels)
            .set({ name, description, mode, updatedAt: new Date() })
            .where(and(eq(channels.id, channelId), eq(channels.tenantId, tenantId)));
        revalidatePath(PATH);
        return { success: true, message: "Saved." };
    } catch (error) {
        console.error("Failed to update channel:", error);
        return { success: false, message: "Could not save changes." };
    }
}

export async function deleteChannelAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const channelId = formData.get("channelId") as string;
    if (!channelId || !(await ownsChannel(tenantId, channelId))) {
        return { success: false, message: "Not found." };
    }
    try {
        // Cascades remove memberships; child groups have parentId → cascade too.
        await db.delete(channels).where(and(eq(channels.id, channelId), eq(channels.tenantId, tenantId)));
        revalidatePath(PATH);
        return { success: true, message: "Deleted." };
    } catch (error) {
        console.error("Failed to delete channel:", error);
        return { success: false, message: "Could not delete it." };
    }
}

// ── Agents in a channel ──
export async function addChannelAgentAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const channelId = formData.get("channelId") as string;
    const agentProfileId = formData.get("agentProfileId") as string;
    const role = (formData.get("role") as string) === "lead" ? "lead" : "member";
    const level = Math.max(0, parseInt((formData.get("level") as string) || "0", 10) || 0);

    if (!(await ownsChannel(tenantId, channelId)) || !(await ownsAgent(tenantId, agentProfileId))) {
        return { success: false, message: "Not found." };
    }
    try {
        await db.insert(channelAgents)
            .values({ channelId, agentProfileId, role, level, respondsWhen: role === "lead" ? "lead" : "mentioned" })
            .onConflictDoUpdate({
                target: [channelAgents.channelId, channelAgents.agentProfileId],
                set: { role, level, respondsWhen: role === "lead" ? "lead" : "mentioned" },
            });
        // If this agent is the lead, record it on the channel (single lead).
        if (role === "lead") {
            await db.update(channels).set({ leadAgentId: agentProfileId, updatedAt: new Date() })
                .where(and(eq(channels.id, channelId), eq(channels.tenantId, tenantId)));
        }
        revalidatePath(PATH);
        return { success: true, message: "Agent added." };
    } catch (error) {
        console.error("Failed to add channel agent:", error);
        return { success: false, message: "Could not add the agent." };
    }
}

export async function removeChannelAgentAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const channelId = formData.get("channelId") as string;
    const agentProfileId = formData.get("agentProfileId") as string;
    if (!(await ownsChannel(tenantId, channelId))) return { success: false, message: "Not found." };
    try {
        await db.delete(channelAgents)
            .where(and(eq(channelAgents.channelId, channelId), eq(channelAgents.agentProfileId, agentProfileId)));
        // Clear lead pointer if we removed the lead.
        await db.update(channels).set({ leadAgentId: null, updatedAt: new Date() })
            .where(and(eq(channels.id, channelId), eq(channels.tenantId, tenantId), eq(channels.leadAgentId, agentProfileId)));
        revalidatePath(PATH);
        return { success: true, message: "Agent removed." };
    } catch (error) {
        console.error("Failed to remove channel agent:", error);
        return { success: false, message: "Could not remove the agent." };
    }
}

// ── Human members in a channel ──
export async function addChannelMemberAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const channelId = formData.get("channelId") as string;
    const userId = formData.get("userId") as string;
    const role = (formData.get("role") as string) === "operator" ? "operator" : "member";
    const access = (formData.get("access") as string) === "observe" ? "observe" : "talk";

    if (!(await ownsChannel(tenantId, channelId)) || !(await ownsUser(tenantId, userId))) {
        return { success: false, message: "Not found." };
    }
    try {
        await db.insert(channelMembers)
            .values({ channelId, userId, role, access })
            .onConflictDoUpdate({
                target: [channelMembers.channelId, channelMembers.userId],
                set: { role, access },
            });
        revalidatePath(PATH);
        return { success: true, message: "Member added." };
    } catch (error) {
        console.error("Failed to add channel member:", error);
        return { success: false, message: "Could not add the member." };
    }
}

export async function removeChannelMemberAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const channelId = formData.get("channelId") as string;
    const userId = formData.get("userId") as string;
    if (!(await ownsChannel(tenantId, channelId))) return { success: false, message: "Not found." };
    try {
        await db.delete(channelMembers)
            .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)));
        // Also clear any per-user agent assignments for this member.
        await db.delete(channelMemberAgents)
            .where(and(eq(channelMemberAgents.channelId, channelId), eq(channelMemberAgents.userId, userId)));
        revalidatePath(PATH);
        return { success: true, message: "Member removed." };
    } catch (error) {
        console.error("Failed to remove channel member:", error);
        return { success: false, message: "Could not remove the member." };
    }
}

// ── Per-user agent assignment inside a channel ──
// assignments = comma-separated agentProfileIds; empty = "all channel agents" (clears rows).
export async function setMemberAgentsAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const channelId = formData.get("channelId") as string;
    const userId = formData.get("userId") as string;
    const raw = (formData.get("agentIds") as string) || "";
    const agentIds = raw.split(",").map((s) => s.trim()).filter(Boolean);

    if (!(await ownsChannel(tenantId, channelId)) || !(await ownsUser(tenantId, userId))) {
        return { success: false, message: "Not found." };
    }
    // Every assigned agent must belong to the tenant AND be a member of this channel.
    const channelAgentRows = await db.select({ id: channelAgents.agentProfileId })
        .from(channelAgents).where(eq(channelAgents.channelId, channelId));
    const allowed = new Set(channelAgentRows.map((r) => r.id));
    for (const id of agentIds) {
        if (!allowed.has(id)) return { success: false, message: "One of the agents is not in this channel." };
    }

    try {
        await db.delete(channelMemberAgents)
            .where(and(eq(channelMemberAgents.channelId, channelId), eq(channelMemberAgents.userId, userId)));
        if (agentIds.length > 0) {
            await db.insert(channelMemberAgents)
                .values(agentIds.map((agentProfileId) => ({ channelId, userId, agentProfileId })));
        }
        revalidatePath(PATH);
        return { success: true, message: agentIds.length ? "Agent access updated." : "Reset to all agents." };
    } catch (error) {
        console.error("Failed to set member agents:", error);
        return { success: false, message: "Could not update agent access." };
    }
}
