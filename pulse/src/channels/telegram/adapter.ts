import { Bot, Context } from "grammy";
import { ChannelAdapter, ChannelConnectionConfig } from "../channel.interface.js";
import { InboundMessage, OutboundMessage } from "../types.js";
import { logger } from "../../utils/logger.js";
import { randomUUID } from "node:crypto";
import { enqueueMessage, messageQueue } from "../../queue/message-queue.js";
import { isGroupChat, hasBotMention, isReplyToBot, stripBotMention } from "./group-helpers.js";
import { checkDmAccess, getOrCreatePairingCode } from "./pairing.js";
import { chunkHtmlMessage, chunkMessage } from "./chunking.js";
import { markdownToIR, renderTelegramHtml } from "../formatting/index.js";
import type { MessageIR } from "../formatting/ir.js";
import { db } from "../../storage/db.js";
import { tenants, allowlists } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";

/**
 * Extensions that overlap with TLDs — Telegram auto-links "filename.ext" as a URL.
 * Wrapping in <code> prevents this. Only applied outside <code>/<pre>/<a> tags.
 */
const TLD_EXTENSIONS = new Set([
    "md", "go", "py", "sh", "rs", "ts", "js", "rb", "cs", "pl",
    "cc", "ai", "do", "io", "me", "so", "tv", "ws", "am", "fm",
    "ml", "ms", "mz", "to", "gg", "nu", "lv", "lt", "st", "im",
]);

const FILE_REF_REGEX = /\b([\w.-]+\.([\w]+))\b/g;

function wrapFileReferences(html: string): string {
    // Track nesting inside <code>, <pre>, <a> tags — don't wrap inside them
    const parts: string[] = [];
    let cursor = 0;
    const tagRegex = /<\/?(?:code|pre|a)(?:\s[^>]*)?\/?>/gi;
    let depth = 0;
    let tagMatch: RegExpExecArray | null;

    // Collect tag boundaries to know which regions are "protected"
    const protected_ranges: [number, number][] = [];
    let openPos = -1;

    tagRegex.lastIndex = 0;
    while ((tagMatch = tagRegex.exec(html)) !== null) {
        if (tagMatch[0].startsWith("</")) {
            depth--;
            if (depth === 0 && openPos >= 0) {
                protected_ranges.push([openPos, tagMatch.index + tagMatch[0].length]);
                openPos = -1;
            }
        } else {
            if (depth === 0) openPos = tagMatch.index;
            depth++;
        }
    }
    // Handle unclosed tag
    if (depth > 0 && openPos >= 0) {
        protected_ranges.push([openPos, html.length]);
    }

    function isProtected(pos: number): boolean {
        for (const [start, end] of protected_ranges) {
            if (pos >= start && pos < end) return true;
        }
        return false;
    }

    let m: RegExpExecArray | null;
    FILE_REF_REGEX.lastIndex = 0;
    while ((m = FILE_REF_REGEX.exec(html)) !== null) {
        const ext = m[2].toLowerCase();
        if (!TLD_EXTENSIONS.has(ext)) continue;
        if (isProtected(m.index)) continue;

        parts.push(html.slice(cursor, m.index));
        parts.push(`<code>${m[1]}</code>`);
        cursor = m.index + m[0].length;
    }

    if (cursor === 0) return html; // No replacements
    parts.push(html.slice(cursor));
    return parts.join("");
}

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

                // Fetch bot info (username, id) — required for ctx.me in all modes.
                // Without this, hasBotMention() and isReplyToBot() fail in webhook mode.
                await bot.init();

                // Pre-load tenant config
                await this.loadTenantConfig(conn.tenantId);

                // Handle /start command
                bot.command("start", async (ctx) => {
                    try {
                        await this.handleStartCommand(ctx, conn);
                    } catch (err) {
                        logger.error({ err, tenantId: conn.tenantId }, "Error handling /start command");
                    }
                });

                // Handle /pair command
                bot.command("pair", async (ctx) => {
                    try {
                        await this.handlePairCommand(ctx, conn);
                    } catch (err) {
                        logger.error({ err, tenantId: conn.tenantId }, "Error handling /pair command");
                    }
                });

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

        // Intercept bot commands that arrive via mention (e.g. "@bot /pair")
        const handled = await this.handleBotCommand(ctx, conn, content.trim());
        if (handled) return;

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

        // Intercept bot commands in DMs too
        const handled = await this.handleBotCommand(ctx, conn, (ctx.message!.text ?? "").trim());
        if (handled) return;

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

    /**
     * Unified command handler — catches /start, /pair, /help regardless of
     * whether they arrive as native Telegram commands or via mention stripping.
     * Returns true if the command was handled (caller should stop processing).
     */
    private async handleBotCommand(
        ctx: Context,
        conn: ChannelConnectionConfig,
        text: string
    ): Promise<boolean> {
        // Extract command: "/pair@botname" or "/pair" or "/pair arg1 arg2"
        const match = text.match(/^\/(\w+)(?:@\S+)?\s*$/);
        if (!match) return false;

        const cmd = match[1].toLowerCase();

        switch (cmd) {
            case "start":
                await this.handleStartCommand(ctx, conn);
                return true;
            case "pair":
                await this.handlePairCommand(ctx, conn);
                return true;
            case "help":
                await ctx.reply(
                    "Available commands:\n" +
                    "/start — Start the bot\n" +
                    "/pair — Get a pairing code (DM only)\n" +
                    "/help — Show this message\n\n" +
                    "Or just send me a message and I'll respond!"
                );
                return true;
            default:
                return false;
        }
    }

    private async handleStartCommand(ctx: Context, conn: ChannelConnectionConfig): Promise<void> {
        if (isGroupChat(ctx)) {
            // In groups, just send a brief intro — don't trigger pairing
            await ctx.reply("Hello! Mention me or reply to my messages and I'll help you out.");
            return;
        }

        // In DMs, trigger the pairing flow if policy requires it
        const tenantConfig = await this.loadTenantConfig(conn.tenantId);
        const dmPolicy = tenantConfig.telegram_dm_policy ?? "open";

        if (dmPolicy === "disabled") {
            await ctx.reply("DMs are currently disabled. Please contact the administrator.");
            return;
        }

        if (dmPolicy === "pairing") {
            const contactId = ctx.from!.id.toString();
            const contactName = ctx.from!.first_name + (ctx.from!.last_name ? ` ${ctx.from!.last_name}` : "");
            const accessStatus = await checkDmAccess(conn.tenantId, contactId);

            if (accessStatus === "blocked") {
                await ctx.reply("Access denied. Please contact the administrator.");
                return;
            }

            if (accessStatus === "approved") {
                await ctx.reply("You're already paired! Go ahead and send me a message.");
                return;
            }

            const code = await getOrCreatePairingCode(conn.tenantId, contactId, contactName);
            await ctx.reply(
                `Welcome! To start chatting, share this pairing code with your administrator:\n\n` +
                `🔑 *${code}*\n\n` +
                `Once approved, you can send me messages directly. This code expires in 1 hour.`,
                { parse_mode: "Markdown" }
            );
            return;
        }

        // Open policy — just greet
        await ctx.reply("Hello! I'm your AI assistant. How can I help you?");
    }

    private async handlePairCommand(ctx: Context, conn: ChannelConnectionConfig): Promise<void> {
        if (isGroupChat(ctx)) {
            await ctx.reply("Pairing is only available in direct messages. Send me a DM to pair.");
            return;
        }

        // In DMs, same as /start pairing flow
        const tenantConfig = await this.loadTenantConfig(conn.tenantId);
        const dmPolicy = tenantConfig.telegram_dm_policy ?? "open";

        if (dmPolicy !== "pairing") {
            await ctx.reply("Pairing is not required — you can message me directly!");
            return;
        }

        const contactId = ctx.from!.id.toString();
        const contactName = ctx.from!.first_name + (ctx.from!.last_name ? ` ${ctx.from!.last_name}` : "");
        const accessStatus = await checkDmAccess(conn.tenantId, contactId);

        if (accessStatus === "blocked") {
            await ctx.reply("Access denied. Please contact the administrator.");
            return;
        }

        if (accessStatus === "approved") {
            await ctx.reply("You're already paired! Go ahead and send me a message.");
            return;
        }

        const code = await getOrCreatePairingCode(conn.tenantId, contactId, contactName);
        await ctx.reply(
            `Here's your pairing code:\n\n` +
            `🔑 *${code}*\n\n` +
            `Share this with your administrator. Once approved, you can chat with me. Expires in 1 hour.`,
            { parse_mode: "Markdown" }
        );
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

        // Convert standard Markdown to Telegram HTML for proper formatting
        let content = msg.content;
        let isHtml = false;
        if (msg.format === "markdown") {
            content = this.markdownToTelegramHtml(content);
            isHtml = true;
        }

        // Split into chunks respecting Telegram's 4096-char limit
        const chunks = isHtml
            ? chunkHtmlMessage(content, 4096)
            : chunkMessage(content, 4096);

        let lastMessageId = "";

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const opts: Record<string, any> = {};

            if (isHtml) opts.parse_mode = "HTML";

            // Only first chunk gets reply_to_message_id
            if (i === 0 && msg.replyToMessageId) {
                opts.reply_to_message_id = parseInt(msg.replyToMessageId, 10);
            }

            try {
                const sent = await bot.api.sendMessage(msg.channelContactId, chunk, opts);
                lastMessageId = sent.message_id.toString();
            } catch (err: any) {
                // If HTML parsing fails, retry this chunk as plain text
                if (isHtml && err?.error_code === 400) {
                    logger.warn({ err: err.message, chunkIdx: i }, "Telegram rejected HTML chunk, retrying as plain text");
                    const plainChunk = isHtml ? this.stripHtmlTags(chunk) : chunk;
                    const sent = await bot.api.sendMessage(msg.channelContactId, plainChunk, {
                        reply_to_message_id: i === 0 && msg.replyToMessageId
                            ? parseInt(msg.replyToMessageId, 10)
                            : undefined,
                    });
                    lastMessageId = sent.message_id.toString();
                } else {
                    throw err;
                }
            }

            // 100ms delay between chunks to avoid rate limits
            if (i < chunks.length - 1) {
                await new Promise((r) => setTimeout(r, 100));
            }
        }

        return { channelMessageId: lastMessageId };
    }

    private stripHtmlTags(html: string): string {
        return html
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">");
    }

    /**
     * Convert standard Markdown (from LLM output) to Telegram HTML.
     * Telegram HTML supports: <b>, <i>, <s>, <code>, <pre>, <a href="">.
     */
    formatResponse(content: string): string {
        return this.markdownToTelegramHtml(content);
    }

    formatIR(ir: MessageIR): string {
        const html = renderTelegramHtml(ir);
        return wrapFileReferences(html);
    }

    private markdownToTelegramHtml(text: string): string {
        let result = text;

        // 1. Escape HTML entities (before we add our own tags)
        result = result.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        // 2. Code blocks (```lang\n...\n```) — protect content inside
        result = result.replace(/```(?:\w*)\n?([\s\S]*?)```/g, (_, code) => `<pre>${code.trim()}</pre>`);

        // 2.5. Markdown tables → monospace <pre> blocks
        // Detects consecutive lines starting with | and converts to aligned code block
        result = result.replace(
            /(?:^|\n)((?:\|[^\n]+\|\n?)+)/g,
            (match) => {
                const lines = match.trim().split("\n").filter(l => l.trim());
                // Skip separator rows (|---|---|) and parse data
                const dataLines = lines.filter(l => !/^\|[\s:]*[-]+/.test(l));
                if (dataLines.length === 0) return match;

                // Parse cells from each row
                const rows = dataLines.map(line =>
                    line.split("|").slice(1, -1).map(c => c.trim())
                );
                if (rows.length === 0 || rows[0].length === 0) return match;

                // Calculate max width per column
                const colCount = Math.max(...rows.map(r => r.length));
                const widths: number[] = [];
                for (let c = 0; c < colCount; c++) {
                    widths[c] = Math.max(...rows.map(r => (r[c] || "").length), 1);
                }

                // Build aligned monospace table
                const formatted = rows.map((row, i) => {
                    const cells = [];
                    for (let c = 0; c < colCount; c++) {
                        const val = row[c] || "";
                        cells.push(val.padEnd(widths[c]));
                    }
                    const line = "| " + cells.join(" | ") + " |";
                    // Add separator after header row
                    if (i === 0) {
                        const sep = "| " + widths.map(w => "-".repeat(w)).join(" | ") + " |";
                        return line + "\n" + sep;
                    }
                    return line;
                });

                return "\n<pre>" + formatted.join("\n") + "</pre>\n";
            }
        );

        // 3. Inline code (`...`)
        result = result.replace(/`([^`]+)`/g, "<code>$1</code>");

        // 4. Bold: **text** → <b>text</b>  (before italic)
        result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

        // 5. Italic: *text* → <i>text</i>
        result = result.replace(/\*(.+?)\*/g, "<i>$1</i>");

        // 6. Strikethrough: ~~text~~ → <s>text</s>
        result = result.replace(/~~(.+?)~~/g, "<s>$1</s>");

        // 7. Links: [text](url) → <a href="url">text</a>
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

        // 8. Wrap file references to prevent Telegram auto-linking
        result = wrapFileReferences(result);

        return result;
    }

    /**
     * Edit an existing message in a Telegram chat.
     * Used for progressive streaming updates.
     * Silently ignores "message is not modified" errors.
     */
    async editMessage(
        tenantId: string,
        chatId: string,
        messageId: string,
        content: string,
        parseMode?: string
    ): Promise<void> {
        const bot = this.activeBots.get(tenantId);
        if (!bot) return;

        // If parseMode is "markdown", convert to HTML
        let text = content;
        let mode: string | undefined;
        if (parseMode === "markdown") {
            text = this.markdownToTelegramHtml(content);
            mode = "HTML";
        } else if (parseMode === "HTML") {
            mode = "HTML";
        }

        try {
            await bot.api.editMessageText(chatId, parseInt(messageId, 10), text, {
                parse_mode: mode as any,
            });
        } catch (err: any) {
            // Silently ignore "message is not modified" (Telegram error 400)
            if (err?.error_code === 400 && err?.description?.includes("not modified")) {
                return;
            }
            // If HTML fails, try plain text
            if (mode && err?.error_code === 400) {
                try {
                    await bot.api.editMessageText(chatId, parseInt(messageId, 10), this.stripHtmlTags(text));
                } catch {
                    // Ignore fallback errors too
                }
                return;
            }
            logger.warn({ err: err.message, chatId, messageId }, "Failed to edit message");
        }
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
