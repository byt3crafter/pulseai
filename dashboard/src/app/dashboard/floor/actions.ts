"use server";

import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import crypto from "crypto";
import { db } from "../../../storage/db";
import {
    agentProfiles, agentRuns, agentDelegations, apiTokens, channels, channelAgents,
    commitments, jobRuns, pendingApprovals, scheduledJobs, users,
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

/** Triggers that nobody asked for — the agents' own routine. */
const AUTONOMOUS_TRIGGERS = new Set(["cron", "heartbeat", "standing_order", "commitment"]);

function summariseToday(
    rows: { trigger: string | null; count: number; ms: number }[],
): { asked: number; scheduled: number; hoursWorked: number } {
    let asked = 0, scheduled = 0, ms = 0;
    for (const row of rows) {
        const n = Number(row.count ?? 0);
        ms += Number(row.ms ?? 0);
        if (AUTONOMOUS_TRIGGERS.has(row.trigger ?? "")) scheduled += n;
        else asked += n;
    }
    return { asked, scheduled, hoursWorked: ms / 3_600_000 };
}

/**
 * Live floor state for the signed-in tenant.
 *
 * Read-only and safe to poll. Returns an empty snapshot (never an error) when
 * unauthorised, per the house rule for read paths.
 */
export async function getFloorState(): Promise<FloorSnapshot> {
    const empty: FloorSnapshot = { activity: [], handoffs: [], today: { asked: 0, scheduled: 0, hoursWorked: 0 }, alerts: { failedJobs: [] }, serverNow: Date.now() };

    const check = await requireTenant();
    if (!check.authorized) return empty;
    const tenantId = check.tenantId;

    const now = Date.now();
    const stallCutoff = new Date(now - STALL_MS);
    const recentCutoff = new Date(now - RECENT_MS);
    const dayStart = new Date(now - 24 * 60 * 60 * 1000);

    try {
        const [running, finished, delegations, approvals, todayRows, failedJobRows] = await Promise.all([
            db.select({
                id: agentRuns.id,
                agentProfileId: agentRuns.agentProfileId,
                startedAt: agentRuns.startedAt,
                toolCallCount: agentRuns.toolCallCount,
                toolCalls: agentRuns.toolCalls,
                trigger: agentRuns.trigger,
                parentRunId: agentRuns.parentRunId,
                userId: agentRuns.userId,
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

            // Grouped by trigger so the floor can separate "you asked for this"
            // from the agents' own routine.
            db.select({
                trigger: agentRuns.trigger,
                count: sql<number>`count(*)`,
                ms: sql<number>`coalesce(sum(${agentRuns.durationMs}), 0)`,
            })
                .from(agentRuns)
                .where(and(
                    eq(agentRuns.tenantId, tenantId),
                    eq(agentRuns.status, "completed"),
                    gt(agentRuns.endedAt, dayStart),
                ))
                .groupBy(agentRuns.trigger),

            // Scheduled jobs that failed in the last 24h — the one piece of
            // autonomous activity that must not stay quiet.
            db.select({
                jobName: scheduledJobs.name,
                agentId: scheduledJobs.agentId,
                error: jobRuns.error,
                startedAt: jobRuns.startedAt,
            })
                .from(jobRuns)
                .innerJoin(scheduledJobs, eq(scheduledJobs.id, jobRuns.jobId))
                .where(and(
                    eq(jobRuns.tenantId, tenantId),
                    eq(jobRuns.status, "failed"),
                    gt(jobRuns.startedAt, dayStart),
                ))
                .orderBy(desc(jobRuns.startedAt))
                .limit(10),
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
            // Routine autonomous work does NOT get a slip. A cron firing every
            // 15 minutes would put a paper plane across the floor all day and
            // drown out the thing you actually care about — someone asking for
            // something. It still counts in the header, is still visible on the
            // desk, and still shows in the agent's activity panel.
            if (AUTONOMOUS_TRIGGERS.has(run.trigger ?? "")) continue;
            handoffs.push({
                id: `r-${run.id}`,
                // Attribute to the human who actually asked, when we know. Work
                // from Telegram is only attributed once that account is linked
                // to a member on /dashboard/people — we never guess.
                from: { kind: "boss", userId: run.userId ?? null },
                toAgentId: run.agentProfileId,
                at,
            });
        }

        return {
            activity: [...activity.values()],
            handoffs,
            today: summariseToday(todayRows),
            alerts: {
                failedJobs: failedJobRows.map((r) => ({
                    agentId: r.agentId ?? null,
                    jobName: r.jobName,
                    error: (r.error || "Failed").slice(0, 200),
                    at: r.startedAt ? new Date(r.startedAt).getTime() : now,
                })),
            },
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

export interface AgentActivityDetail {
    /**
     * Time this agent has actually spent working, from the recorded duration of
     * its runs. This is the number that makes an AI workforce legible: not how
     * many times it ran, but how much work it did.
     */
    hours: { today: number; week: number; allTime: number };
    /** hours x the agent's roiHourlyRate, when a rate is set. */
    valueUsd: { today: number; allTime: number } | null;
    recentRuns: { id: string; trigger: string; status: string; title: string | null; at: number; durationMs: number; error: string | null }[];
    jobs: { id: string; name: string; schedule: string; enabled: boolean; lastRunAt: number | null; nextRunAt: number | null; lastStatus: string | null; lastError: string | null }[];
    commitments: { id: string; summary: string; dueAt: number; status: string }[];
}

/**
 * What has this agent actually been doing?
 *
 * The floor shows the present tense — who is busy right now. This is the rest:
 * what it has run, what it is scheduled to run, and what it has promised to
 * follow up on. Deliberately loaded on demand (a desk click), not polled, so
 * the calm of the floor is never paid for in queries.
 */
export async function getAgentActivityAction(agentProfileId: string): Promise<AgentActivityDetail> {
    const empty: AgentActivityDetail = {
        hours: { today: 0, week: 0, allTime: 0 }, valueUsd: null,
        recentRuns: [], jobs: [], commitments: [],
    };

    const check = await requireTenant();
    if (!check.authorized) return empty;
    const tenantId = check.tenantId;
    if (!agentProfileId) return empty;

    try {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [runRows, jobRows, commitmentRows, hourRows, profileRows] = await Promise.all([
            db.select({
                id: agentRuns.id,
                trigger: agentRuns.trigger,
                status: agentRuns.status,
                title: agentRuns.title,
                startedAt: agentRuns.startedAt,
                durationMs: agentRuns.durationMs,
                error: agentRuns.error,
            })
                .from(agentRuns)
                .where(and(eq(agentRuns.tenantId, tenantId), eq(agentRuns.agentProfileId, agentProfileId)))
                .orderBy(desc(agentRuns.startedAt))
                .limit(15),

            db.select({
                id: scheduledJobs.id,
                name: scheduledJobs.name,
                scheduleType: scheduledJobs.scheduleType,
                cronExpression: scheduledJobs.cronExpression,
                intervalSeconds: scheduledJobs.intervalSeconds,
                enabled: scheduledJobs.enabled,
                lastRunAt: scheduledJobs.lastRunAt,
                nextRunAt: scheduledJobs.nextRunAt,
            })
                .from(scheduledJobs)
                .where(and(eq(scheduledJobs.tenantId, tenantId), eq(scheduledJobs.agentId, agentProfileId)))
                .orderBy(desc(scheduledJobs.lastRunAt))
                .limit(20),

            db.select({
                id: commitments.id,
                summary: commitments.summary,
                dueAt: commitments.dueAt,
                status: commitments.status,
            })
                .from(commitments)
                .where(and(eq(commitments.tenantId, tenantId), eq(commitments.agentId, agentProfileId)))
                .orderBy(desc(commitments.dueAt))
                .limit(15),

            // Summed in SQL rather than over the fetched page — the recent-runs
            // list is capped at 15, so totalling that would badly understate it.
            db.select({
                today: sql<number>`coalesce(sum(${agentRuns.durationMs}) filter (where ${agentRuns.endedAt} > ${dayAgo}), 0)`,
                week: sql<number>`coalesce(sum(${agentRuns.durationMs}) filter (where ${agentRuns.endedAt} > ${weekAgo}), 0)`,
                allTime: sql<number>`coalesce(sum(${agentRuns.durationMs}), 0)`,
            })
                .from(agentRuns)
                .where(and(eq(agentRuns.tenantId, tenantId), eq(agentRuns.agentProfileId, agentProfileId))),

            db.select({ rate: agentProfiles.roiHourlyRate })
                .from(agentProfiles)
                .where(and(eq(agentProfiles.tenantId, tenantId), eq(agentProfiles.id, agentProfileId)))
                .limit(1),
        ]);

        const msToHours = (ms: unknown) => Number(ms ?? 0) / 3_600_000;
        const hours = {
            today: msToHours(hourRows[0]?.today),
            week: msToHours(hourRows[0]?.week),
            allTime: msToHours(hourRows[0]?.allTime),
        };
        const rate = Number(profileRows[0]?.rate ?? 0);

        // The latest outcome per job, so a job that has started failing says so
        // instead of just showing a green "enabled" toggle.
        const jobIds = jobRows.map((j) => j.id);
        const lastRuns = jobIds.length
            ? await db.select({ jobId: jobRuns.jobId, status: jobRuns.status, error: jobRuns.error, startedAt: jobRuns.startedAt })
                .from(jobRuns)
                .where(inArray(jobRuns.jobId, jobIds))
                .orderBy(desc(jobRuns.startedAt))
                .limit(200)
            : [];
        const latestByJob = new Map<string, { status: string; error: string | null }>();
        for (const r of lastRuns) {
            if (!latestByJob.has(r.jobId)) latestByJob.set(r.jobId, { status: r.status, error: r.error });
        }

        return {
            hours,
            // Only when the workspace has said what an hour of this role is worth.
            valueUsd: rate > 0
                ? { today: hours.today * rate, allTime: hours.allTime * rate }
                : null,
            recentRuns: runRows.map((r) => ({
                id: r.id,
                trigger: r.trigger,
                status: r.status,
                title: r.title,
                at: r.startedAt ? new Date(r.startedAt).getTime() : 0,
                durationMs: r.durationMs ?? 0,
                error: r.error,
            })),
            jobs: jobRows.map((j) => ({
                id: j.id,
                name: j.name,
                schedule: j.scheduleType === "cron"
                    ? (j.cronExpression || "cron")
                    : j.scheduleType === "interval"
                        ? `every ${Math.round((j.intervalSeconds ?? 0) / 60)} min`
                        : "once",
                enabled: !!j.enabled,
                lastRunAt: j.lastRunAt ? new Date(j.lastRunAt).getTime() : null,
                nextRunAt: j.nextRunAt ? new Date(j.nextRunAt).getTime() : null,
                lastStatus: latestByJob.get(j.id)?.status ?? null,
                lastError: latestByJob.get(j.id)?.error ?? null,
            })),
            commitments: commitmentRows.map((c) => ({
                id: c.id,
                summary: c.summary,
                dueAt: c.dueAt ? new Date(c.dueAt).getTime() : 0,
                status: c.status,
            })),
        };
    } catch (error) {
        console.error("Failed to load agent activity:", error);
        return empty;
    }
}
