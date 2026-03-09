/**
 * Email Tools — Send and read emails via SMTP/IMAP.
 *
 * Uses resolved email config (agent-level → tenant-level fallback).
 */

import { Tool } from "../tool.interface.js";
import { resolveEmailConfig, sendEmail, readEmails } from "../../../channels/email/email-service.js";

export const emailSendTool: Tool = {
    name: "email_send",
    description: "Send an email via SMTP. Requires email to be configured for this agent or tenant.",
    parameters: {
        type: "object",
        properties: {
            to: {
                type: "string",
                description: "Recipient email address",
            },
            subject: {
                type: "string",
                description: "Email subject line",
            },
            body: {
                type: "string",
                description: "Email body text (plain text)",
            },
            html: {
                type: "string",
                description: "Optional HTML body (if provided, sent alongside plain text)",
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
                params.args.html
            );
            return {
                result: JSON.stringify({
                    success: true,
                    messageId: result.messageId,
                    to: params.args.to,
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
