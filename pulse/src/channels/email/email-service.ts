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
    /** Display name for the From header (e.g. "Natalie Harrington"). Falls back to the agent name. */
    fromName?: string;
    /** Addresses always CC'd on every email this agent/tenant sends (comma-separated or array). */
    defaultCc?: string | string[];
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
                    // From display name: explicit fromName, else the agent's real
                    // name (so recipients see "Natalie Harrington", not "natalie").
                    fromName: agentEmailCfg.smtp.fromName || profile?.name || undefined,
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
/** Normalize a recipient input (string with commas/semicolons, or array) to a clean array. */
function normalizeRecipients(v: string | string[] | undefined | null): string[] {
    if (!v) return [];
    const arr = Array.isArray(v) ? v : String(v).split(/[,;]+/);
    return arr.map((s) => s.trim()).filter(Boolean);
}

/** A file attachment supplied by a caller (agent-generated content). */
export interface EmailAttachment {
    filename: string;
    content: string; // text, or base64 when encoding === "base64"
    encoding?: "base64" | "utf8";
    contentType?: string;
}

// Guard against a runaway/abusive attachment. ~15 MB of decoded content total.
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export async function sendEmail(
    config: SmtpConfig,
    to: string | string[],
    subject: string,
    body: string,
    html?: string,
    opts?: { cc?: string | string[]; bcc?: string | string[]; attachments?: EmailAttachment[]; inReplyTo?: string; references?: string }
): Promise<{ messageId: string; to: string[]; cc: string[] }> {
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
    let attachments: Array<{ filename: string; content: Buffer | string; cid?: string; contentType?: string }> | undefined;

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

    // Caller-supplied attachments (e.g. a report the agent generated). Merged
    // with any signature-logo attachment above.
    if (opts?.attachments?.length) {
        let total = 0;
        const files = opts.attachments.map((a) => {
            const buf = a.encoding === "base64" ? Buffer.from(a.content, "base64") : Buffer.from(a.content, "utf8");
            total += buf.length;
            return { filename: a.filename, content: buf, contentType: a.contentType };
        });
        if (total > MAX_ATTACHMENT_BYTES) {
            throw new Error(`Attachments too large (${(total / 1048576).toFixed(1)} MB). Limit is 15 MB total.`);
        }
        attachments = [...(attachments || []), ...files];
    }

    const toList = normalizeRecipients(to);
    // CC = explicit CC from the caller + the agent's always-CC default (deduped,
    // and never CC an address that's already a direct recipient).
    const ccList = Array.from(new Set([
        ...normalizeRecipients(opts?.cc),
        ...normalizeRecipients(config.defaultCc),
    ])).filter((a) => !toList.includes(a));
    const bccList = normalizeRecipients(opts?.bcc);

    const info = await transporter.sendMail({
        from: config.fromName
            ? { name: config.fromName, address: config.fromAddress }
            : config.fromAddress,
        to: toList,
        cc: ccList.length ? ccList : undefined,
        bcc: bccList.length ? bccList : undefined,
        subject,
        text: finalText,
        html: finalHtml || undefined,
        attachments,
        inReplyTo: opts?.inReplyTo,
        references: opts?.references,
    });

    return { messageId: info.messageId, to: toList, cc: ccList };
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

export interface UnreadEmail {
    uid: number;
    from: string;
    fromName: string;
    subject: string;
    date: string;
    body: string;
}

/**
 * Fetch UNSEEN inbox messages with their plain-text body — the intake path for
 * an agent that must read and reply to customer emails. Optionally marks the
 * fetched messages \Seen so a subsequent poll won't re-surface them (the caller
 * passes markSeen=true only once it has safely handled/queued them).
 */
export async function readUnreadEmails(
    config: ImapConfig,
    opts: { count?: number; markSeen?: boolean } = {}
): Promise<UnreadEmail[]> {
    const count = Math.min(opts.count ?? 10, 25);
    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.tls,
        auth: { user: config.username, pass: config.password },
        logger: false,
    });

    const out: UnreadEmail[] = [];
    try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");
        try {
            // IMAP SEARCH for unseen; take the most recent `count`.
            const uids = (await client.search({ seen: false }, { uid: true })) || [];
            const pick = uids.slice(-count);
            const returnedUids: number[] = [];
            for (const uid of pick) {
                const msg = await client.fetchOne(String(uid), { envelope: true, source: true }, { uid: true });
                if (!msg || !msg.envelope) continue;
                const env = msg.envelope;
                let body = "";
                try {
                    // Lazy import keeps mailparser out of the hot path for send-only tenants.
                    const { simpleParser } = await import("mailparser");
                    const parsed = await simpleParser(msg.source as Buffer);
                    body = (parsed.text || parsed.html || "").toString();
                } catch (err) {
                    logger.warn({ err, uid }, "Failed to parse email body");
                }
                out.push({
                    uid: Number(uid),
                    from: env.from?.[0]?.address || "unknown",
                    fromName: env.from?.[0]?.name || env.from?.[0]?.address || "unknown",
                    subject: env.subject || "(no subject)",
                    date: env.date?.toISOString() || "",
                    body: body.trim().slice(0, 8000),
                });
                returnedUids.push(Number(uid));
            }
            // Only mark messages we actually returned. A message that failed to
            // fetch/parse (skipped above) must stay unread so it re-surfaces —
            // otherwise it's silently lost.
            if (opts.markSeen && returnedUids.length) {
                await client.messageFlagsAdd(returnedUids, ["\\Seen"], { uid: true }).catch(() => {});
            }
        } finally {
            lock.release();
        }
        await client.logout();
    } catch (err) {
        await client.logout().catch(() => {});
        throw err;
    }
    return out.reverse(); // most recent first
}

/** Open an IMAP connection + lock a mailbox, run `fn`, then always clean up. */
async function withMailbox<T>(config: ImapConfig, folder: string, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.tls,
        auth: { user: config.username, pass: config.password },
        logger: false,
    });
    await client.connect();
    try {
        const lock = await client.getMailboxLock(folder);
        try {
            return await fn(client);
        } finally {
            lock.release();
        }
    } finally {
        await client.logout().catch(() => {});
    }
}

export interface EmailSearchCriteria {
    from?: string;
    subject?: string;
    unreadOnly?: boolean;
    sinceDays?: number;
    folder?: string;
    count?: number;
}

/** Search a folder by simple criteria; returns matching envelopes (no body). */
export async function searchEmails(config: ImapConfig, c: EmailSearchCriteria) {
    const folder = c.folder || "INBOX";
    const count = Math.min(c.count ?? 20, 50);
    return withMailbox(config, folder, async (client) => {
        const query: any = {};
        if (c.from) query.from = c.from;
        if (c.subject) query.subject = c.subject;
        if (c.unreadOnly) query.seen = false;
        if (c.sinceDays && c.sinceDays > 0) query.since = new Date(Date.now() - c.sinceDays * 86400_000);
        const uids: number[] = (await client.search(Object.keys(query).length ? query : { all: true }, { uid: true })) || [];
        const pick = uids.slice(-count);
        const out: Array<{ uid: number; from: string; subject: string; date: string; seen: boolean }> = [];
        for (const uid of pick) {
            const msg = await client.fetchOne(String(uid), { envelope: true, flags: true }, { uid: true });
            if (!msg || !msg.envelope) continue;
            out.push({
                uid: Number(uid),
                from: msg.envelope.from?.[0]?.address || "unknown",
                subject: msg.envelope.subject || "(no subject)",
                date: msg.envelope.date?.toISOString() || "",
                seen: msg.flags?.has("\\Seen") ?? false,
            });
        }
        return out.reverse();
    });
}

export interface ReplyContext {
    messageId: string;
    references: string;
    from: string;
    subject: string;
    body: string;
    date: string;
}

/** Fetch the headers/body needed to compose a threaded reply to one message. */
export async function getReplyContext(config: ImapConfig, uid: number, folder = "INBOX"): Promise<ReplyContext | null> {
    return withMailbox(config, folder, async (client) => {
        const msg = await client.fetchOne(String(uid), { envelope: true, source: true }, { uid: true });
        if (!msg || !msg.envelope) return null;
        const env = msg.envelope;
        let body = "";
        try {
            const { simpleParser } = await import("mailparser");
            const parsed = await simpleParser(msg.source as Buffer);
            body = (parsed.text || parsed.html || "").toString();
        } catch { /* body is best-effort */ }
        const messageId = env.messageId || "";
        return {
            messageId,
            references: messageId, // thread by referencing the message we're replying to
            from: env.from?.[0]?.address || "",
            subject: env.subject || "",
            body: body.trim().slice(0, 6000),
            date: env.date?.toISOString() || "",
        };
    });
}

/** Add/remove a flag (\Seen, \Flagged) on a message. */
export async function setMessageFlag(config: ImapConfig, uid: number, flag: string, add: boolean, folder = "INBOX"): Promise<boolean> {
    return withMailbox(config, folder, async (client) => {
        const fn = add ? client.messageFlagsAdd.bind(client) : client.messageFlagsRemove.bind(client);
        return (await fn([uid], [flag], { uid: true })) as boolean;
    });
}

/** Move a message to another folder. */
export async function moveMessage(config: ImapConfig, uid: number, toFolder: string, fromFolder = "INBOX"): Promise<boolean> {
    return withMailbox(config, fromFolder, async (client) => {
        await client.messageMove([uid], toFolder, { uid: true });
        return true;
    });
}

/** Delete a message (move to Trash if present, else \Deleted + expunge). */
export async function deleteMessage(config: ImapConfig, uid: number, folder = "INBOX"): Promise<boolean> {
    return withMailbox(config, folder, async (client) => {
        try {
            await client.messageMove([uid], "Trash", { uid: true });
        } catch {
            // No Trash folder: messageDelete sets \Deleted AND expunges, so the
            // message is actually removed rather than just flagged (a bare
            // flagsAdd left it in place while we reported success).
            await client.messageDelete([uid], { uid: true });
        }
        return true;
    });
}

/** List folder/mailbox paths. */
export async function listFolders(config: ImapConfig): Promise<string[]> {
    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.tls,
        auth: { user: config.username, pass: config.password },
        logger: false,
    });
    await client.connect();
    try {
        const list = await client.list();
        return list.map((f) => f.path);
    } finally {
        await client.logout().catch(() => {});
    }
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
