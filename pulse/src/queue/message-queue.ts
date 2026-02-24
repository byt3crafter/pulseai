import { Queue } from "bullmq";
import { config } from "../config.js";
import { InboundMessage } from "../channels/types.js";
import { logger } from "../utils/logger.js";

/**
 * Parse Redis URL into connection options
 */
function parseRedisUrl(url: string) {
    const parsed = new URL(url);
    return {
        host: parsed.hostname,
        port: parseInt(parsed.port || "6379"),
        password: parsed.password || undefined,
        username: parsed.username || undefined,
    };
}

/**
 * Message Queue - Handles async processing of inbound messages
 *
 * Benefits:
 * - Prevents webhook timeouts by responding immediately
 * - Allows parallel processing of multiple messages
 * - Provides retry mechanism for failed messages
 * - Enables graceful degradation during high load
 */
export const messageQueue = config.REDIS_URL
    ? new Queue("pulse-messages", {
          connection: parseRedisUrl(config.REDIS_URL),
          defaultJobOptions: {
              attempts: 3,
              backoff: {
                  type: "exponential",
                  delay: 2000,
              },
              removeOnComplete: {
                  age: 3600, // Keep completed jobs for 1 hour
                  count: 100, // Keep max 100 completed jobs
              },
              removeOnFail: {
                  age: 86400, // Keep failed jobs for 24 hours
              },
          },
      })
    : null;

/**
 * Enqueue an inbound message for async processing
 * Returns immediately to prevent webhook timeouts
 */
export async function enqueueMessage(message: InboundMessage): Promise<void> {
    if (!messageQueue) {
        logger.warn("Message queue not available (REDIS_URL not configured), processing synchronously");
        throw new Error("Queue not available - cannot enqueue message");
    }

    try {
        await messageQueue.add("process-message", message, {
            jobId: message.id, // Use message ID as job ID to prevent duplicates
        });

        logger.debug(
            {
                messageId: message.id,
                tenantId: message.tenantId,
                channelType: message.channelType,
            },
            "Message enqueued successfully"
        );
    } catch (err) {
        logger.error({ err, messageId: message.id }, "Failed to enqueue message");
        throw err;
    }
}

/**
 * Get queue statistics for monitoring
 */
export async function getQueueStats() {
    if (!messageQueue) {
        return null;
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
        messageQueue.getWaitingCount(),
        messageQueue.getActiveCount(),
        messageQueue.getCompletedCount(),
        messageQueue.getFailedCount(),
        messageQueue.getDelayedCount(),
    ]);

    return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
    };
}
