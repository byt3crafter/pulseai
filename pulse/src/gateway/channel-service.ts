/**
 * Channel service — org-channel resolution for the App API.
 *
 * Model (see docs/CHANNELS_DESIGN.md): Company (= tenant) → Department → Group.
 * A human posts in a channel; we decide WHO answers:
 *   - @mention a specific agent  → that agent responds directly
 *   - no mention                 → the channel's LEAD agent answers & routes
 * Enforces membership, talk-vs-observe access, and per-user agent assignment.
 */
import { db } from "../storage/db.js";
import {
    channels,
    channelAgents,
    channelMembers,
    channelMemberAgents,
    agentProfiles,
} from "../storage/schema.js";
import { and, eq } from "drizzle-orm";

export const channelContactFor = (channelId: string) => `channel-${channelId}`;

export type ChannelAgent = { agentProfileId: string; name: string; role: string; level: number };

export interface ChannelContext {
    channel: { id: string; name: string; kind: string; mode: string; leadAgentId: string | null };
    membership: { role: string; access: string };
    agents: ChannelAgent[];        // agents present in the channel
    allowedAgentIds: string[];     // agents THIS user may talk to (all channel agents unless assigned a subset)
}

/** Channels a user is a member of, with their access. */
export async function listUserChannels(tenantId: string, userId: string) {
    const rows = await db
        .select({
            id: channels.id,
            name: channels.name,
            description: channels.description,
            kind: channels.kind,
            parentId: channels.parentId,
            mode: channels.mode,
            access: channelMembers.access,
            role: channelMembers.role,
        })
        .from(channelMembers)
        .innerJoin(channels, eq(channelMembers.channelId, channels.id))
        .where(and(eq(channelMembers.userId, userId), eq(channels.tenantId, tenantId)));
    return rows;
}

/** Load a channel the user belongs to, or null. Verifies tenant ownership + membership. */
export async function getChannelContext(
    tenantId: string,
    userId: string,
    channelId: string,
): Promise<ChannelContext | null> {
    const [channel] = await db
        .select()
        .from(channels)
        .where(and(eq(channels.id, channelId), eq(channels.tenantId, tenantId)))
        .limit(1);
    if (!channel) return null;

    const [membership] = await db
        .select({ role: channelMembers.role, access: channelMembers.access })
        .from(channelMembers)
        .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
        .limit(1);
    if (!membership) return null;

    const agents = await db
        .select({
            agentProfileId: channelAgents.agentProfileId,
            name: agentProfiles.name,
            role: channelAgents.role,
            level: channelAgents.level,
        })
        .from(channelAgents)
        .innerJoin(agentProfiles, eq(channelAgents.agentProfileId, agentProfiles.id))
        .where(eq(channelAgents.channelId, channelId));

    // Per-user agent assignment: no rows = all channel agents; else restrict.
    const assigned = await db
        .select({ agentProfileId: channelMemberAgents.agentProfileId })
        .from(channelMemberAgents)
        .where(and(eq(channelMemberAgents.channelId, channelId), eq(channelMemberAgents.userId, userId)));

    const allowedAgentIds = assigned.length
        ? agents.filter((a) => assigned.some((x) => x.agentProfileId === a.agentProfileId)).map((a) => a.agentProfileId)
        : agents.map((a) => a.agentProfileId);

    return {
        channel: { id: channel.id, name: channel.name, kind: channel.kind, mode: channel.mode, leadAgentId: channel.leadAgentId },
        membership,
        agents,
        allowedAgentIds,
    };
}

export type Teammate = { id: string; name: string; specialization: string; modelId: string };

/**
 * If `agentProfileId` is the LEAD of the channel, return its teammates (the other
 * agents in the channel) so the lead can route work to them. Returns [] if the agent
 * is not the lead or the channel has no other agents.
 */
export async function getChannelLeadTeammates(channelId: string, agentProfileId: string): Promise<Teammate[]> {
    const [channel] = await db.select({ id: channels.id, name: channels.name, leadAgentId: channels.leadAgentId })
        .from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!channel) return [];

    const rows = await db
        .select({
            id: channelAgents.agentProfileId,
            role: channelAgents.role,
            level: channelAgents.level,
            name: agentProfiles.name,
            modelId: agentProfiles.modelId,
            delegationConfig: agentProfiles.delegationConfig,
        })
        .from(channelAgents)
        .innerJoin(agentProfiles, eq(channelAgents.agentProfileId, agentProfiles.id))
        .where(eq(channelAgents.channelId, channelId));

    // Is this agent the lead? (explicit leadAgentId, else a row with role 'lead')
    const isLead = channel.leadAgentId
        ? channel.leadAgentId === agentProfileId
        : rows.some((r) => r.id === agentProfileId && r.role === "lead");
    if (!isLead) return [];

    return rows
        .filter((r) => r.id !== agentProfileId)
        .map((r) => {
            const base = (r.delegationConfig as any)?.specialization || `${channel.name} team member`;
            const rank = r.level > 0 ? ` (rank ${r.level})` : "";
            return {
                id: r.id,
                name: r.name,
                modelId: r.modelId || "claude-sonnet-4-20250514",
                specialization: `${base}${rank}`,
            };
        });
}

export type RoutableChannel = { id: string; name: string; kind: string; description: string | null; leadAgentId: string };

/**
 * Full routing context for a responder in a channel: whether it's the lead, its
 * teammates (delegation targets within the channel), and other departments it can
 * route to. One call for the runtime.
 */
export async function getChannelLeadContext(
    tenantId: string,
    channelId: string,
    agentProfileId: string,
): Promise<{ isLead: boolean; teammates: Teammate[]; routable: RoutableChannel[] }> {
    const teammates = await getChannelLeadTeammates(channelId, agentProfileId);
    // getChannelLeadTeammates returns [] both for "not lead" and "lead, no teammates".
    // Disambiguate with an explicit lead check.
    const [channel] = await db.select({ leadAgentId: channels.leadAgentId }).from(channels).where(eq(channels.id, channelId)).limit(1);
    let isLead = channel?.leadAgentId === agentProfileId;
    if (!isLead && !channel?.leadAgentId) {
        const [row] = await db.select({ role: channelAgents.role }).from(channelAgents)
            .where(and(eq(channelAgents.channelId, channelId), eq(channelAgents.agentProfileId, agentProfileId))).limit(1);
        isLead = row?.role === "lead";
    }
    const routable = isLead ? await getRoutableChannels(tenantId, channelId) : [];
    return { isLead, teammates, routable };
}

/**
 * Channels this tenant has that a lead could route work to (other departments/groups
 * that have a lead), excluding the current channel. Powers cross-department (Phase 4)
 * and nested group (Phase 5) routing via the route_to_channel tool.
 */
export async function getRoutableChannels(tenantId: string, excludeChannelId: string): Promise<RoutableChannel[]> {
    const rows = await db
        .select({ id: channels.id, name: channels.name, kind: channels.kind, description: channels.description, leadAgentId: channels.leadAgentId })
        .from(channels)
        .where(eq(channels.tenantId, tenantId));
    return rows
        .filter((c) => c.id !== excludeChannelId && !!c.leadAgentId)
        .map((c) => ({ id: c.id, name: c.name, kind: c.kind, description: c.description, leadAgentId: c.leadAgentId as string }));
}

/** Resolve a channel by (loose) name within a tenant and return its lead agent id. */
export async function resolveChannelLeadByName(tenantId: string, name: string): Promise<{ channelId: string; channelName: string; leadAgentId: string } | null> {
    const target = name.trim().toLowerCase();
    const rows = await db
        .select({ id: channels.id, name: channels.name, leadAgentId: channels.leadAgentId })
        .from(channels)
        .where(eq(channels.tenantId, tenantId));
    const match = rows.find((c) => c.name.toLowerCase() === target)
        || rows.find((c) => c.name.toLowerCase().startsWith(target))
        || rows.find((c) => c.name.toLowerCase().includes(target));
    if (!match || !match.leadAgentId) return null;
    return { channelId: match.id, channelName: match.name, leadAgentId: match.leadAgentId };
}

/** Extract @mention tokens from message text (letters, digits, _, -). */
export function parseMentions(text: string): string[] {
    const out: string[] = [];
    const re = /@([\w-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push(m[1].toLowerCase());
    return out;
}

/** Match a mention token to a channel agent by a loose form of its name. */
function agentMatchesToken(agentName: string, token: string): boolean {
    const norm = agentName.toLowerCase().replace(/[^\w]/g, "");
    const first = agentName.toLowerCase().split(/[\s\-—]/)[0].replace(/[^\w]/g, "");
    const t = token.replace(/[^\w]/g, "");
    return norm === t || first === t || norm.startsWith(t) || first.startsWith(t);
}

export type Responder = { agentProfileId: string; name: string; viaMention: boolean };

/**
 * Decide who answers a human message.
 * - If the text @mentions an agent the user is allowed to talk to → that agent (viaMention).
 * - Otherwise → the channel lead (if the user is allowed to talk to it), else the first allowed agent.
 * Returns null if the user has no agent they may talk to.
 */
export function resolveResponder(ctx: ChannelContext, text: string): Responder | null {
    const allowed = ctx.agents.filter((a) => ctx.allowedAgentIds.includes(a.agentProfileId));
    if (allowed.length === 0) return null;

    const tokens = parseMentions(text);
    if (tokens.length > 0) {
        for (const a of allowed) {
            if (tokens.some((t) => agentMatchesToken(a.name, t))) {
                return { agentProfileId: a.agentProfileId, name: a.name, viaMention: true };
            }
        }
    }

    // Default: the lead answers & routes (if the user may talk to it).
    const lead = allowed.find((a) => a.agentProfileId === ctx.channel.leadAgentId)
        || allowed.find((a) => a.role === "lead");
    const chosen = lead || allowed[0];
    return { agentProfileId: chosen.agentProfileId, name: chosen.name, viaMention: false };
}
