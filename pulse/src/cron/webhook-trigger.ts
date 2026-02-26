/**
 * Webhook trigger — allows external systems to trigger a scheduled job immediately.
 * POST /webhooks/cron/:webhookToken
 */

import { getJobByWebhookToken } from "./job-store.js";
import { executeJob } from "./job-runner.js";
import { logger } from "../utils/logger.js";

export async function handleCronWebhook(webhookToken: string): Promise<{ success: boolean; message: string; jobRunId?: string }> {
    const job = await getJobByWebhookToken(webhookToken);

    if (!job) {
        return { success: false, message: "Invalid webhook token" };
    }

    if (!job.enabled) {
        return { success: false, message: "Job is disabled" };
    }

    logger.info({ jobId: job.id, name: job.name }, "Webhook-triggered job execution");

    // Execute asynchronously
    executeJob(job).catch((err) =>
        logger.error({ err, jobId: job.id }, "Webhook-triggered job failed")
    );

    return { success: true, message: `Job '${job.name}' triggered`, jobRunId: job.id };
}
