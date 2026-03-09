/**
 * Email Service — SMTP/IMAP operations for agent email tools.
 *
 * Resolution chain for email config:
 * 1. Agent-level email config (agentProfiles.emailConfig) — if set
 * 2. Tenant-level email config (channelConnections where channelType='email') — fallback
 *
 * Supports sending via SMTP (nodemailer) and reading via IMAP (imapflow).
 */

import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { db } from "../../storage/db.js";
import { agentProfiles, channelConnections } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { decrypt } from "../../utils/crypto.js";
import { logger } from "../../utils/logger.js";

export interface SmtpConfig {
    host: string;
    port: number;
    username: string;
    password: string; // plaintext (decrypted at resolve time)
    tls: boolean;
    fromAddress: string;
}

export interface ImapConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    tls: boolean;
}

export interface EmailConfig {
    smtp?: SmtpConfig;
    imap?: ImapConfig;
}

/**
 * Resolve email configuration for an agent.
 * Agent-level overrides take priority over tenant-level config.
 */
export async function resolveEmailConfig(
    tenantId: string,
    agentProfileId: string
): Promise<EmailConfig | null> {
    // 1. Check agent-level email config
    try {
        const profile = await db.query.agentProfiles.findFirst({
            where: eq(agentProfiles.id, agentProfileId),
        });

        const agentEmailCfg = profile?.emailConfig as any;
        if (agentEmailCfg?.smtp?.host) {
            const config: EmailConfig = {};

            if (agentEmailCfg.smtp) {
                config.smtp = {
                    ...agentEmailCfg.smtp,
                    password: agentEmailCfg.smtp.encryptedPassword
                        ? decrypt(agentEmailCfg.smtp.encryptedPassword)
                        : agentEmailCfg.smtp.password || "",
                };
            }
            if (agentEmailCfg.imap) {
                config.imap = {
                    ...agentEmailCfg.imap,
                    password: agentEmailCfg.imap.encryptedPassword
                        ? decrypt(agentEmailCfg.imap.encryptedPassword)
                        : agentEmailCfg.imap.password || "",
                };
            }
            return config;
        }
    } catch (err) {
        logger.warn({ err, agentProfileId }, "Failed to load agent email config");
    }

    // 2. Fallback to tenant-level email connection
    try {
        const conn = await db.query.channelConnections.findFirst({
            where: and(
                eq(channelConnections.tenantId, tenantId),
                eq(channelConnections.channelType, "email")
            ),
        });

        if (!conn) return null;

        const connConfig = conn.channelConfig as any;
        if (!connConfig?.smtp?.host) return null;

        const config: EmailConfig = {};

        if (connConfig.smtp) {
            config.smtp = {
                ...connConfig.smtp,
                password: connConfig.smtp.encryptedPassword
                    ? decrypt(connConfig.smtp.encryptedPassword)
                    : connConfig.smtp.password || "",
            };
        }
        if (connConfig.imap) {
            config.imap = {
                ...connConfig.imap,
                password: connConfig.imap.encryptedPassword
                    ? decrypt(connConfig.imap.encryptedPassword)
                    : connConfig.imap.password || "",
            };
        }
        return config;
    } catch (err) {
        logger.warn({ err, tenantId }, "Failed to load tenant email config");
    }

    return null;
}

/**
 * Send an email via SMTP.
 */
export async function sendEmail(
    config: SmtpConfig,
    to: string,
    subject: string,
    body: string,
    html?: string
): Promise<{ messageId: string }> {
    const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.tls,
        auth: {
            user: config.username,
            pass: config.password,
        },
    });

    const info = await transporter.sendMail({
        from: config.fromAddress,
        to,
        subject,
        text: body,
        html: html || undefined,
    });

    return { messageId: info.messageId };
}

/**
 * Read recent emails via IMAP.
 */
export async function readEmails(
    config: ImapConfig,
    count: number = 10
): Promise<Array<{ uid: number; from: string; subject: string; date: string; snippet: string }>> {
    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.tls,
        auth: {
            user: config.username,
            pass: config.password,
        },
        logger: false,
    });

    const emails: Array<{ uid: number; from: string; subject: string; date: string; snippet: string }> = [];

    try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");

        try {
            // Get the last N messages
            const mailbox = client.mailbox;
            const totalMessages = mailbox && typeof mailbox === "object" && "exists" in mailbox ? (mailbox as any).exists : 0;
            if (totalMessages === 0) return emails;

            const startSeq = Math.max(1, totalMessages - count + 1);
            const range = `${startSeq}:*`;

            for await (const message of client.fetch(range, {
                envelope: true,
                source: false,
                bodyStructure: true,
            })) {
                const envelope = message.envelope;
                if (!envelope) continue;
                emails.push({
                    uid: message.uid,
                    from: envelope.from?.[0]?.address || "unknown",
                    subject: envelope.subject || "(no subject)",
                    date: envelope.date?.toISOString() || "",
                    snippet: `From: ${envelope.from?.[0]?.name || envelope.from?.[0]?.address || "unknown"}`,
                });
            }
        } finally {
            lock.release();
        }
        await client.logout();
    } catch (err) {
        await client.logout().catch(() => {});
        throw err;
    }

    return emails.reverse(); // Most recent first
}

/**
 * Test SMTP and/or IMAP connection.
 */
export async function testConnection(config: EmailConfig): Promise<{ smtp: boolean; imap: boolean; error?: string }> {
    const result = { smtp: false, imap: false, error: undefined as string | undefined };

    // Test SMTP
    if (config.smtp) {
        try {
            const transporter = nodemailer.createTransport({
                host: config.smtp.host,
                port: config.smtp.port,
                secure: config.smtp.tls,
                auth: {
                    user: config.smtp.username,
                    pass: config.smtp.password,
                },
            });
            await transporter.verify();
            result.smtp = true;
        } catch (err: any) {
            result.error = `SMTP: ${err.message}`;
        }
    }

    // Test IMAP
    if (config.imap) {
        const client = new ImapFlow({
            host: config.imap.host,
            port: config.imap.port,
            secure: config.imap.tls,
            auth: {
                user: config.imap.username,
                pass: config.imap.password,
            },
            logger: false,
        });
        try {
            await client.connect();
            await client.logout();
            result.imap = true;
        } catch (err: any) {
            const imapError = `IMAP: ${err.message}`;
            result.error = result.error ? `${result.error}; ${imapError}` : imapError;
        }
    }

    return result;
}
