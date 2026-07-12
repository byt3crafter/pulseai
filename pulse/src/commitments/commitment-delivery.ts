/**
 * Due-commitment delivery — runs on a timer from the cron scheduler.
 * Behaviour per the tenant's commitments.deliveryMode setting:
 *   internal — nothing sent (agents review via commitment_list)
 *   owner    — a plain reminder to the configured owner contact (Telegram)
 *   channel  — the agent crafts a natural check-in and it's sent to the
 *              original conversation's channel
 * Telegram-only for now. Guarded by maxPerDay (per run) so it can't flood.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../storage/db.js";
import { tenants, channelConnections } from "../storage/schema.js";
import { decrypt } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";
import { parseCommitmentsConfig, getDueCommitments, setCommitmentStatus } from "./commitment-service.js";
import { getJobRunnerRuntime } from "../cron/job-runner.js";

async function telegramBotToken(tenantId: string): Promise<string | null> {
    const conn = await db.query.channelConnections.findFirst({
        where: and(eq(channelConnections.tenantId, tenantId), eq(channelConnections.channelType, "telegram")),
    });
    const raw = (conn?.channelConfig as any)?.botToken;
    if (!raw) return null;
    try { return decrypt(raw); } catch { return null; }
}

async function sendTelegramText(botToken: string, chatId: string, text: string): Promise<boolean> {
    try {
        const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text }),
        });
        return r.ok;
    } catch {
        return false;
    }
}

/** Run the agent to write a natural check-in; null if it opts out (HEARTBEAT_OK). */
async function craftCheckIn(tenantId: string, agentId: string | null, conversationId: string | null, summary: string): Promise<string | null> {
    const runtime = getJobRunnerRuntime();
    if (!runtime || !agentId) return null;
    let out = "";
    const inbound = {
        id: `commit-${Date.now()}`,
        tenantId,
        agentProfileId: agentId,
        channelType: "heartbeat" as const,
        channelContactId: `commit-${conversationId || agentId}`,
        contactName: "Commitment",
        content:
            `A follow-up you committed to is now due:\n"${summary}"\n\n` +
            `Write ONE short, natural check-in message to send to the customer about this. ` +
            `Don't mention that it's a reminder or a system note. If there is genuinely nothing useful to send, reply with exactly HEARTBEAT_OK.`,
        receivedAt: new Date(),
    };
    try {
        await runtime.processMessage(inbound, async (m: any) => {
            out = m.content || "";
            return { channelMessageId: `commit-${Date.now()}` };
        });
    } catch (e) {
        logger.warn({ err: e, tenantId }, "commitment check-in craft failed");
        return null;
    }
    const t = out.trim();
    if (!t || /HEARTBEAT_OK/i.test(t)) return null;
    return t;
}

export async function deliverDueCommitments(): Promise<void> {
    try {
        const allTenants = await db.select({ id: tenants.id, config: tenants.config }).from(tenants);
        for (const t of allTenants) {
            const cfg = parseCommitmentsConfig(t.config);
            if (!cfg.enabled || cfg.deliveryMode === "internal") continue;

            const due = await getDueCommitments(t.id);
            if (!due.length) continue;
            const botToken = await telegramBotToken(t.id);
            let sent = 0;

            for (const c of due) {
                if (sent >= cfg.maxPerDay) break;
                try {
                    if (cfg.deliveryMode === "owner") {
                        if (botToken && cfg.ownerContact) {
                            await sendTelegramText(botToken, cfg.ownerContact, `⏰ Follow-up due: ${c.summary}`);
                        }
                        await setCommitmentStatus(t.id, c.id, "delivered");
                        sent++;
                    } else if (c.channelType === "telegram" && c.channelContactId && botToken) {
                        const msg = await craftCheckIn(t.id, c.agentId, c.conversationId, c.summary);
                        if (msg) await sendTelegramText(botToken, c.channelContactId, msg);
                        await setCommitmentStatus(t.id, c.id, "delivered");
                        sent++;
                    } else {
                        // Not deliverable on this channel — mark handled so it doesn't loop.
                        await setCommitmentStatus(t.id, c.id, "delivered");
                    }
                } catch (e) {
                    logger.warn({ err: e, commitmentId: c.id }, "commitment delivery failed");
                }
            }
            if (sent) logger.info({ tenantId: t.id, sent, mode: cfg.deliveryMode }, "Delivered due commitments");
        }
    } catch (err) {
        logger.error({ err }, "deliverDueCommitments failed");
    }
}
