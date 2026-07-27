/**
 * Run Recorder — the keystone of the AI Workforce OS.
 *
 * Every top-level agent invocation opens a run (status "running") and closes it
 * ("completed"/"failed") with its final metrics. This operational record is what
 * the executive dashboard, task queue, replay timeline, analytics, and the live
 * fields on employee profiles all read from — none of those views can show real
 * numbers without it.
 *
 * Deliberately fail-soft: recording must NEVER break message processing. Every
 * DB call is wrapped so a recorder failure only drops the metric, never the turn.
 */

import { eq } from "drizzle-orm";
import { db } from "../storage/db.js";
import { agentRuns } from "../storage/schema.js";
import { logger } from "../utils/logger.js";

export type RunTrigger =
    | "chat" | "api" | "cron" | "heartbeat" | "commitment"
    | "standing_order" | "delegation" | "approval" | "channel";

export type RunStatus =
    | "queued" | "running" | "waiting" | "blocked"
    | "retrying" | "completed" | "failed" | "cancelled";

export interface StartRunInput {
    tenantId: string;
    agentProfileId?: string | null;
    trigger?: RunTrigger;
    triggerRef?: string | null;
    parentRunId?: string | null;
    title?: string | null;
    channelType?: string | null;
    channelContactId?: string | null;
    conversationId?: string | null;
}

interface ToolCallEntry { name: string; ok: boolean; ms: number; }

/**
 * A live handle to an open run. Mutated during processing, then flushed by
 * `finish()`. All setters are cheap and never touch the DB.
 */
export class RunHandle {
    readonly id: string | null;
    private readonly startedAt = Date.now();
    private status: RunStatus = "running";
    private model: string | null = null;
    private inputTokens = 0;
    private outputTokens = 0;
    private costUsd = 0;
    private toolCalls: ToolCallEntry[] = [];
    private error: string | null = null;
    private title: string | null;
    private agentProfileId: string | null;
    private finished = false;

    constructor(id: string | null, input: StartRunInput) {
        this.id = id;
        this.title = input.title ?? null;
        this.agentProfileId = input.agentProfileId ?? null;
    }

    setAgent(agentProfileId: string | null | undefined): void {
        if (agentProfileId) this.agentProfileId = agentProfileId;
    }
    setTitle(title: string | null | undefined): void {
        if (title) this.title = title.slice(0, 500);
    }
    setUsage(model: string | null, inputTokens: number, outputTokens: number, costUsd: number): void {
        if (model) this.model = model;
        this.inputTokens = inputTokens;
        this.outputTokens = outputTokens;
        this.costUsd = costUsd;
    }
    addToolCall(name: string, ok: boolean, ms: number): void {
        this.toolCalls.push({ name, ok, ms });
    }
    setStatus(status: RunStatus): void { this.status = status; }
    setError(message: string): void {
        this.status = "failed";
        this.error = (message || "error").slice(0, 2000);
    }
}

/**
 * Insert a "running" row and return a handle. On any DB failure returns a
 * no-op handle (id = null) so processing continues unaffected.
 */
export async function startRun(input: StartRunInput): Promise<RunHandle> {
    try {
        const [row] = await db.insert(agentRuns).values({
            tenantId: input.tenantId,
            agentProfileId: input.agentProfileId ?? null,
            trigger: input.trigger ?? "chat",
            triggerRef: input.triggerRef ?? null,
            parentRunId: input.parentRunId ?? null,
            status: "running",
            title: input.title ?? null,
            channelType: input.channelType ?? null,
            channelContactId: input.channelContactId ?? null,
            conversationId: input.conversationId ?? null,
        }).returning({ id: agentRuns.id });
        return new RunHandle(row?.id ?? null, input);
    } catch (err) {
        logger.warn({ err, tenantId: input.tenantId }, "run-recorder: failed to open run (continuing)");
        return new RunHandle(null, input);
    }
}

/** Flush the handle's final state to the row. Idempotent and fail-soft. */
export async function finishRun(handle: RunHandle): Promise<void> {
    // Access private state via a structural cast — this module owns RunHandle.
    const h = handle as unknown as {
        id: string | null; startedAt: number; status: RunStatus; model: string | null;
        inputTokens: number; outputTokens: number; costUsd: number; toolCalls: ToolCallEntry[];
        error: string | null; title: string | null; agentProfileId: string | null; finished: boolean;
    };
    if (!h.id || h.finished) return;
    h.finished = true;
    // A run still "running" at flush time completed normally.
    const status: RunStatus = h.status === "running" ? "completed" : h.status;
    const endedAt = new Date();
    const durationMs = Date.now() - h.startedAt;
    try {
        await db.update(agentRuns).set({
            status,
            model: h.model,
            agentProfileId: h.agentProfileId,
            title: h.title,
            inputTokens: Math.round(h.inputTokens),
            outputTokens: Math.round(h.outputTokens),
            costUsd: h.costUsd.toFixed(6),
            toolCallCount: h.toolCalls.length,
            toolCalls: h.toolCalls.slice(0, 100),
            error: h.error,
            endedAt,
            durationMs,
        }).where(eq(agentRuns.id, h.id));
    } catch (err) {
        logger.warn({ err, runId: h.id }, "run-recorder: failed to finish run");
    }
}
