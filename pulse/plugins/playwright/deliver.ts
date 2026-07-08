/**
 * Best-effort delivery of a screenshot to the conversation's channel, so the
 * user SEES the image instead of receiving a container file path.
 *
 * Telegram only for now: looks up the conversation → if it's a telegram chat,
 * decrypts the tenant's bot token (same storage the adapter uses) and calls
 * the Bot API sendPhoto directly with multipart form data (Node 20 global
 * fetch/FormData/Blob — no extra deps, no coupling to the adapter instance).
 * Any failure is swallowed and reported back as delivered:false — delivery is
 * an enhancement, never a reason to fail the screenshot itself.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/storage/db.js";
import { conversations, channelConnections } from "../../src/storage/schema.js";
import { decrypt } from "../../src/utils/crypto.js";
import { logger } from "../../src/utils/logger.js";

export async function deliverScreenshotToChannel(
    tenantId: string,
    conversationId: string | undefined,
    filePath: string,
    caption: string,
): Promise<{ delivered: boolean; channel?: string }> {
    try {
        if (!conversationId) return { delivered: false };

        const conversation = await db.query.conversations.findFirst({
            where: and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)),
        });
        if (!conversation || conversation.channelType !== "telegram") return { delivered: false };

        const conn = await db.query.channelConnections.findFirst({
            where: and(
                eq(channelConnections.tenantId, tenantId),
                eq(channelConnections.channelType, "telegram"),
            ),
        });
        const rawToken = (conn?.channelConfig as Record<string, any> | undefined)?.botToken;
        if (!rawToken) return { delivered: false };

        let botToken: string;
        try {
            botToken = decrypt(rawToken);
        } catch {
            return { delivered: false };
        }

        const bytes = await readFile(filePath);
        const form = new FormData();
        form.append("chat_id", conversation.channelContactId);
        form.append("caption", caption.slice(0, 1024));
        // sendDocument, not sendPhoto: Telegram recompresses photos to lossy
        // JPEG (~1280px), which wrecks text in screenshots. Documents are
        // delivered as the original PNG and still render an inline preview.
        form.append("document", new Blob([new Uint8Array(bytes)], { type: "image/png" }), basename(filePath));

        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
            method: "POST",
            body: form,
        });
        if (!res.ok) {
            logger.warn({ tenantId, status: res.status }, "Screenshot Telegram delivery failed");
            return { delivered: false };
        }
        return { delivered: true, channel: "telegram" };
    } catch (err) {
        logger.warn({ err, tenantId }, "Screenshot channel delivery errored (non-fatal)");
        return { delivered: false };
    }
}
