import { server } from "./gateway/server.js";
import { config } from "./config.js";
import { TelegramAdapter } from "./channels/telegram/adapter.js";
import { AgentRuntime } from "./agent/runtime.js";
import { db } from "./storage/db.js";
import { channelConnections, tenants } from "./storage/schema.js";
import { eq } from "drizzle-orm";
import { worker, channelAdapters } from "./queue/worker.js";
import { messageQueue } from "./queue/message-queue.js";

async function start() {
    try {
        // Initialize Agent Runtime
        const agentRuntime = new AgentRuntime();

        // Initialize Telegram Adapter
        const telegramAdapter = new TelegramAdapter();

        // Load channel connections from database
        const connections = await db.query.channelConnections.findMany({
            where: eq(channelConnections.status, "active"),
        });

        // Map connections to the format expected by adapter
        const telegramConnections = connections
            .filter((conn) => conn.channelType === "telegram")
            .map((conn) => ({
                id: conn.id,
                tenantId: conn.tenantId,
                channelType: conn.channelType,
                channelConfig: conn.channelConfig as Record<string, any>,
            }));

        // Initialize Telegram connections
        await telegramAdapter.initialize(telegramConnections);

        // Register channel adapter with worker for queue processing
        channelAdapters.set("telegram", telegramAdapter);

        // Set up message handler for queue or fallback synchronous processing
        telegramAdapter.onMessage(async (inbound) => {
            if (messageQueue) {
                // Production: Offload the heavy LLM call to Redis background worker
                try {
                    await messageQueue.add("process-message", inbound, {
                        jobId: inbound.id, // Idempotency key
                    });
                } catch (e) {
                    server.log.error({ err: e }, "Failed to enqueue message");
                }
            } else {
                // Dev Fallback: Run synchronously on main thread
                await agentRuntime.processMessage(inbound, async (outbound) => {
                    return await telegramAdapter.sendMessage(outbound);
                });
            }
        });

        // Register Telegram adapter with server for webhook access
        server.decorate("telegramAdapter", telegramAdapter);

        // Log queue status
        if (messageQueue) {
            server.log.info("Message queue enabled - using async processing");
        } else {
            server.log.warn(
                "Message queue disabled (REDIS_URL not configured) - using synchronous processing"
            );
        }

        // Start the server
        await server.listen({ port: config.PORT, host: "0.0.0.0" });
        server.log.info(`🤖 Pulse AI Gateway is running on port ${config.PORT}`);

        // In production mode with webhook URL, set webhooks for all active bots
        if (config.NODE_ENV === "production" && config.WEBHOOK_BASE_URL) {
            server.log.info("Setting up Telegram webhooks for production mode");
            for (const [tenantId, bot] of telegramAdapter.activeBots.entries()) {
                const tenant = await db.query.tenants.findFirst({
                    where: eq(tenants.id, tenantId),
                });

                if (!tenant) {
                    server.log.warn({ tenantId }, "Tenant not found for webhook setup");
                    continue;
                }

                const webhookUrl = `${config.WEBHOOK_BASE_URL}/webhooks/telegram/${tenant.slug}`;

                try {
                    await bot.api.setWebhook(webhookUrl, {
                        drop_pending_updates: false,
                        secret_token: config.TELEGRAM_WEBHOOK_SECRET,
                    });
                    server.log.info({ tenantSlug: tenant.slug, webhookUrl }, "Webhook configured successfully");
                } catch (err) {
                    server.log.error({ err, tenantSlug: tenant.slug }, "Failed to set webhook");
                }
            }
        } else {
            server.log.info("Running in development mode with polling");
        }

        // Graceful shutdown
        const shutdown = async () => {
            server.log.info("Shutting down gracefully...");

            // Stop accepting new messages
            await telegramAdapter.shutdown();

            // Close worker if it exists
            if (worker) {
                server.log.info("Closing message worker...");
                await worker.close();
            }

            // Close queue if it exists
            if (messageQueue) {
                server.log.info("Closing message queue...");
                await messageQueue.close();
            }

            await server.close();
            process.exit(0);
        };

        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

start();
