import { server } from "./gateway/server.js";
import { config } from "./config.js";
import { TelegramAdapter } from "./channels/telegram/adapter.js";
import { AgentRuntime } from "./agent/runtime.js";
import { db } from "./storage/db.js";
import { channelConnections, tenants } from "./storage/schema.js";
import { eq } from "drizzle-orm";
import { worker, channelAdapters } from "./queue/worker.js";
import { messageQueue } from "./queue/message-queue.js";
import { initializeChannelAdapters } from "./channels/bootstrap.js";
import { getChannelAdapterFactory, registerChannelAdapter } from "./channels/registry.js";
import type { InboundMessage } from "./channels/types.js";
import { startOAuthCallbackProxy, stopOAuthCallbackProxy } from "./gateway/oauth-callback-proxy.js";
import { heartbeatScheduler } from "./infra/heartbeat-scheduler.js";
import { cronScheduler } from "./cron/scheduler.js";
import { setJobRunnerDeps } from "./cron/job-runner.js";
import { setDelegationRuntime } from "./agent/orchestration/agent-delegation.js";
import { pluginManager } from "./plugins/manager.js";

async function start() {
    try {
        if (!getChannelAdapterFactory("telegram")) {
            registerChannelAdapter("telegram", () => new TelegramAdapter());
        }

        // Initialize Agent Runtime
        const agentRuntime = new AgentRuntime();

        // Load channel connections from database
        const connections = await db.query.channelConnections.findMany({
            where: eq(channelConnections.status, "active"),
        });

        const normalizedConnections = connections.map((conn) => ({
            id: conn.id,
            tenantId: conn.tenantId,
            agentProfileId: conn.agentProfileId,
            channelType: conn.channelType,
            channelConfig: conn.channelConfig as Record<string, any>,
        }));

        const onInboundMessage = async (inbound: InboundMessage) => {
            if (messageQueue) {
                // Production: Offload the heavy LLM call to Redis background worker
                try {
                    await messageQueue.add("process-message", inbound, {
                        jobId: inbound.id, // Idempotency key
                    });
                } catch (e) {
                    server.log.error({ err: e }, "Failed to enqueue message");
                }
                return;
            }

            const adapter = channelAdapters.get(inbound.channelType);
            if (!adapter) {
                server.log.error({ channelType: inbound.channelType }, "Channel adapter not found");
                return;
            }

            // Dev Fallback: Run synchronously on main thread
            await agentRuntime.processMessage(
                inbound,
                async (outbound) => {
                    return await adapter.sendMessage(outbound);
                },
                {
                    editMessageCallback: adapter.editMessage
                        ? (tenantId, chatId, messageId, content, parseMode) =>
                            adapter.editMessage(tenantId, chatId, messageId, content, parseMode)
                        : undefined,
                }
            );
        };

        await initializeChannelAdapters(normalizedConnections, {
            adapterMap: channelAdapters,
            logger: server.log,
            onInboundMessage,
        });

        // Ensure the Telegram adapter instance always exists — even with zero
        // active Telegram connections at boot — so the webhook route can lazy-load
        // a bot when a tenant connects Telegram later, without a gateway restart.
        if (!channelAdapters.has("telegram")) {
            const telegramFactory = getChannelAdapterFactory("telegram");
            if (telegramFactory) {
                const tg = telegramFactory();
                tg.onMessage(onInboundMessage);
                await tg.initialize([]);
                channelAdapters.set("telegram", tg);
            }
        }

        const telegramAdapter = channelAdapters.get("telegram") as TelegramAdapter | undefined;

        // Register Telegram adapter with server for webhook access
        server.decorate("telegramAdapter", telegramAdapter);
        server.decorate("channelAdapters", channelAdapters);

        // Register AgentRuntime so MCP route and delegation can access it
        server.decorate("agentRuntime", agentRuntime);
        setDelegationRuntime(agentRuntime);

        // Initialize Heartbeat Scheduler
        heartbeatScheduler.setRuntime(agentRuntime);
        heartbeatScheduler.setSendCallback(async (tenantId, channelContactId, content) => {
            // Route heartbeat messages through Telegram if available
            if (telegramAdapter) {
                await telegramAdapter.sendMessage({
                    conversationId: "heartbeat",
                    tenantId,
                    channelType: "telegram",
                    channelContactId,
                    content,
                    format: "markdown",
                });
            }
        });
        await heartbeatScheduler.start();

        // Initialize Cron Scheduler
        setJobRunnerDeps(agentRuntime, async (tenantId: string, channelContactId: string, content: string) => {
            if (telegramAdapter) {
                await telegramAdapter.sendMessage({
                    conversationId: "cron",
                    tenantId,
                    channelType: "telegram",
                    channelContactId,
                    content,
                    format: "markdown",
                });
            }
        });
        await cronScheduler.init();
        server.log.info("Cron scheduler initialized");

        // Initialize Plugin System
        await pluginManager.init();
        await pluginManager.onGatewayStart(server);
        server.log.info("Plugin system initialized");

        // Log queue status
        if (messageQueue) {
            server.log.info("Message queue enabled - using async processing");
        } else {
            server.log.warn(
                "Message queue disabled (REDIS_URL not configured) - using synchronous processing"
            );
        }

        // Start OAuth callback proxy on port 1455 (matches Codex CLI client registration)
        startOAuthCallbackProxy();

        // Start the server
        await server.listen({ port: config.PORT, host: "0.0.0.0" });
        server.log.info(`🤖 Pulse AI Gateway is running on port ${config.PORT}`);

        // In production mode with webhook URL, set webhooks for all active bots
        if (telegramAdapter && config.NODE_ENV === "production" && config.WEBHOOK_BASE_URL) {
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

            // Stop OAuth callback proxy
            stopOAuthCallbackProxy();

            // Stop heartbeat scheduler
            heartbeatScheduler.stop();

            // Stop cron scheduler
            cronScheduler.shutdown();

            // Stop plugin system
            await pluginManager.shutdown();

            // Stop accepting new messages
            for (const adapter of new Set(channelAdapters.values())) {
                await adapter.shutdown();
            }

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
