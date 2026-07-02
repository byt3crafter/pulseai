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
