/**
 * email_configure — lets an agent set up its own mailbox (SMTP + optional IMAP)
 * so it can send AND read mail, without a human filling in Dashboard → Settings →
 * Email by hand. Writes the SAME encrypted blob the dashboard writes: into
 * channel_connections (channelType 'email'), channelConfig = { smtp, imap }.
 *
 * The password can be passed directly OR pulled from a saved vault login by label
 * (so it never has to be typed into the chat). Passwords are AES-256-GCM encrypted
 * at rest and are NEVER echoed back.
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { channelConnections, siteLogins } from "../../../storage/schema.js";
import { encrypt, decrypt } from "../../../utils/crypto.js";
import { and, eq, or, isNull, ilike } from "drizzle-orm";

interface EmailBlob {
    smtp?: { host: string; port: number; username: string; tls: boolean; fromAddress?: string; encryptedPassword?: string };
    imap?: { host: string; port: number; username: string; tls: boolean; encryptedPassword?: string };
    signature?: unknown;
}

export const emailConfigureTool: Tool = {
    name: "email_configure",
    source: "builtin",
    description:
        "Set up or update this workspace's mailbox so email sending AND reading work. Provide SMTP (send) and, to read/reply to inbound mail, IMAP settings. " +
        "The password may be given directly, or pulled from a saved vault login via `vault_login` (its label) so it isn't typed into the chat. " +
        "After configuring, verify with email_folders or email_fetch_unread.",
    parameters: {
        type: "object",
        properties: {
            smtp_host: { type: "string", description: "SMTP server host, e.g. mail.metcheck.co.bw." },
            smtp_port: { type: "number", description: "SMTP port (default 587; 465 = implicit SSL)." },
            smtp_username: { type: "string", description: "SMTP username (usually the full email address)." },
            smtp_password: { type: "string", description: "SMTP password. Omit if using vault_login, or to keep the existing saved password." },
            from_address: { type: "string", description: "The From address mail is sent as (usually the same email address)." },
            smtp_tls: { type: "boolean", description: "Use TLS/STARTTLS for SMTP (default true)." },
            imap_host: { type: "string", description: "IMAP server host (omit for send-only). Needed to read/reply to mail." },
            imap_port: { type: "number", description: "IMAP port (default 993)." },
            imap_username: { type: "string", description: "IMAP username (defaults to the SMTP username)." },
            imap_password: { type: "string", description: "IMAP password (defaults to the SMTP/vault password)." },
            imap_tls: { type: "boolean", description: "Use SSL/TLS for IMAP (default true)." },
            vault_login: { type: "string", description: "Optional: label of a saved vault login to take the username + password from." },
        },
        required: ["smtp_host"],
    },
    execute: async ({ tenantId, args }) => {
        const agentId = typeof args?._agentId === "string" ? args._agentId : null;

        // Optionally resolve credentials from a saved vault login (never echoed).
        let vaultUser: string | null = null;
        let vaultPass: string | null = null;
        if (args?.vault_login) {
            const label = String(args.vault_login).trim();
            const scope = agentId ? or(isNull(siteLogins.agentId), eq(siteLogins.agentId, agentId)) : isNull(siteLogins.agentId);
            const rows = await db.select().from(siteLogins)
                .where(and(eq(siteLogins.tenantId, tenantId), ilike(siteLogins.label, label), scope)).limit(2);
            if (rows.length === 0) return { result: `No saved vault login called "${label}". Check login_list.` };
            if (rows.length > 1) return { result: `"${label}" matches multiple vault logins — use the exact label.` };
            vaultUser = rows[0].username;
            try { vaultPass = decrypt(rows[0].encryptedPassword); } catch { return { result: "Could not decrypt the vault login's password." }; }
        }

        const smtpHost = String(args.smtp_host).trim();
        if (!smtpHost) return { result: "smtp_host is required." };
        const smtpUsername = String(args?.smtp_username ?? vaultUser ?? "").trim();
        if (!smtpUsername) return { result: "Provide smtp_username (or a vault_login that carries the username)." };
        const smtpPassword = args?.smtp_password != null ? String(args.smtp_password) : (vaultPass ?? "");

        // Load any existing config so we can preserve a stored password when none is given.
        const existing = await db.query.channelConnections.findFirst({
            where: and(eq(channelConnections.tenantId, tenantId), eq(channelConnections.channelType, "email")),
        });
        const prev = (existing?.channelConfig as EmailBlob) || {};

        const smtp: EmailBlob["smtp"] = {
            host: smtpHost,
            port: Number(args?.smtp_port) || 587,
            username: smtpUsername,
            tls: args?.smtp_tls !== false,
            fromAddress: String(args?.from_address ?? smtpUsername).trim(),
            encryptedPassword: smtpPassword ? encrypt(smtpPassword) : prev.smtp?.encryptedPassword,
        };
        if (!smtp.encryptedPassword) return { result: "No SMTP password provided and none saved. Pass smtp_password or vault_login." };

        const blob: EmailBlob = { ...prev, smtp };

        // IMAP is optional (send-only if omitted). Defaults inherit SMTP creds.
        const imapHost = args?.imap_host ? String(args.imap_host).trim() : "";
        if (imapHost) {
            const imapUsername = String(args?.imap_username ?? smtpUsername).trim();
            const imapPassword = args?.imap_password != null ? String(args.imap_password) : smtpPassword;
            blob.imap = {
                host: imapHost,
                port: Number(args?.imap_port) || 993,
                username: imapUsername,
                tls: args?.imap_tls !== false,
                encryptedPassword: imapPassword ? encrypt(imapPassword) : prev.imap?.encryptedPassword,
            };
            if (!blob.imap.encryptedPassword) return { result: "IMAP host given but no password available. Pass imap_password/smtp_password or vault_login." };
        }

        if (existing) {
            await db.update(channelConnections).set({ channelConfig: blob }).where(eq(channelConnections.id, existing.id));
        } else {
            await db.insert(channelConnections).values({ tenantId, channelType: "email", channelConfig: blob });
        }

        const parts = [`SMTP ${smtp.host}:${smtp.port} as ${smtp.username}`];
        parts.push(blob.imap ? `IMAP ${blob.imap.host}:${blob.imap.port} as ${blob.imap.username}` : "IMAP not set (send-only)");
        return { result: `Mailbox configured — ${parts.join("; ")}. Password stored encrypted. Now verify with email_folders or email_fetch_unread.` };
    },
};
