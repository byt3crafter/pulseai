"use server";

import { db } from "../../../../../storage/db";
import { scheduledJobs, jobRuns, agentProfiles } from "../../../../../storage/schema";
import { eq, desc, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { requireTenant } from "../../../../../utils/tenant-auth";

export async function getAgentSchedules(agentId: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    return db.query.scheduledJobs.findMany({
        where: and(eq(scheduledJobs.agentId, agentId), eq(scheduledJobs.tenantId, tenantId)),
        orderBy: [desc(scheduledJobs.createdAt)],
    });
}

export async function getJobRunHistory(jobId: string, limit = 10) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    return db.query.jobRuns.findMany({
        where: and(eq(jobRuns.jobId, jobId), eq(jobRuns.tenantId, tenantId)),
        orderBy: [desc(jobRuns.startedAt)],
        limit,
    });
}

export async function createSchedule(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    const agentId = formData.get("agentId") as string;
    const name = formData.get("name") as string;
    const scheduleType = formData.get("scheduleType") as string;
    const cronExpression = formData.get("cronExpression") as string;
    const intervalSeconds = parseInt(formData.get("intervalSeconds") as string) || null;
    const runAt = formData.get("runAt") as string;
    const message = formData.get("message") as string;
    const timezone = (formData.get("timezone") as string) || "UTC";
    // Only run when there is something to do. Empty = always run (the default,
    // and what every job did before this existed).
    const precondition = ((formData.get("precondition") as string) || "").trim() || null;
    const tools = parseToolScope(formData.get("tools"));

    // Verify the agent belongs to this tenant before creating a schedule for it
    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, tenantId)),
    });
    if (!agent) return;

    const webhookToken = randomBytes(32).toString("hex");

    await db.insert(scheduledJobs).values({
        tenantId,
        agentId,
        name,
        scheduleType,
        cronExpression: scheduleType === "cron" ? cronExpression : null,
        intervalSeconds: scheduleType === "interval" ? intervalSeconds : null,
        runAt: scheduleType === "once" && runAt ? new Date(runAt) : null,
        message,
        precondition,
        tools,
        timezone,
        webhookToken,
        enabled: true,
    });

    revalidatePath(`/dashboard/agents/${agentId}/schedules`);
}

export async function toggleSchedule(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    const jobId = formData.get("jobId") as string;
    const agentId = formData.get("agentId") as string;
    const enabled = formData.get("enabled") === "true";

    await db
        .update(scheduledJobs)
        .set({ enabled: !enabled, updatedAt: new Date() })
        .where(and(eq(scheduledJobs.id, jobId), eq(scheduledJobs.tenantId, tenantId)));

    revalidatePath(`/dashboard/agents/${agentId}/schedules`);
}

export async function deleteSchedule(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    const jobId = formData.get("jobId") as string;
    const agentId = formData.get("agentId") as string;

    await db.delete(scheduledJobs).where(and(eq(scheduledJobs.id, jobId), eq(scheduledJobs.tenantId, tenantId)));
    revalidatePath(`/dashboard/agents/${agentId}/schedules`);
}

/**
 * A comma/newline separated list of tool names, or null for "all tools".
 *
 * Kept permissive on purpose: a name that does not match any enabled tool is
 * ignored at run time rather than failing the run, because a job silently
 * stopping is far worse than a job carrying one stale name.
 */
function parseToolScope(raw: FormDataEntryValue | null): string[] | null {
    const text = ((raw as string) || "").trim();
    if (!text) return null;
    const names = text
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 60);
    return names.length ? Array.from(new Set(names)) : null;
}

/**
 * Change an existing schedule.
 *
 * This did not exist: a job could only be created, toggled or deleted, so the
 * "only run when" and tool-scope settings were unreachable for every schedule
 * already running — the two settings that stop a job burning tokens were
 * available only to jobs that did not exist yet.
 */
export async function updateSchedule(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.agents.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    const jobId = formData.get("jobId") as string;
    const agentId = formData.get("agentId") as string;
    if (!jobId || !agentId) return;

    await db
        .update(scheduledJobs)
        .set({
            precondition: ((formData.get("precondition") as string) || "").trim() || null,
            tools: parseToolScope(formData.get("tools")),
            updatedAt: new Date(),
        })
        .where(and(eq(scheduledJobs.id, jobId), eq(scheduledJobs.tenantId, tenantId)));

    revalidatePath(`/dashboard/agents/${agentId}/schedules`);
}
