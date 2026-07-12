/**
 * Email Tools — Send and read emails via SMTP/IMAP.
 *
 * Uses resolved email config (agent-level → tenant-level fallback).
 */

import { Tool } from "../tool.interface.js";
import { resolveEmailConfig, sendEmail, readEmails } from "../../../channels/email/email-service.js";

export const emailSendTool: Tool = {
    name: "email_send",
    description:
        "Send an email via SMTP, optionally with file attachments. Requires email to be configured " +
        "for this agent or tenant. If an email signature is configured, it is appended automatically " +
        "after the body — do NOT write your own sign-off, name, or contact details at the end. " +
        "To attach a file, add it to `attachments` with a filename and its content (plain text, or " +
        "base64 with encoding:\"base64\" for PDFs/images/spreadsheets you already have as base64).",
    parameters: {
        type: "object",
        properties: {
            to: {
                type: "string",
                description: "Recipient email address(es). For multiple, separate with commas: \"a@x.com, b@y.com\".",
            },
            cc: {
                type: "string",
                description: "Optional CC recipient(s), comma-separated. Visible to all recipients.",
            },
            bcc: {
                type: "string",
                description: "Optional BCC recipient(s), comma-separated. Hidden from other recipients.",
            },
            subject: {
                type: "string",
                description: "Email subject line",
            },
            body: {
                type: "string",
                description: "Email body text (plain text). Do not include a signature — one is appended automatically if configured.",
            },
            html: {
                type: "string",
                description: "Optional HTML body (if provided, sent alongside plain text). Do not include a signature — one is appended automatically if configured.",
            },
            attachments: {
                type: "array",
                description: "Optional file attachments.",
                items: {
                    type: "object",
                    properties: {
                        filename: { type: "string", description: "File name incl. extension, e.g. 'quote-1042.csv' or 'report.pdf'." },
                        content: { type: "string", description: "The file's content — plain text, or base64 when encoding is 'base64'." },
                        encoding: { type: "string", description: "'utf8' (default, for text/CSV/HTML) or 'base64' (for binary files like PDF/images)." },
                        contentType: { type: "string", description: "Optional MIME type, e.g. 'text/csv', 'application/pdf'." },
                    },
                    required: ["filename", "content"],
                },
            },
        },
        required: ["to", "subject", "body"],
    },
    async execute(params) {
        const agentId = params.args._agentId;
        if (!agentId) {
            return { result: "Error: No agent profile ID available for email config resolution." };
        }

        const config = await resolveEmailConfig(params.tenantId, agentId);
        if (!config?.smtp) {
            return { result: "Error: No email (SMTP) configuration found. Please configure email in the dashboard settings." };
        }

        try {
            const result = await sendEmail(
                config.smtp,
                params.args.to,
                params.args.subject,
                params.args.body,
                params.args.html,
                { cc: params.args.cc, bcc: params.args.bcc, attachments: params.args.attachments }
            );
            return {
                result: JSON.stringify({
                    success: true,
                    messageId: result.messageId,
                    to: result.to,
                    cc: result.cc,
                    subject: params.args.subject,
                }),
            };
        } catch (err: any) {
            return { result: `Error sending email: ${err.message}` };
        }
    },
};

export const emailReadTool: Tool = {
    name: "email_read",
    description: "Read recent emails from the inbox via IMAP. Requires email to be configured.",
    parameters: {
        type: "object",
        properties: {
            count: {
                type: "number",
                description: "Number of recent emails to fetch (default: 10, max: 50)",
            },
        },
    },
    async execute(params) {
        const agentId = params.args._agentId;
        if (!agentId) {
            return { result: "Error: No agent profile ID available for email config resolution." };
        }

        const config = await resolveEmailConfig(params.tenantId, agentId);
        if (!config?.imap) {
            return { result: "Error: No email (IMAP) configuration found. Please configure email in the dashboard settings." };
        }

        const count = Math.min(params.args.count || 10, 50);

        try {
            const emails = await readEmails(config.imap, count);
            return {
                result: JSON.stringify({
                    count: emails.length,
                    emails,
                }),
            };
        } catch (err: any) {
            return { result: `Error reading emails: ${err.message}` };
        }
    },
};

export const emailListTool: Tool = {
    name: "email_list",
    description: "List inbox messages with subject, sender, and date. Lighter than email_read.",
    parameters: {
        type: "object",
        properties: {
            count: {
                type: "number",
                description: "Number of recent messages to list (default: 20, max: 50)",
            },
        },
    },
    async execute(params) {
        const agentId = params.args._agentId;
        if (!agentId) {
            return { result: "Error: No agent profile ID available for email config resolution." };
        }

        const config = await resolveEmailConfig(params.tenantId, agentId);
        if (!config?.imap) {
            return { result: "Error: No email (IMAP) configuration found. Please configure email in the dashboard settings." };
        }

        const count = Math.min(params.args.count || 20, 50);

        try {
            const emails = await readEmails(config.imap, count);
            const summary = emails.map((e) => ({
                uid: e.uid,
                from: e.from,
                subject: e.subject,
                date: e.date,
            }));
            return {
                result: JSON.stringify({
                    count: summary.length,
                    messages: summary,
                }),
            };
        } catch (err: any) {
            return { result: `Error listing emails: ${err.message}` };
        }
    },
};
