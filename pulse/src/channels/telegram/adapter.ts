import { Bot, Context } from "grammy";
import { ChannelAdapter, ChannelConnectionConfig } from "../channel.interface.js";
import { InboundMessage, OutboundMessage } from "../types.js";
import { logger } from "../../utils/logger.js";
import { randomUUID } from "node:crypto";
import { enqueueMessage, messageQueue } from "../../queue/message-queue.js";
import { isGroupChat, hasBotMention, isReplyToBot, stripBotMention } from "./group-helpers.js";
import { checkDmAccess, getOrCreatePairingCode } from "./pairing.js";
import { db } from "../../storage/db.js";
import { tenants, allowlists } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";

interface TenantConfig {
    telegram_dm_policy?: "open" | "pairing" | "disabled";
    telegram_group_policy?: "open" | "allowlist" | "disabled";
    telegram_require_mention?: boolean;
    [key: string]: unknown;
}

export class TelegramAdapter implements ChannelAdapter {
    readonly channelType = "telegram";

    // Maps a specific tenant ID to their running grammY Bot instance
    public activeBots: Map<string, Bot<Context>> = new Map();
    // Handler provided by the core agent runtime
    private messageHandler: ((msg: InboundMessage) => Promise<void>) | null = null;
    // Cached tenant configs with TTL
    private tenantConfigs: Map<string, { config: TenantConfig; loadedAt: number }> = new Map();
    private static CONFIG_TTL_MS = 30_000; // 30 second cache

    private async loadTenantConfig(tenantId: string): Promise<TenantConfig> {
        const cached = this.tenantConfigs.get(tenantId);
        if (cached && Date.now() - cached.loadedAt < TelegramAdapter.CONFIG_TTL_MS) {
            return cached.config;
        }

        const tenant = await db.query.tenants.findFirst({
            where: eq(tenants.id, tenantId),
        });

        const config = (tenant?.config as TenantConfig) || {};
        this.tenantConfigs.set(tenantId, { config, loadedAt: Date.now() });
        return config;
    }

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

                // Pre-load tenant config
                await this.loadTenantConfig(conn.tenantId);

                bot.on("message:text", async (ctx) => {
                    try {
                        await this.handleTextMessage(ctx, conn);
                    } catch (err) {
                        logger.error({ err, tenantId: conn.tenantId }, "Error handling text message");
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

    private async handleTextMessage(ctx: Context, conn: ChannelConnectionConfig): Promise<void> {
        const tenantConfig = await this.loadTenantConfig(conn.tenantId);
        const isGroup = isGroupChat(ctx);

        if (isGroup) {
            await this.handleGroupMessage(ctx, conn, tenantConfig);
        } else {
            await this.handleDmMessage(ctx, conn, tenantConfig);
        }
    }

    private async handleGroupMessage(
        ctx: Context,
        conn: ChannelConnectionConfig,
        tenantConfig: TenantConfig
    ): Promise<void> {
        const groupPolicy = tenantConfig.telegram_group_policy ?? "disabled";
        if (groupPolicy === "disabled") return;

        const requireMention = tenantConfig.telegram_require_mention ?? true;
        const mentioned = hasBotMention(ctx);
        const replyToMe = isReplyToBot(ctx);

        // Skip if mention required and bot wasn't mentioned/replied to
        if (requireMention && !mentioned && !replyToMe) return;

        const groupChatId = ctx.chat!.id.toString();

        // If allowlist policy, check group is approved
        if (groupPolicy === "allowlist") {
            const entry = await db.query.allowlists.findFirst({
                where: and(
                    eq(allowlists.tenantId, conn.tenantId),
                    eq(allowlists.channelType, "telegram"),
                    eq(allowlists.contactId, groupChatId),
                    eq(allowlists.contactType, "group")
                ),
            });
            if (!entry || entry.status !== "approved") return;
        }

        // Strip bot mention from content
        let content = ctx.message!.text ?? "";
        if (mentioned && ctx.me?.username) {
            content = stripBotMention(content, ctx.me.username);
        }

        const inbound: InboundMessage = {
            id: randomUUID(),
            tenantId: conn.tenantId,
            agentProfileId: conn.agentProfileId || undefined,
            channelType: "telegram",
            channelContactId: groupChatId,
            contactName: (ctx.chat as any)?.title || "Group",
            content,
            raw: ctx.message,
            receivedAt: new Date(ctx.message!.date * 1000),
            // Group fields
            isGroup: true,
            senderUserId: ctx.from?.id.toString(),
            senderUsername: ctx.from?.username,
            groupTitle: (ctx.chat as any)?.title,
            wasMentioned: mentioned,
            isReplyToBot: replyToMe,
        };

        ctx.replyWithChatAction("typing").catch(() => {});
        await this.dispatchMessage(inbound, conn.tenantId);
    }

    private async handleDmMessage(
        ctx: Context,
        conn: ChannelConnectionConfig,
        tenantConfig: TenantConfig
    ): Promise<void> {
        const dmPolicy = tenantConfig.telegram_dm_policy ?? "open";
        if (dmPolicy === "disabled") return;

        const contactId = ctx.from!.id.toString();
        const contactName = ctx.from!.first_name + (ctx.from!.last_name ? ` ${ctx.from!.last_name}` : "");

        // Handle pairing flow
        if (dmPolicy === "pairing") {
            const accessStatus = await checkDmAccess(conn.tenantId, contactId);

            if (accessStatus === "blocked") {
                await ctx.reply("Access denied. Please contact the administrator.");
                return;
            }

            if (accessStatus !== "approved") {
                const code = await getOrCreatePairingCode(conn.tenantId, contactId, contactName);
                await ctx.reply(
                    `Welcome! To start chatting, please share this pairing code with your administrator:\n\n` +
                    `🔑 *${code}*\n\n` +
                    `This code expires in 1 hour.`,
                    { parse_mode: "Markdown" }
                );
                return;
            }
        }

        const inbound: InboundMessage = {
            id: randomUUID(),
            tenantId: conn.tenantId,
            agentProfileId: conn.agentProfileId || undefined,
            channelType: "telegram",
            channelContactId: contactId,
            contactName,
            content: ctx.message!.text ?? "",
            raw: ctx.message,
            receivedAt: new Date(ctx.message!.date * 1000),
            isGroup: false,
        };

        ctx.replyWithChatAction("typing").catch(() => {});
        await this.dispatchMessage(inbound, conn.tenantId);
    }

    private async dispatchMessage(inbound: InboundMessage, tenantId: string): Promise<void> {
        if (messageQueue) {
            try {
                await enqueueMessage(inbound);
            } catch (err) {
                logger.error({ err, tenantId }, "Failed to enqueue message, falling back to sync");
                if (this.messageHandler) {
                    await this.messageHandler(inbound);
                }
            }
        } else {
            if (this.messageHandler) {
                await this.messageHandler(inbound);
            }
        }
    }

    async shutdown(): Promise<void> {
        for (const [tenantId, bot] of this.activeBots.entries()) {
            await bot.stop();
            logger.info({ tenantId }, "Telegram bot connection stopped");
        }
        this.activeBots.clear();
        this.tenantConfigs.clear();
    }

    onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    async sendMessage(msg: OutboundMessage): Promise<{ channelMessageId: string }> {
        const bot = this.activeBots.get(msg.tenantId);
        if (!bot) throw new Error("Bot not found for this tenant");

        const opts: Record<string, any> = {};
        if (msg.format === "markdown") {
            opts.parse_mode = "MarkdownV2";
        }
        // For group messages, reply in-thread to the original message
        if (msg.replyToMessageId) {
            opts.reply_to_message_id = parseInt(msg.replyToMessageId, 10);
        }

        const sent = await bot.api.sendMessage(
            msg.channelContactId,
            this.formatResponse(msg.content),
            opts
        );

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
