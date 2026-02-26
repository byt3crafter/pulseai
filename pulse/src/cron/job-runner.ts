/**
 * Job Runner — executes a scheduled job by sending a message to the agent.
 */

import { createJobRun, completeJobRun, updateJobLastRun } from "./job-store.js";
import { logger } from "../utils/logger.js";

// Import types only — actual runtime will be injected
type AgentRuntime = any;

let runtimeRef: AgentRuntime | null = null;
let sendCallbackRef: Function | null = null;

export function setJobRunnerDeps(runtime: AgentRuntime, sendCallback: Function) {
    runtimeRef = runtime;
    sendCallbackRef = sendCallback;
}

export async function executeJob(job: any): Promise<void> {
    const jobLog = logger.child({ jobId: job.id, agentId: job.agentId, tenantId: job.tenantId });

    if (!runtimeRef) {
        jobLog.error("Agent runtime not initialized — cannot execute scheduled job");
        return;
    }

    const run = await createJobRun(job.id, job.tenantId);
    jobLog.info({ runId: run.id, name: job.name }, "Executing scheduled job");

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
