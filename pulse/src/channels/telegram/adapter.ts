import { Bot, Context } from "grammy";
import { ChannelAdapter, ChannelConnectionConfig } from "../channel.interface.js";
import { InboundMessage, OutboundMessage } from "../types.js";
import { logger } from "../../utils/logger.js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { decrypt } from "../../utils/crypto.js";
import { config } from "../../config.js";
import { enqueueMessage, messageQueue } from "../../queue/message-queue.js";
import { isGroupChat, hasBotMention, isReplyToBot, stripBotMention } from "./group-helpers.js";
import { checkDmAccess, getOrCreatePairingCode } from "./pairing.js";
import { chunkHtmlMessage, chunkMessage } from "./chunking.js";
import { markdownToIR, renderTelegramHtml } from "../formatting/index.js";
import type { MessageIR } from "../formatting/ir.js";
import { db } from "../../storage/db.js";
import { tenants, allowlists, channelConnections } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { selectConnectionId, type BotCandidate } from "./bot-selector.js";

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
    // Photo understanding (vision) — default ON. When off, inbound photos are
    // never downloaded; the agent is told a photo arrived but it can't see it.
    telegram_vision_enabled?: boolean;
    [key: string]: unknown;
}

interface BotEntry {
    bot: Bot<Context>;
    conn: ChannelConnectionConfig;
}

export class TelegramAdapter implements ChannelAdapter {
    readonly channelType = "telegram";

    // Maps a channel_connections.id to its running grammY Bot instance.
    // A tenant can have more than one entry here — one bot per agent, plus
    // optionally the tenant-wide "default" bot from Settings → Telegram.
    public activeBots: Map<string, BotEntry> = new Map();
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
            await this.loadBot(conn);
        }
    }

    /** Build a grammY bot for one connection, wire handlers, and register it. Reusable
     *  by initialize() (boot) and handleWebhookUpdate() (lazy, for bots added after boot). */
    private async loadBot(conn: ChannelConnectionConfig): Promise<Bot<Context> | null> {
        if (!conn.id) {
            logger.warn({ tenantId: conn.tenantId }, "Telegram connection missing id — cannot register bot");
            return null;
        }

        const { botToken: rawBotToken } = conn.channelConfig;
        if (!rawBotToken) {
            logger.warn({ tenantId: conn.tenantId }, "Missing botToken for telegram connection");
            return null;
        }

        let botToken: string;
        try {
            botToken = decrypt(rawBotToken);
        } catch {
            logger.warn({ tenantId: conn.tenantId }, "Failed to decrypt botToken for telegram connection");
            return null;
        }

        try {
            const bot = new Bot(botToken);
            // Fetch bot info (username, id) — required for ctx.me in all modes.
            await bot.init();
            await this.loadTenantConfig(conn.tenantId);

            bot.command("start", async (ctx) => {
                try { await this.handleStartCommand(ctx, conn); }
                catch (err) { logger.error({ err, tenantId: conn.tenantId }, "Error handling /start command"); }
            });
            bot.command("pair", async (ctx) => {
                try { await this.handlePairCommand(ctx, conn); }
                catch (err) { logger.error({ err, tenantId: conn.tenantId }, "Error handling /pair command"); }
            });
            bot.on("message:text", async (ctx) => {
                try { await this.handleTextMessage(ctx, conn); }
                catch (err) { logger.error({ err, tenantId: conn.tenantId }, "Error handling text message"); }
            });
            bot.on("message:photo", async (ctx) => {
                try { await this.handlePhotoMessage(ctx, conn, botToken); }
                catch (err) { logger.error({ err, tenantId: conn.tenantId }, "Error handling photo message"); }
            });

            if (process.env.NODE_ENV === "development") {
                bot.start().catch((err) => logger.error({ err, tenantId: conn.tenantId }, "Failed to start TG polling"));
            }

            this.activeBots.set(conn.id, { bot, conn });
            logger.info({ tenantId: conn.tenantId, connectionId: conn.id, agentProfileId: conn.agentProfileId ?? undefined }, "Telegram bot initialized");
            return bot;
        } catch (err) {
            logger.error({ err, tenantId: conn.tenantId }, "Failed to initialize Telegram connection");
            return null;
        }
    }

    /**
     * Build the candidate list for a tenant's active bots and resolve which
     * connection's bot should handle a send/edit. Non-agent-scoped ("default")
     * connections are those whose channelConfig.scope !== "agent" — i.e. the
     * tenant-wide bot connected via Settings → Telegram.
     */
    private pickBotEntry(tenantId: string, agentProfileId?: string | null): BotEntry | undefined {
        const entriesForTenant = new Map<string, BotEntry>();
        const candidates: BotCandidate[] = [];

        for (const [connectionId, entry] of this.activeBots) {
            if (entry.conn.tenantId !== tenantId) continue;
            entriesForTenant.set(connectionId, entry);
            candidates.push({
                id: connectionId,
                agentProfileId: entry.conn.agentProfileId,
                isDefault: (entry.conn.channelConfig as any)?.scope !== "agent",
            });
        }

        const chosenId = selectConnectionId(candidates, agentProfileId);
        return chosenId ? entriesForTenant.get(chosenId) : undefined;
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

    /** Same routing as handleTextMessage, but for inbound photos (message:photo). */
    private async handlePhotoMessage(ctx: Context, conn: ChannelConnectionConfig, botToken: string): Promise<void> {
        const tenantConfig = await this.loadTenantConfig(conn.tenantId);
        const isGroup = isGroupChat(ctx);

        if (isGroup) {
            await this.handleGroupMessage(ctx, conn, tenantConfig, botToken);
        } else {
            await this.handleDmMessage(ctx, conn, tenantConfig, botToken);
        }
    }

    /**
     * Download the largest size of an inbound Telegram photo via the Bot API
     * getFile call, and save it into the agent's workspace so the runtime can
     * hand it to a vision-capable provider. Returns undefined (never throws)
     * on any failure — a photo the agent can't see should degrade to a text
     * note, not break the whole message.
     */
    private async downloadPhotoAttachment(
        ctx: Context,
        conn: ChannelConnectionConfig,
        botToken: string
    ): Promise<InboundMessage["attachments"] | undefined> {
        try {
            const file = await ctx.getFile(); // grammY picks the largest photo size automatically
            if (!file.file_path) return undefined;

            const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
            const res = await fetch(fileUrl);
            if (!res.ok) {
                logger.warn({ tenantId: conn.tenantId, status: res.status }, "Failed to download Telegram photo from Bot API");
                return undefined;
            }
            const buf = Buffer.from(await res.arrayBuffer());

            const dir = join(config.WORKSPACE_BASE_DIR, conn.tenantId, conn.agentProfileId || "inbox", "inbound");
            await mkdir(dir, { recursive: true });
            const filePath = join(dir, `photo-${Date.now()}.jpg`);
            await writeFile(filePath, buf);

            return [{ type: "image", path: filePath, mime: "image/jpeg" }];
        } catch (err) {
            logger.warn({ err, tenantId: conn.tenantId }, "Error downloading Telegram photo (non-fatal)");
            return undefined;
        }
    }

    private async handleGroupMessage(
        ctx: Context,
        conn: ChannelConnectionConfig,
        tenantConfig: TenantConfig,
        botToken?: string
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

        const isPhoto = !!botToken;
        let content: string;
        let attachments: InboundMessage["attachments"];

        if (isPhoto) {
            // Strip bot mention from the caption (photos have no .text, only .caption)
            let caption = ctx.message!.caption ?? "";
            if (mentioned && ctx.me?.username) {
                caption = stripBotMention(caption, ctx.me.username);
            }
            const visionEnabled = tenantConfig.telegram_vision_enabled ?? true;
            if (visionEnabled) {
                attachments = await this.downloadPhotoAttachment(ctx, conn, botToken!);
            }
            content = attachments
                ? (caption.trim() || "[photo]")
                : `${caption.trim() ? caption.trim() + "\n\n" : ""}[The user sent a photo — this model cannot view images]`;
        } else {
            // Strip bot mention from content
            content = ctx.message!.text ?? "";
            if (mentioned && ctx.me?.username) {
                content = stripBotMention(content, ctx.me.username);
            }

            // Intercept bot commands that arrive via mention (e.g. "@bot /pair") — text only
            const handled = await this.handleBotCommand(ctx, conn, content.trim());
            if (handled) return;
        }

        const inbound: InboundMessage = {
            id: randomUUID(),
            tenantId: conn.tenantId,
            agentProfileId: conn.agentProfileId || undefined,
            channelType: "telegram",
            channelContactId: groupChatId,
            contactName: (ctx.chat as any)?.title || "Group",
            content,
            attachments,
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
        tenantConfig: TenantConfig,
        botToken?: string
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

        const isPhoto = !!botToken;
        let content: string;
        let attachments: InboundMessage["attachments"];

        if (isPhoto) {
            const caption = (ctx.message!.caption ?? "").trim();
            const visionEnabled = tenantConfig.telegram_vision_enabled ?? true;
            if (visionEnabled) {
                attachments = await this.downloadPhotoAttachment(ctx, conn, botToken!);
            }
            content = attachments
                ? (caption || "[photo]")
                : `${caption ? caption + "\n\n" : ""}[The user sent a photo — this model cannot view images]`;
        } else {
            // Intercept bot commands in DMs too
            const handled = await this.handleBotCommand(ctx, conn, (ctx.message!.text ?? "").trim());
            if (handled) return;

            content = ctx.message!.text ?? "";
        }

        const inbound: InboundMessage = {
            id: randomUUID(),
            tenantId: conn.tenantId,
            agentProfileId: conn.agentProfileId || undefined,
            channelType: "telegram",
            channelContactId: contactId,
            contactName,
            content,
            attachments,
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
        for (const [connectionId, entry] of this.activeBots.entries()) {
            await entry.bot.stop();
            logger.info({ tenantId: entry.conn.tenantId, connectionId }, "Telegram bot connection stopped");
        }
        this.activeBots.clear();
        this.tenantConfigs.clear();
    }

    onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    async sendMessage(msg: OutboundMessage): Promise<{ channelMessageId: string }> {
        const entry = this.pickBotEntry(msg.tenantId, msg.agentProfileId);
        if (!entry) throw new Error("Bot not found for this tenant");
        const bot = entry.bot;

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
        parseMode?: string,
        agentProfileId?: string
    ): Promise<void> {
        const entry = this.pickBotEntry(tenantId, agentProfileId);
        if (!entry) return;
        const bot = entry.bot;

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
     * Handle webhook updates from Telegram.
     * Called by the webhook route. `connectionId` is present when the webhook
     * URL was registered for a specific per-agent bot
     * (`/webhooks/telegram/:tenantSlug/:connectionId`); omitted for the
     * legacy/default tenant-wide bot URL (`/webhooks/telegram/:tenantSlug`).
     */
    async handleWebhookUpdate(tenantId: string, update: any, connectionId?: string): Promise<void> {
        let entry = connectionId ? this.activeBots.get(connectionId) : this.pickBotEntry(tenantId);
        // Guard against a connectionId belonging to a different tenant (defense
        // in depth — the route already scopes the DB lookup below by tenant).
        if (entry && entry.conn.tenantId !== tenantId) entry = undefined;

        if (!entry) {
            // Lazy-load: the bot may have been connected after the gateway booted.
            logger.info({ tenantId, connectionId }, "Telegram bot not loaded — lazy-loading from DB");
            const baseWhere = [
                eq(channelConnections.tenantId, tenantId),
                eq(channelConnections.channelType, "telegram"),
                eq(channelConnections.status, "active"),
            ];

            let conn: any;
            if (connectionId) {
                [conn] = await db.select().from(channelConnections)
                    .where(and(eq(channelConnections.id, connectionId), ...baseWhere)).limit(1);
            } else {
                const rows = await db.select().from(channelConnections).where(and(...baseWhere));
                conn = rows.find((r) => (r.channelConfig as any)?.scope !== "agent") ?? rows[0];
            }

            if (conn) {
                await this.loadBot({
                    id: conn.id,
                    tenantId: conn.tenantId,
                    agentProfileId: conn.agentProfileId,
                    channelType: "telegram",
                    channelConfig: conn.channelConfig as any,
                });
                entry = this.activeBots.get(conn.id);
            }

            if (!entry) {
                logger.warn({ tenantId, connectionId }, "Bot not found for tenant in webhook handler");
                return;
            }
        }

        try {
            // Process the update using grammY's handleUpdate method
            await entry.bot.handleUpdate(update);
        } catch (err) {
            logger.error({ err, tenantId, connectionId }, "Failed to handle webhook update");
            throw err;
        }
    }

    /**
     * Get webhook info for a specific bot connection.
     * Useful for debugging webhook configuration.
     */
    async getWebhookInfo(connectionId: string): Promise<any> {
        const entry = this.activeBots.get(connectionId);
        if (!entry) {
            throw new Error("Bot not found for connection");
        }

        return await entry.bot.api.getWebhookInfo();
    }
}
