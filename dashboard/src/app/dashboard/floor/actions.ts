"use server";

import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import crypto from "crypto";
import { db } from "../../../storage/db";
import {
    agentProfiles, agentRuns, agentDelegations, apiTokens, channels, channelAgents, pendingApprovals, users,
} from "../../../storage/schema";
import { requireTenant } from "../../../utils/tenant-auth";
import { toolStepLabel } from "./tool-labels";
import type { DeskState, FloorActivity, FloorSnapshot, Handoff } from "./types";

/**
 * A run still marked `running` long past this is not running — the gateway died
 * mid-run and `finishRun` never fired. Without this cutoff a desk animates busy
 * forever and the floor lies about capacity.
 */
const STALL_MS = 15 * 60 * 1000;

/** Only celebrate substantial work: a three-second reply should end quietly. */
const CHEER_MIN_MS = 20_000;

/** How far back a finished run still shows its done/failed beat. */
const RECENT_MS = 30_000;

type ToolCallTrace = { name?: string; ok?: boolean; ms?: number };

/**
 * Live floor state for the signed-in tenant.
 *
 * Read-only and safe to poll. Returns an empty snapshot (never an error) when
 * unauthorised, per the house rule for read paths.
 */
export async function getFloorState(): Promise<FloorSnapshot> {
    const empty: FloorSnapshot = { activity: [], handoffs: [], todayCount: 0, serverNow: Date.now() };

    const check = await requireTenant();
    if (!check.authorized) return empty;
    const tenantId = check.tenantId;

    const now = Date.now();
    const stallCutoff = new Date(now - STALL_MS);
    const recentCutoff = new Date(now - RECENT_MS);
    const dayStart = new Date(now - 24 * 60 * 60 * 1000);

    try {
        const [running, finished, delegations, approvals, todayRows] = await Promise.all([
            db.select({
                id: agentRuns.id,
                agentProfileId: agentRuns.agentProfileId,
                startedAt: agentRuns.startedAt,
                toolCallCount: agentRuns.toolCallCount,
                toolCalls: agentRuns.toolCalls,
                trigger: agentRuns.trigger,
                parentRunId: agentRuns.parentRunId,
            })
                .from(agentRuns)
                .where(and(eq(agentRuns.tenantId, tenantId), eq(agentRuns.status, "running")))
                .orderBy(desc(agentRuns.startedAt))
                .limit(200),

            db.select({
                id: agentRuns.id,
                agentProfileId: agentRuns.agentProfileId,
                status: agentRuns.status,
                startedAt: agentRuns.startedAt,
                endedAt: agentRuns.endedAt,
            })
                .from(agentRuns)
                .where(and(eq(agentRuns.tenantId, tenantId), gt(agentRuns.endedAt, recentCutoff)))
                .orderBy(desc(agentRuns.endedAt))
                .limit(100),

            db.select({
                id: agentDelegations.id,
                sourceAgentId: agentDelegations.sourceAgentId,
                targetAgentId: agentDelegations.targetAgentId,
                startedAt: agentDelegations.startedAt,
            })
                .from(agentDelegations)
                .where(and(eq(agentDelegations.tenantId, tenantId), gt(agentDelegations.startedAt, recentCutoff)))
                .limit(50),

            db.select({ agentProfileId: pendingApprovals.agentProfileId })
                .from(pendingApprovals)
                .where(and(eq(pendingApprovals.tenantId, tenantId), eq(pendingApprovals.status, "pending")))
                .limit(100),

            db.select({ count: sql<number>`count(*)` })
                .from(agentRuns)
                .where(and(
                    eq(agentRuns.tenantId, tenantId),
                    eq(agentRuns.status, "completed"),
                    gt(agentRuns.endedAt, dayStart),
                )),
        ]);

        const needsYou = new Set(approvals.map((a) => a.agentProfileId).filter(Boolean) as string[]);

        const activity = new Map<string, FloorActivity>();

        // Live runs first — they outrank a just-finished beat on the same desk.
        for (const run of running) {
            if (!run.agentProfileId) continue;
            if (activity.has(run.agentProfileId)) continue;

            const started = run.startedAt ? new Date(run.startedAt).getTime() : now;
            let state: DeskState;
            let caption: string | null = null;

            if (started < stallCutoff.getTime()) {
                state = "stalled";
                caption = "Stuck";
            } else if ((run.toolCallCount ?? 0) > 0) {
                state = "working";
                const trace = Array.isArray(run.toolCalls) ? (run.toolCalls as ToolCallTrace[]) : [];
                const last = trace[trace.length - 1];
                caption = last?.name ? toolStepLabel(last.name) : "Working";
            } else {
                state = "thinking";
            }

            activity.set(run.agentProfileId, { agentId: run.agentProfileId, state, caption, runId: run.id });
        }

        // Then the just-finished beats, for desks that are now free.
        for (const run of finished) {
            if (!run.agentProfileId || activity.has(run.agentProfileId)) continue;
            const started = run.startedAt ? new Date(run.startedAt).getTime() : 0;
            const ended = run.endedAt ? new Date(run.endedAt).getTime() : now;
            const durationMs = ended - started;

            if (run.status === "failed") {
                activity.set(run.agentProfileId, { agentId: run.agentProfileId, state: "failed", caption: null, runId: run.id });
            } else if (durationMs >= CHEER_MIN_MS) {
                activity.set(run.agentProfileId, { agentId: run.agentProfileId, state: "done", caption: null, runId: run.id });
            }
        }

        // An approval waiting on a human outranks everything: it needs action.
        for (const agentId of needsYou) {
            activity.set(agentId, { agentId, state: "needs-you", caption: "Waiting on you", runId: null });
        }

        // Handoffs: work arriving at a desk. Delegations name both endpoints;
        // everything else is attributed to whoever/whatever triggered the run.
        const handoffs: Handoff[] = [];
        for (const d of delegations) {
            handoffs.push({
                id: `d-${d.id}`,
                from: { kind: "agent", agentId: d.sourceAgentId },
                toAgentId: d.targetAgentId,
                at: d.startedAt ? new Date(d.startedAt).getTime() : now,
            });
        }
        for (const run of running) {
            if (!run.agentProfileId) continue;
            // A delegated run already has a slip from its source agent.
            if (run.trigger === "delegation" || run.parentRunId) continue;
            const at = run.startedAt ? new Date(run.startedAt).getTime() : now;
            if (now - at > RECENT_MS) continue;
            const scheduled = run.trigger === "cron" || run.trigger === "heartbeat"
                || run.trigger === "standing_order" || run.trigger === "commitment";
            handoffs.push({
                id: `r-${run.id}`,
                from: scheduled ? { kind: "schedule" } : { kind: "boss" },
                toAgentId: run.agentProfileId,
                at,
            });
        }

        return {
            activity: [...activity.values()],
            handoffs,
            todayCount: Number(todayRows[0]?.count ?? 0),
            serverNow: now,
        };
    } catch (error) {
        console.error("Failed to load floor state:", error);
        return empty;
    }
}

/**
 * A short-lived token for the floor's own WebSocket connection.
 *
 * Deliberately named differently from the assistant's (`__webchat__`): that
 * action deletes the user's existing token by name every time it runs, so
 * sharing a name would sign the other page out whenever both are open.
 */
const FLOOR_TOKEN_NAME = "__webfloor__";

export async function getFloorTokenAction(): Promise<{ ok: true; token: string } | { ok: false }> {
    const check = await requireTenant();
    if (!check.authorized) return { ok: false };

    try {
        await db.delete(apiTokens).where(and(
            eq(apiTokens.tenantId, check.tenantId),
            eq(apiTokens.name, FLOOR_TOKEN_NAME),
            eq(apiTokens.userId, check.userId),
        ));
        const raw = `pulse-sk-${crypto.randomBytes(32).toString("hex")}`;
        await db.insert(apiTokens).values({
            tenantId: check.tenantId,
            userId: check.userId,
            tokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
            name: FLOOR_TOKEN_NAME,
            scopes: ["chat"],
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        });
        return { ok: true, token: raw };
    } catch (error) {
        console.error("Failed to mint floor token:", error);
        return { ok: false };
    }
}

export interface FloorOrg {
    agents: { id: string; name: string; title: string | null; avatar: string | null; enabled: boolean }[];
    departments: { id: string; name: string; agentIds: string[]; leadAgentId: string | null }[];
    unassigned: string[];
    /** The people who give work. */
    humans: { id: string; name: string; isMe: boolean }[];
}

/** The tenant's org chart: departments, their agents, and anyone unassigned. */
export async function getFloorOrg(): Promise<FloorOrg> {
    const empty: FloorOrg = { agents: [], departments: [], unassigned: [], humans: [] };

    const check = await requireTenant();
    if (!check.authorized) return empty;
    const tenantId = check.tenantId;

    try {
        const [agentRows, channelRows, userRows] = await Promise.all([
            db.select({
                id: agentProfiles.id,
                name: agentProfiles.name,
                title: agentProfiles.title,
                avatar: agentProfiles.avatar,
                enabled: agentProfiles.enabled,
            })
                .from(agentProfiles)
                .where(eq(agentProfiles.tenantId, tenantId)),

            db.select({ id: channels.id, name: channels.name, leadAgentId: channels.leadAgentId })
                .from(channels)
                .where(and(
                    eq(channels.tenantId, tenantId),
                    eq(channels.kind, "department"),
                    eq(channels.status, "active"),
                )),

            db.select({ id: users.id, name: users.name, email: users.email })
                .from(users)
                .where(eq(users.tenantId, tenantId))
                .limit(8),
        ]);

        // channel_agents has NO tenant_id column, so it must be constrained to
        // this tenant's channels. Skipping this leaks other tenants' agents onto
        // the floor — mirrors departments/page.tsx.
        const channelIds = channelRows.map((c) => c.id);
        const links = channelIds.length
            ? await db.select({ channelId: channelAgents.channelId, agentProfileId: channelAgents.agentProfileId, role: channelAgents.role })
                .from(channelAgents)
                .where(inArray(channelAgents.channelId, channelIds))
            : [];

        const agentIds = new Set(agentRows.map((a) => a.id));
        const assigned = new Set<string>();
        const departments = channelRows.map((c) => {
            const members = links
                .filter((l) => l.channelId === c.id && agentIds.has(l.agentProfileId))
                .map((l) => l.agentProfileId);
            members.forEach((m) => assigned.add(m));
            const leadFromLink = links.find((l) => l.channelId === c.id && l.role === "lead")?.agentProfileId ?? null;
            return {
                id: c.id,
                name: c.name,
                agentIds: members,
                leadAgentId: c.leadAgentId ?? leadFromLink,
            };
        });

        return {
            agents: agentRows,
            departments,
            unassigned: agentRows.filter((a) => !assigned.has(a.id)).map((a) => a.id),
            // Signed-in user first, so "you" always stands nearest the door.
            humans: userRows
                .map((u) => ({
                    id: u.id,
                    name: (u.name || u.email || "Someone").split("@")[0],
                    isMe: u.id === check.userId,
                }))
                .sort((a, b) => (a.isMe === b.isMe ? a.name.localeCompare(b.name) : a.isMe ? -1 : 1)),
        };
    } catch (error) {
        console.error("Failed to load floor org:", error);
        return empty;
    }
}
