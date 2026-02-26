/**
 * Job Store — DB persistence for scheduled jobs.
 */

import { db } from "../storage/db.js";
import { scheduledJobs, jobRuns } from "../storage/schema.js";
import { eq, and, sql, desc } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface ScheduledJobData {
    tenantId: string;
    agentId: string;
    name: string;
    scheduleType: "cron" | "interval" | "once";
    cronExpression?: string;
    intervalSeconds?: number;
    runAt?: Date;
    message: string;
    timezone?: string;
}

export async function createJob(data: ScheduledJobData) {
    const webhookToken = randomBytes(32).toString("hex");

    const [job] = await db
        .insert(scheduledJobs)
        .values({
            tenantId: data.tenantId,
            agentId: data.agentId,
            name: data.name,
            scheduleType: data.scheduleType,
            cronExpression: data.cronExpression || null,
            intervalSeconds: data.intervalSeconds || null,
            runAt: data.runAt || null,
            message: data.message,
            timezone: data.timezone || "UTC",
            webhookToken,
            enabled: true,
        })
        .returning();

    return job;
}

export async function getEnabledJobs() {
    return db.query.scheduledJobs.findMany({
        where: eq(scheduledJobs.enabled, true),
    });
}

export async function getJobsByAgent(agentId: string) {
    return db.query.scheduledJobs.findMany({
        where: eq(scheduledJobs.agentId, agentId),
        orderBy: [desc(scheduledJobs.createdAt)],
    });
}

export async function getJobByWebhookToken(token: string) {
    return db.query.scheduledJobs.findFirst({
        where: eq(scheduledJobs.webhookToken, token),
    });
}

export async function toggleJob(jobId: string, enabled: boolean) {
    await db
        .update(scheduledJobs)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(scheduledJobs.id, jobId));
}

export async function deleteJob(jobId: string) {
    await db.delete(scheduledJobs).where(eq(scheduledJobs.id, jobId));
}

export async function updateJobLastRun(jobId: string, nextRunAt?: Date) {
    await db
        .update(scheduledJobs)
        .set({ lastRunAt: new Date(), nextRunAt: nextRunAt || null, updatedAt: new Date() })
        .where(eq(scheduledJobs.id, jobId));
}

export async function createJobRun(jobId: string, tenantId: string) {
    const [run] = await db
        .insert(jobRuns)
        .values({ jobId, tenantId, status: "running" })
        .returning();
    return run;
}

export async function completeJobRun(runId: string, status: "completed" | "failed", result?: string, error?: string, tokensUsed?: number) {
    await db
        .update(jobRuns)
        .set({ status, result, error, tokensUsed: tokensUsed || 0, completedAt: new Date() })
        .where(eq(jobRuns.id, runId));
}

export async function getJobRuns(jobId: string, limit = 10) {
    return db.query.jobRuns.findMany({
        where: eq(jobRuns.jobId, jobId),
        orderBy: [desc(jobRuns.startedAt)],
        limit,
    });
}
