import "server-only";
import nodemailer from "nodemailer";
import { db } from "../storage/db";
import { globalSettings, channelConnections } from "../storage/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "./crypto";

/**
 * Transactional email for account flows (password reset, invites, verification).
 *
 * SMTP is configured entirely through the admin panel (Admin → Settings → Email),
 * stored in global_settings.config.smtp with the password encrypted at rest.
 * Nothing is read from env vars. If SMTP is not configured/enabled the mailer is
 * a safe no-op that logs a warning — account creation still works (the temp
 * password shown in the UI is the fallback) and forgot-password simply can't
 * deliver until an admin sets it up.
 */

/** Shape persisted in global_settings.config.smtp (password stored encrypted). */
export interface StoredSmtp {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from?: string;
    fromName?: string;
    passwordEnc?: string;
}

/** Ready-to-use SMTP config with a decrypted password. */
export interface ResolvedSmtp {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
    fromName?: string;
}

async function loadStoredSmtp(): Promise<StoredSmtp | null> {
    try {
        const row = (await db.query.globalSettings.findFirst({
            where: eq(globalSettings.id, "root"),
        })) as any;
        const smtp = row?.config?.smtp;
        return smtp ?? null;
    } catch (error) {
        console.error("[mailer] Failed to load SMTP settings:", error);
        return null;
    }
}

/** Resolve the stored SMTP config into a send-ready form, or null if unusable. */
export async function resolveSmtp(): Promise<ResolvedSmtp | null> {
    const s = await loadStoredSmtp();
    if (!s || !s.enabled || !s.host || !s.user || !s.passwordEnc) return null;
    let password: string;
    try {
        password = decrypt(s.passwordEnc);
    } catch {
        console.error("[mailer] Failed to decrypt SMTP password");
        return null;
    }
    return {
        host: s.host,
        port: s.port || 587,
        secure: !!s.secure,
        user: s.user,
        password,
        from: s.from || s.user,
        fromName: s.fromName,
    };
}

export async function isEmailConfigured(): Promise<boolean> {
    return (await resolveSmtp()) !== null;
}

/**
 * Resolve a TENANT's own SMTP config — stored on channel_connections
 * (channelType = 'email', configured in the dashboard's Settings → Email tab)
 * rather than the platform-wide global_settings row. Used to send account
 * emails (team invites) "from" the tenant's own mailbox when they've set one
 * up, before falling back to the platform SMTP via `resolveSmtp()`.
 */
export async function resolveTenantSmtp(tenantId: string): Promise<ResolvedSmtp | null> {
    try {
        const conn = await db.query.channelConnections.findFirst({
            where: and(eq(channelConnections.tenantId, tenantId), eq(channelConnections.channelType, "email")),
        });
        const smtp = (conn?.channelConfig as any)?.smtp;
        if (!smtp?.host || !smtp?.username || !smtp?.encryptedPassword) return null;
        let password: string;
        try {
            password = decrypt(smtp.encryptedPassword);
        } catch {
            console.error("[mailer] Failed to decrypt tenant SMTP password");
            return null;
        }
        return {
            host: smtp.host,
            port: smtp.port || 587,
            secure: !!smtp.tls,
            user: smtp.username,
            password,
            from: smtp.fromAddress || smtp.username,
        };
    } catch (error) {
        console.error("[mailer] Failed to resolve tenant SMTP:", error);
        return null;
    }
}

export async function isTenantEmailConfigured(tenantId: string): Promise<boolean> {
    return (await resolveTenantSmtp(tenantId)) !== null;
}

/** Base URL for links in emails (deployment config, not a secret). */
export function appBaseUrl(): string {
    return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

interface MailOptions {
    to: string;
    subject: string;
    html: string;
    text: string;
}

/** Low-level send with an explicit config — used by the admin "test" button. */
export async function sendMailWith(smtp: ResolvedSmtp, opts: MailOptions): Promise<void> {
    const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.password },
    });
    const from = smtp.fromName ? `"${smtp.fromName}" <${smtp.from}>` : smtp.from;
    await transport.sendMail({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
    });
}

/**
 * Send an email using the admin-configured SMTP settings. Returns true if
 * delivered, false if SMTP is not configured. Never throws to the caller.
 */
export async function sendMail(opts: MailOptions): Promise<boolean> {
    const smtp = await resolveSmtp();
    if (!smtp) {
        console.warn("[mailer] SMTP not configured — skipping email to", opts.to);
        return false;
    }
    try {
        await sendMailWith(smtp, opts);
        return true;
    } catch (error) {
        console.error("[mailer] Failed to send email:", error);
        return false;
    }
}

// ── Templated account emails ────────────────────────────────────────────────

function layout(title: string, bodyHtml: string): string {
    return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px">${title}</h2>
        ${bodyHtml}
        <p style="font-size:12px;color:#94a3b8;margin-top:32px">Pulse AI · Runstate Ltd</p>
    </div>`;
}

function button(url: string, label: string): string {
    return `<a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px">${label}</a>`;
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<boolean> {
    return sendMail({
        to,
        subject: "Reset your Pulse password",
        text: `We received a request to reset your Pulse password. Open this link to choose a new password (valid for 1 hour):\n\n${link}\n\nIf you didn't request this, you can safely ignore this email.`,
        html: layout("Reset your password", `
            <p style="font-size:14px;line-height:1.6">We received a request to reset your Pulse password. Click below to choose a new one. This link is valid for <strong>1 hour</strong>.</p>
            <p style="margin:20px 0">${button(link, "Reset password")}</p>
            <p style="font-size:13px;color:#64748b">If you didn't request this, you can safely ignore this email.</p>
        `),
    });
}

function inviteEmailContent(name: string | null, link: string): { subject: string; html: string; text: string } {
    const greeting = name ? `Hi ${name},` : "Hi,";
    return {
        subject: "You've been invited to Pulse",
        text: `${greeting}\n\nAn account has been created for you on Pulse. Set your password to get started (link valid for 7 days):\n\n${link}`,
        html: layout("Welcome to Pulse", `
            <p style="font-size:14px;line-height:1.6">${greeting}</p>
            <p style="font-size:14px;line-height:1.6">An account has been created for you on Pulse. Set your password to get started. This link is valid for <strong>7 days</strong>.</p>
            <p style="margin:20px 0">${button(link, "Set your password")}</p>
        `),
    };
}

export async function sendInviteEmail(to: string, name: string | null, link: string): Promise<boolean> {
    return sendMail({ to, ...inviteEmailContent(name, link) });
}

/** Same invite email, sent through an explicit (e.g. tenant-owned) SMTP config instead of the platform default. */
export async function sendInviteEmailWithSmtp(smtp: ResolvedSmtp, to: string, name: string | null, link: string): Promise<boolean> {
    try {
        await sendMailWith(smtp, { to, ...inviteEmailContent(name, link) });
        return true;
    } catch (error) {
        console.error("[mailer] Failed to send invite via tenant SMTP:", error);
        return false;
    }
}
