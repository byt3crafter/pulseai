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
import { renderSignature, extensionForMime, type SignatureConfig } from "./signature.js";

export interface SmtpConfig {
    host: string;
    port: number;
    username: string;
    password: string; // plaintext (decrypted at resolve time)
    tls: boolean;
    fromAddress: string;
    /** Resolved signature (agent override, else tenant default) to auto-append on send. */
    signature?: SignatureConfig;
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
    signature?: SignatureConfig;
}

/**
 * Resolve email configuration for an agent.
 * Agent-level overrides take priority over tenant-level config for the SMTP/IMAP
 * transport. The signature is resolved independently of which transport wins:
 * an agent's own signature (if present at all, even disabled) always overrides
 * the company default; only when the agent has none does the company default
 * (if enabled) apply. This lets an agent borrow the company mailbox while
 * still carrying its own signature, or vice versa.
 */
export async function resolveEmailConfig(
    tenantId: string,
    agentProfileId: string
): Promise<EmailConfig | null> {
    let transport: EmailConfig | null = null;
    let agentSignature: SignatureConfig | undefined;
    let tenantSignature: SignatureConfig | undefined;

    // 1. Agent-level email config (transport + signature)
    try {
        const profile = await db.query.agentProfiles.findFirst({
            where: eq(agentProfiles.id, agentProfileId),
        });

        const agentEmailCfg = profile?.emailConfig as any;
        agentSignature = agentEmailCfg?.signature;

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
            transport = config;
        }
    } catch (err) {
        logger.warn({ err, agentProfileId }, "Failed to load agent email config");
    }

    // 2. Tenant-level email connection (fallback transport + fallback signature)
    try {
        const conn = await db.query.channelConnections.findFirst({
            where: and(
                eq(channelConnections.tenantId, tenantId),
                eq(channelConnections.channelType, "email")
            ),
        });

        const connConfig = conn?.channelConfig as any;
        tenantSignature = connConfig?.signature;

        if (!transport && connConfig?.smtp?.host) {
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
            transport = config;
        }
    } catch (err) {
        logger.warn({ err, tenantId }, "Failed to load tenant email config");
    }

    if (!transport) return null;

    // Agent signature (if the agent has one at all, even disabled) wins;
    // otherwise fall back to the tenant/company default (only if enabled).
    const signature = agentSignature ?? (tenantSignature?.enabled ? tenantSignature : undefined);
    if (signature) {
        transport.signature = signature;
        if (transport.smtp) transport.smtp.signature = signature;
    }

    return transport;
}

/** Minimal HTML escaping + newline-to-<br> wrap for a plain-text body, so an HTML signature has valid HTML to sit alongside. */
function wrapPlainBodyAsHtml(body: string): string {
    const escaped = body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#111111;white-space:pre-wrap;">${escaped.replace(/\n/g, "<br>")}</div>`;
}

/**
 * Send an email via SMTP. If the resolved config carries an enabled
 * signature, it's auto-appended to both the HTML and plain-text parts (and
 * its logo, if any, attached via CID so it renders without "show images"
 * blocking). Signature failures are swallowed — the email always still
 * sends, just without the signature.
 */
export async function sendEmail(
    config: SmtpConfig,
    to: string,
    subject: string,
    body: string,
    html?: string
): Promise<{ messageId: string }> {
    // TLS mode is determined by PORT, not a flag: 465 = implicit TLS (secure),
    // 587/25 = plaintext connect then STARTTLS upgrade. Using secure:true on
    // 587 causes "SSL wrong version number". The `tls` flag only decides whether
    // STARTTLS is *required* on the non-implicit ports.
    const implicitTls = config.port === 465;
    const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: implicitTls,
        requireTLS: !implicitTls && config.tls !== false,
        auth: {
            user: config.username,
            pass: config.password,
        },
    });

    let finalHtml = html;
    let finalText = body;
    let attachments: Array<{ filename: string; content: Buffer; cid: string; contentType?: string }> | undefined;

    if (config.signature?.enabled) {
        try {
            const rendered = renderSignature(config.signature, { fromAddress: config.fromAddress });

            if (rendered.html) {
                const bodyHtml = finalHtml || wrapPlainBodyAsHtml(body);
                finalHtml = `${bodyHtml}<br><br>${rendered.html}`;
            }
            if (rendered.text) {
                finalText = `${body}\n\n-- \n${rendered.text}`;
            }

            const logo = config.signature.logo;
            if (logo?.dataBase64) {
                attachments = [
                    {
                        filename: `signature-logo.${extensionForMime(logo.mime)}`,
                        content: Buffer.from(logo.dataBase64, "base64"),
                        cid: "signature-logo",
                        contentType: logo.mime,
                    },
                ];
            }
        } catch (err) {
            logger.warn({ err }, "Failed to build email signature; sending without it");
            finalHtml = html;
            finalText = body;
            attachments = undefined;
        }
    }

    const info = await transporter.sendMail({
        from: config.fromAddress,
        to,
        subject,
        text: finalText,
        html: finalHtml || undefined,
        attachments,
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
