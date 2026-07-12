/**
 * Best-effort delivery of a file (screenshot, fetched image, generated image)
 * to the conversation's channel, so the user SEES it instead of a path.
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
import { db } from "../storage/db.js";
import { conversations, channelConnections } from "../storage/schema.js";
import { decrypt } from "./crypto.js";
import { logger } from "./logger.js";

export async function sendFileToConversation(
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
        const ext = (filePath.split(".").pop() || "").toLowerCase();

        const AUDIO_MIME: Record<string, string> = {
            mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg",
        };

        const form = new FormData();
        form.append("chat_id", conversation.channelContactId);
        if (caption) form.append("caption", caption.slice(0, 1024));

        let method: string;
        if (AUDIO_MIME[ext]) {
            // Audio → play inline in Telegram (sendVoice for ogg/opus, sendAudio otherwise).
            method = ext === "ogg" || ext === "oga" ? "sendVoice" : "sendAudio";
            const field = method === "sendVoice" ? "voice" : "audio";
            form.append(field, new Blob([new Uint8Array(bytes)], { type: AUDIO_MIME[ext] }), basename(filePath));
        } else {
            // Image → sendDocument, not sendPhoto: Telegram recompresses photos to
            // lossy JPEG (~1280px), wrecking text in screenshots. Documents keep the
            // original and still render an inline preview.
            const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
                : ext === "webp" ? "image/webp"
                : ext === "gif" ? "image/gif"
                : "image/png";
            method = "sendDocument";
            form.append("document", new Blob([new Uint8Array(bytes)], { type: mime }), basename(filePath));
        }

        const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
            method: "POST",
            body: form,
        });
        if (!res.ok) {
            logger.warn({ tenantId, status: res.status, method }, "Telegram file delivery failed");
            return { delivered: false };
        }
        return { delivered: true, channel: "telegram" };
    } catch (err) {
        logger.warn({ err, tenantId }, "Screenshot channel delivery errored (non-fatal)");
        return { delivered: false };
    }
}
