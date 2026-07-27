import { db } from "../storage/db";
import { agentRuns, agentProfiles } from "../storage/schema";
import { and, eq, desc, gte, sql } from "drizzle-orm";

/**
 * Read helpers over agent_runs — the operational record behind the executive
 * dashboard and task queue. All queries are tenant-scoped; callers pass the
 * session tenantId (never trust a client-supplied one).
 */

export interface WorkforceStats {
    runsToday: number;
    running: number;
    completedToday: number;
    failedToday: number;
    waiting: number;          // queued|waiting|blocked|retrying right now
    tokensToday: number;
    costTodayUsd: number;
    activeAgents: number;     // distinct agents with a run today
    avgDurationMs: number;    // completed runs today
    successRate: number | null; // completed / (completed+failed) today, 0..1
}

/** UTC midnight — the start of "today" for the KPI window. */
function startOfTodayUtc(): Date {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function getWorkforceStats(tenantId: string): Promise<WorkforceStats> {
    const since = startOfTodayUtc();
    const t = eq(agentRuns.tenantId, tenantId);

    // Single aggregate pass over today's runs.
    const [today] = await db
        .select({
            runs: sql<number>`count(*)`,
            completed: sql<number>`count(*) filter (where ${agentRuns.status} = 'completed')`,
            failed: sql<number>`count(*) filter (where ${agentRuns.status} = 'failed')`,
            tokens: sql<number>`coalesce(sum(${agentRuns.inputTokens} + ${agentRuns.outputTokens}), 0)`,
            cost: sql<number>`coalesce(sum(${agentRuns.costUsd}), 0)`,
            agents: sql<number>`count(distinct ${agentRuns.agentProfileId})`,
            avgDur: sql<number>`coalesce(avg(${agentRuns.durationMs}) filter (where ${agentRuns.status} = 'completed'), 0)`,
        })
        .from(agentRuns)
        .where(and(t, gte(agentRuns.startedAt, since)));

    // Live status counts (not time-bounded).
    const [live] = await db
        .select({
            running: sql<number>`count(*) filter (where ${agentRuns.status} = 'running')`,
            waiting: sql<number>`count(*) filter (where ${agentRuns.status} in ('queued','waiting','blocked','retrying'))`,
        })
        .from(agentRuns)
        .where(t);

    const completed = Number(today?.completed ?? 0);
    const failed = Number(today?.failed ?? 0);
    const denom = completed + failed;

    return {
        runsToday: Number(today?.runs ?? 0),
        running: Number(live?.running ?? 0),
        completedToday: completed,
        failedToday: failed,
        waiting: Number(live?.waiting ?? 0),
        tokensToday: Number(today?.tokens ?? 0),
        costTodayUsd: Number(today?.cost ?? 0),
        activeAgents: Number(today?.agents ?? 0),
        avgDurationMs: Math.round(Number(today?.avgDur ?? 0)),
        successRate: denom > 0 ? completed / denom : null,
    };
}

export interface RunRow {
    id: string;
    agentName: string | null;
    trigger: string;
    status: string;
    title: string | null;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    toolCallCount: number;
    toolCalls: { name: string; ok: boolean; ms: number }[];
    error: string | null;
    startedAt: string;
    durationMs: number | null;
}

function selectRunColumns() {
    return {
        id: agentRuns.id,
        agentName: agentProfiles.name,
        trigger: agentRuns.trigger,
        status: agentRuns.status,
        title: agentRuns.title,
        model: agentRuns.model,
        inputTokens: agentRuns.inputTokens,
        outputTokens: agentRuns.outputTokens,
        costUsd: agentRuns.costUsd,
        toolCallCount: agentRuns.toolCallCount,
        toolCalls: agentRuns.toolCalls,
        error: agentRuns.error,
        startedAt: agentRuns.startedAt,
        durationMs: agentRuns.durationMs,
    };
}

function mapRun(r: any): RunRow {
    return {
        id: r.id,
        agentName: r.agentName ?? null,
        trigger: r.trigger,
        status: r.status,
        title: r.title ?? null,
        model: r.model ?? null,
        inputTokens: Number(r.inputTokens ?? 0),
        outputTokens: Number(r.outputTokens ?? 0),
        costUsd: Number(r.costUsd ?? 0),
        toolCallCount: Number(r.toolCallCount ?? 0),
        toolCalls: Array.isArray(r.toolCalls) ? r.toolCalls : [],
        error: r.error ?? null,
        startedAt: (r.startedAt instanceof Date ? r.startedAt : new Date(r.startedAt)).toISOString(),
        durationMs: r.durationMs ?? null,
    };
}

/** Recent runs for the dashboard activity feed. */
export async function getRecentRuns(tenantId: string, limit = 12): Promise<RunRow[]> {
    const rows = await db
        .select(selectRunColumns())
        .from(agentRuns)
        .leftJoin(agentProfiles, eq(agentRuns.agentProfileId, agentProfiles.id))
        .where(eq(agentRuns.tenantId, tenantId))
        .orderBy(desc(agentRuns.startedAt))
        .limit(limit);
    return rows.map(mapRun);
}

export interface AgentActivity {
    running: number;         // runs in flight right now
    tasksToday: number;
    successRate: number | null;
    lastActiveAt: string | null;
}

/**
 * Live activity per agent for the workforce directory (agents list). One pass,
 * keyed by agentProfileId. Agents with no runs simply won't appear in the map.
 */
export async function getAgentActivityBatch(tenantId: string): Promise<Record<string, AgentActivity>> {
    const since = startOfTodayUtc();
    const rows = await db
        .select({
            agentId: agentRuns.agentProfileId,
            running: sql<number>`count(*) filter (where ${agentRuns.status} = 'running')`,
            tasksToday: sql<number>`count(*) filter (where ${agentRuns.startedAt} >= ${since})`,
            completedToday: sql<number>`count(*) filter (where ${agentRuns.status} = 'completed' and ${agentRuns.startedAt} >= ${since})`,
            failedToday: sql<number>`count(*) filter (where ${agentRuns.status} = 'failed' and ${agentRuns.startedAt} >= ${since})`,
            lastActive: sql<string | null>`max(${agentRuns.startedAt})`,
        })
        .from(agentRuns)
        .where(eq(agentRuns.tenantId, tenantId))
        .groupBy(agentRuns.agentProfileId);

    const out: Record<string, AgentActivity> = {};
    for (const r of rows) {
        if (!r.agentId) continue;
        const completed = Number(r.completedToday ?? 0);
        const failed = Number(r.failedToday ?? 0);
        const denom = completed + failed;
        out[r.agentId] = {
            running: Number(r.running ?? 0),
            tasksToday: Number(r.tasksToday ?? 0),
            successRate: denom > 0 ? completed / denom : null,
            lastActiveAt: r.lastActive ? new Date(r.lastActive).toISOString() : null,
        };
    }
    return out;
}

const RUN_STATUSES = ["queued", "running", "waiting", "blocked", "retrying", "completed", "failed", "cancelled"] as const;

/** Paginated task queue with optional status filter. */
export async function getRuns(
    tenantId: string,
    opts: { status?: string; page?: number; pageSize?: number } = {}
): Promise<{ rows: RunRow[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(0, opts.page ?? 0);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
    const status = opts.status && (RUN_STATUSES as readonly string[]).includes(opts.status) ? opts.status : undefined;

    const where = status
        ? and(eq(agentRuns.tenantId, tenantId), eq(agentRuns.status, status))
        : eq(agentRuns.tenantId, tenantId);

    const [rows, [countRow]] = await Promise.all([
        db.select(selectRunColumns())
            .from(agentRuns)
            .leftJoin(agentProfiles, eq(agentRuns.agentProfileId, agentProfiles.id))
            .where(where)
            .orderBy(desc(agentRuns.startedAt))
            .limit(pageSize)
            .offset(page * pageSize),
        db.select({ count: sql<number>`count(*)` }).from(agentRuns).where(where),
    ]);

    return { rows: rows.map(mapRun), total: Number(countRow?.count ?? 0), page, pageSize };
}
