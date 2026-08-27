/**
 * Job Runner — executes a scheduled job by sending a message to the agent.
 */

import { createJobRun, completeJobRun, updateJobLastRun } from "./job-store.js";
import { logger } from "../utils/logger.js";
import { countUnreadEmails, resolveEmailConfig } from "../channels/email/email-service.js";

// Import types only — actual runtime will be injected
type AgentRuntime = any;

let runtimeRef: AgentRuntime | null = null;
let sendCallbackRef: Function | null = null;

export function setJobRunnerDeps(runtime: AgentRuntime, sendCallback: Function) {
    runtimeRef = runtime;
    sendCallbackRef = sendCallback;
}

/** The injected agent runtime (used by other background jobs, e.g. commitments). */
export function getJobRunnerRuntime(): AgentRuntime | null {
    return runtimeRef;
}


/**
 * Should this job actually wake the agent?
 *
 * A polling job asks a question most of the time it runs, and most of the time
 * the answer is "nothing". Asking a language model costs ~49,000 input tokens
 * to hear "no" in fifteen; asking IMAP costs a socket round-trip. So the cheap
 * check runs first and the model only runs when there is real work.
 *
 * Fails OPEN on purpose. If the probe errors — credentials rotated, mail server
 * down — the job runs as it always did. A precondition is an optimisation, and
 * an optimisation must never be the reason work silently stops happening.
 */
export async function shouldRun(job: any, jobLog: any = logger): Promise<{ run: boolean; reason: string }> {
    const check = (job.precondition || "").trim();
    if (!check) return { run: true, reason: "" };

    if (check === "email_unread") {
        try {
            const config = await resolveEmailConfig(job.tenantId, job.agentId);
            if (!config?.imap) return { run: true, reason: "no imap configured — running anyway" };
            const unread = await countUnreadEmails(config.imap);
            return unread > 0
                ? { run: true, reason: `${unread} unread` }
                : { run: false, reason: "inbox empty" };
        } catch (err) {
            jobLog.warn({ err }, "precondition check failed — running the job anyway");
            return { run: true, reason: "precondition check failed" };
        }
    }

    jobLog.warn({ check }, "unknown precondition — running the job anyway");
    return { run: true, reason: "unknown precondition" };
}

export async function executeJob(job: any): Promise<void> {
    const jobLog = logger.child({ jobId: job.id, agentId: job.agentId, tenantId: job.tenantId });

    if (!runtimeRef) {
        jobLog.error("Agent runtime not initialized — cannot execute scheduled job");
        return;
    }

    // Before anything is recorded or spent: is there work to do at all?
    const gate = await shouldRun(job, jobLog);
    if (!gate.run) {
        // Deliberately no job run row and no agent run: a poll that found
        // nothing is not activity, and logging it would recreate the very
        // noise this is meant to remove. The skip is visible in the logs.
        await updateJobLastRun(job.id);
        jobLog.info({ name: job.name, reason: gate.reason }, "Scheduled job skipped — nothing to do");
        return;
    }

    const run = await createJobRun(job.id, job.tenantId);
    jobLog.info({ runId: run.id, name: job.name, reason: gate.reason }, "Executing scheduled job");

    try {
        // Build a synthetic inbound message
        const inbound = {
            id: `cron-${run.id}`,
            tenantId: job.tenantId,
            agentProfileId: job.agentId,
            channelType: "heartbeat" as const,
            channelContactId: `cron-${job.id}`,
            contactName: `Cron: ${job.name}`,
            content: job.message,
            receivedAt: new Date(),
            // Label the operational run by the job kind rather than the synthetic
            // "heartbeat" channel, and title it with the job name.
            trigger: (job.scheduleType === "interval" ? "heartbeat" : "cron") as "cron" | "heartbeat",
            triggerRef: job.id,
        };

        // Capture the response instead of sending to a channel
        let capturedResponse = "";
        const captureCallback = async (msg: any) => {
            capturedResponse = msg.content || "";
            return { channelMessageId: `cron-response-${run.id}` };
        };

        await runtimeRef.processMessage(inbound, captureCallback);

        await completeJobRun(run.id, "completed", capturedResponse.substring(0, 5000));
        await updateJobLastRun(job.id);

        jobLog.info({ runId: run.id }, "Scheduled job completed");
    } catch (err: any) {
        jobLog.error({ err, runId: run.id }, "Scheduled job failed");
        await completeJobRun(run.id, "failed", undefined, err.message);
        await updateJobLastRun(job.id);
    }
}
