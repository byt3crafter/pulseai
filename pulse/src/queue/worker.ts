import { Worker, Job } from "bullmq";
import { config } from "../config.js";
import { AgentRuntime } from "../agent/runtime.js";
import { InboundMessage, OutboundMessage } from "../channels/types.js";
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
 * Global channel adapter registry
 * Populated during server initialization
 */
export const channelAdapters = new Map<string, any>();

/**
 * Message Worker - Processes queued inbound messages
 *
 * Features:
 * - Processes messages asynchronously to prevent webhook timeouts
 * - Supports parallel processing (configurable concurrency)
 * - Automatic retry with exponential backoff
 * - Graceful error handling
 */
export const worker =
    config.REDIS_URL
        ? new Worker(
              "pulse-messages",
              async (job: Job<InboundMessage>) => {
                  const inbound = job.data;

                  const jobLogger = logger.child({
                      jobId: job.id,
                      messageId: inbound.id,
                      tenantId: inbound.tenantId,
                      channelType: inbound.channelType,
                  });

                  jobLogger.info("Processing message from queue");

                  try {
                      // Initialize agent runtime for this job
                      const agentRuntime = new AgentRuntime();

                      // Get channel adapter for sending responses
                      const adapter = channelAdapters.get(inbound.channelType);
                      if (!adapter) {
                          throw new Error(`Channel adapter not found for type: ${inbound.channelType}`);
                      }

                      // Callback to send message back through channel
                      const sendCallback = async (msg: OutboundMessage) => {
                          return await adapter.sendMessage(msg);
                      };

                      // Process the message
                      await agentRuntime.processMessage(inbound, sendCallback);

                      jobLogger.info("Message processed successfully");
                  } catch (err) {
                      jobLogger.error({ err }, "Failed to process message");
                      throw err; // Let BullMQ handle retry logic
                  }
              },
              {
                  connection: parseRedisUrl(config.REDIS_URL),
                  concurrency: 5, // Process up to 5 messages in parallel
                  limiter: {
                      max: 10, // Max 10 jobs
                      duration: 1000, // Per second
                  },
              }
          )
        : null;

// Worker event handlers
if (worker) {
    worker.on("completed", (job) => {
        logger.info(
            {
                jobId: job.id,
                duration: Date.now() - job.timestamp,
            },
            "Job completed"
        );
    });

    worker.on("failed", (job, err) => {
        logger.error(
            {
                jobId: job?.id,
                attemptsMade: job?.attemptsMade,
                err,
            },
            "Job failed"
        );
    });

    worker.on("error", (err) => {
        logger.error({ err }, "Worker error");
    });

    worker.on("ready", () => {
        logger.info("Message worker is ready");
    });

    logger.info({ concurrency: 5 }, "Message worker initialized");
}
