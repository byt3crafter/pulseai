import { Bot, Context } from "grammy";
import { ChannelAdapter, ChannelConnectionConfig } from "../channel.interface.js";
import { InboundMessage, OutboundMessage } from "../types.js";
import { logger } from "../../utils/logger.js";
import { randomUUID } from "node:crypto";
import { enqueueMessage, messageQueue } from "../../queue/message-queue.js";

export class TelegramAdapter implements ChannelAdapter {
    readonly channelType = "telegram";

    // Maps a specific tenant ID to their running grammY Bot instance
    public activeBots: Map<string, Bot<Context>> = new Map();
    // Handler provided by the core agent runtime
    private messageHandler: ((msg: InboundMessage) => Promise<void>) | null = null;

    async initialize(connections: ChannelConnectionConfig[]): Promise<void> {
        for (const conn of connections) {
            if (conn.channelType !== this.channelType) continue;

            const { botToken } = conn.channelConfig;
            if (!botToken) {
                logger.warn({ tenantId: conn.tenantId }, "Missing botToken for telegram connection");
                continue;
            }

            try {
                const bot = new Bot(botToken);

                bot.on("message:text", async (ctx) => {
                    const inbound: InboundMessage = {
                        id: randomUUID(),
                        tenantId: conn.tenantId,
                        channelType: "telegram",
                        channelContactId: ctx.from.id.toString(),
                        contactName: ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ""),
                        content: ctx.message.text,
                        raw: ctx.message,
                        receivedAt: new Date(ctx.message.date * 1000),
                    };

                    // Try to show typing indicator while processing (fire and forget)
                    ctx.replyWithChatAction("typing").catch(() => { });

                    // Use queue if available, otherwise process synchronously
                    if (messageQueue) {
                        try {
                            await enqueueMessage(inbound);
                        } catch (err) {
                            logger.error({ err, tenantId: conn.tenantId }, "Failed to enqueue message, falling back to sync");
                            // Fallback to synchronous processing if queue fails
                            if (this.messageHandler) {
                                await this.messageHandler(inbound);
                            }
                        }
                    } else {
                        // No queue available, process synchronously (development mode)
                        if (this.messageHandler) {
                            await this.messageHandler(inbound);
                        }
                    }
                });

                // For Polling mode locally
                if (process.env.NODE_ENV === "development") {
                    bot.start().catch((err) => logger.error({ err, tenantId: conn.tenantId }, "Failed to start TG polling"));
                }

                // For production, webhooks would be registered directly on the Fastify handler.
                this.activeBots.set(conn.tenantId, bot);
                logger.info({ tenantId: conn.tenantId }, "Telegram bot initialized");
            } catch (err) {
                logger.error({ err, tenantId: conn.tenantId }, "Failed to initialize Telegram connection");
            }
        }
    }

    async shutdown(): Promise<void> {
        for (const [tenantId, bot] of this.activeBots.entries()) {
            await bot.stop();
            logger.info({ tenantId }, "Telegram bot connection stopped");
        }
        this.activeBots.clear();
    }

    onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    async sendMessage(msg: OutboundMessage): Promise<{ channelMessageId: string }> {
        const bot = this.activeBots.get(msg.tenantId);
        if (!bot) throw new Error("Bot not found for this tenant");

        const sent = await bot.api.sendMessage(msg.channelContactId, this.formatResponse(msg.content), {
            parse_mode: msg.format === "markdown" ? "MarkdownV2" : undefined,
        });

        return { channelMessageId: sent.message_id.toString() };
    }

    formatResponse(content: string): string {
        // Telegram MarkdownV2 requires escaping specific characters
        // A simplified regex for escaping unescaped special chars
        return content.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
    }

    /**
     * Handle webhook updates from Telegram
     * This method is called by the webhook endpoint when an update is received
     */
    async handleWebhookUpdate(tenantId: string, update: any): Promise<void> {
        const bot = this.activeBots.get(tenantId);
        if (!bot) {
            logger.warn({ tenantId }, "Bot not found for tenant in webhook handler");
            return;
        }

        try {
            // Process the update using grammY's handleUpdate method
            await bot.handleUpdate(update);
        } catch (err) {
            logger.error({ err, tenantId }, "Failed to handle webhook update");
            throw err;
        }
    }

    /**
     * Get webhook info for a specific tenant's bot
     * Useful for debugging webhook configuration
     */
    async getWebhookInfo(tenantId: string): Promise<any> {
        const bot = this.activeBots.get(tenantId);
        if (!bot) {
            throw new Error("Bot not found for tenant");
        }

        return await bot.api.getWebhookInfo();
    }
}
