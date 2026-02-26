import { Context } from "grammy";

/**
 * Check if the chat is a group or supergroup.
 */
export function isGroupChat(ctx: Context): boolean {
    const chatType = ctx.chat?.type;
    return chatType === "group" || chatType === "supergroup";
}

/**
 * Check if the bot was @mentioned in the message text entities.
 */
export function hasBotMention(ctx: Context): boolean {
    const entities = ctx.message?.entities ?? [];
    const botUsername = ctx.me?.username?.toLowerCase();
    if (!botUsername) return false;

    for (const entity of entities) {
        if (entity.type === "mention") {
            const mentionText = ctx.message?.text?.substring(
                entity.offset,
                entity.offset + entity.length
            );
            if (mentionText?.toLowerCase() === `@${botUsername}`) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Check if the message is a reply to one of the bot's own messages.
 */
export function isReplyToBot(ctx: Context): boolean {
    const replyTo = ctx.message?.reply_to_message;
    if (!replyTo?.from) return false;
    return replyTo.from.id === ctx.me.id;
}

/**
 * Strip the @botusername mention from the message text.
 */
export function stripBotMention(text: string, botUsername: string): string {
    const regex = new RegExp(`@${botUsername}\\b`, "gi");
    return text.replace(regex, "").trim();
}
