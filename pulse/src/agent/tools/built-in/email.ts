/**
 * Email Tools — Send and read emails via SMTP/IMAP.
 *
 * Uses resolved email config (agent-level → tenant-level fallback).
 */

import { Tool } from "../tool.interface.js";
import {
    resolveEmailConfig, sendEmail, readEmails, readUnreadEmails,
    searchEmails, getReplyContext, setMessageFlag, moveMessage, deleteMessage, listFolders, saveDraft,
} from "../../../channels/email/email-service.js";

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

export const emailDraftTool: Tool = {
    name: "email_draft",
    description:
        "Save an email to the mailbox's Drafts folder instead of sending it — use this when the user wants to review/edit before it goes out. " +
        "The draft appears in their normal email client's Drafts, ready to send by hand. Requires email (SMTP + IMAP) configured.",
    parameters: {
        type: "object",
        properties: {
            to: { type: "string", description: "Recipient email address(es), comma-separated." },
            cc: { type: "string", description: "Optional CC recipient(s), comma-separated." },
            subject: { type: "string", description: "Subject line." },
            body: { type: "string", description: "Email body (plain text)." },
            html: { type: "string", description: "Optional HTML body." },
        },
        required: ["to", "subject", "body"],
    },
    async execute(params) {
        const agentId = params.args._agentId;
        if (!agentId) return { result: "Error: No agent profile ID available for email config resolution." };
        const config = await resolveEmailConfig(params.tenantId, agentId);
        if (!config?.smtp) return { result: "Error: No SMTP configuration found — configure email in the dashboard settings." };
        if (!config?.imap) return { result: "Error: No IMAP configuration found — a draft is saved to your mailbox over IMAP, which isn't configured." };
        try {
            const { folder } = await saveDraft(config.smtp, config.imap, params.args.to, params.args.subject, params.args.body, params.args.html, { cc: params.args.cc });
            return { result: JSON.stringify({ success: true, savedTo: folder, subject: params.args.subject, to: params.args.to }) };
        } catch (err: any) {
            return { result: `Error saving draft: ${err.message}` };
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

export const emailFetchUnreadTool: Tool = {
    name: "email_fetch_unread",
    description:
        "Fetch UNREAD inbox emails WITH their full body text — use this to read new customer replies you need to act on. " +
        "By default it marks the fetched emails as read so you won't process the same one twice, so only call it when you intend " +
        "to handle everything it returns in this turn. Returns each email's from, subject, date and body.",
    parameters: {
        type: "object",
        properties: {
            count: { type: "number", description: "Max unread emails to fetch (default 10, max 25)." },
            mark_read: { type: "boolean", description: "Mark the fetched emails as read (default true). Set false to peek without consuming." },
        },
    },
    async execute(params) {
        const agentId = params.args._agentId;
        if (!agentId) return { result: "Error: No agent profile ID available for email config resolution." };

        const config = await resolveEmailConfig(params.tenantId, agentId);
        if (!config?.imap) {
            return { result: "Error: No email (IMAP) configuration found. Configure email in the dashboard settings." };
        }

        try {
            const emails = await readUnreadEmails(config.imap, {
                count: params.args.count,
                markSeen: params.args.mark_read !== false,
            });
            return { result: JSON.stringify({ count: emails.length, emails }) };
        } catch (err: any) {
            return { result: `Error fetching unread emails: ${err.message}` };
        }
    },
};

export const emailReplyTool: Tool = {
    name: "email_reply",
    description:
        "Reply to a specific inbox email, keeping the same email thread (the recipient sees it as a reply, not a new message). " +
        "Give the uid of the email to reply to (from email_fetch_unread/email_list/email_search) and your reply body. " +
        "Subject and recipient are taken from the original automatically.",
    parameters: {
        type: "object",
        properties: {
            uid: { type: "number", description: "UID of the email being replied to." },
            body: { type: "string", description: "Your reply text." },
            folder: { type: "string", description: "Folder the original is in (default INBOX)." },
            quote_original: { type: "boolean", description: "Append the quoted original below your reply (default true)." },
        },
        required: ["uid", "body"],
    },
    async execute(params) {
        const agentId = params.args._agentId;
        if (!agentId) return { result: "Error: No agent profile ID available." };
        const config = await resolveEmailConfig(params.tenantId, agentId);
        if (!config?.imap || !config?.smtp) return { result: "Error: Email (IMAP+SMTP) not fully configured." };

        try {
            const ctx = await getReplyContext(config.imap, Number(params.args.uid), params.args.folder || "INBOX");
            if (!ctx) return { result: `Error: Could not find email uid ${params.args.uid}.` };
            const subject = /^re:/i.test(ctx.subject) ? ctx.subject : `Re: ${ctx.subject}`;
            let body = String(params.args.body || "");
            if (params.args.quote_original !== false && ctx.body) {
                const quoted = ctx.body.split("\n").map((l) => `> ${l}`).join("\n");
                body = `${body}\n\nOn ${ctx.date}, ${ctx.from} wrote:\n${quoted}`;
            }
            const res = await sendEmail(config.smtp, ctx.from, subject, body, undefined, {
                inReplyTo: ctx.messageId || undefined,
                references: ctx.references || undefined,
            });
            return { result: JSON.stringify({ replied: true, to: res.to, subject, messageId: res.messageId }) };
        } catch (err: any) {
            return { result: `Error sending reply: ${err.message}` };
        }
    },
};

export const emailSearchTool: Tool = {
    name: "email_search",
    description: "Search a mailbox by sender, subject, unread status, or recency. Returns matching envelopes (uid/from/subject/date/seen).",
    parameters: {
        type: "object",
        properties: {
            from: { type: "string", description: "Match sender address/substring." },
            subject: { type: "string", description: "Match subject substring." },
            unread_only: { type: "boolean", description: "Only unread messages." },
            since_days: { type: "number", description: "Only messages from the last N days." },
            folder: { type: "string", description: "Folder to search (default INBOX)." },
            count: { type: "number", description: "Max results (default 20, max 50)." },
        },
    },
    async execute(params) {
        const agentId = params.args._agentId;
        if (!agentId) return { result: "Error: No agent profile ID available." };
        const config = await resolveEmailConfig(params.tenantId, agentId);
        if (!config?.imap) return { result: "Error: No email (IMAP) configuration found." };
        try {
            const rows = await searchEmails(config.imap, {
                from: params.args.from,
                subject: params.args.subject,
                unreadOnly: params.args.unread_only === true,
                sinceDays: params.args.since_days,
                folder: params.args.folder,
                count: params.args.count,
            });
            return { result: JSON.stringify({ count: rows.length, messages: rows }) };
        } catch (err: any) {
            return { result: `Error searching email: ${err.message}` };
        }
    },
};

export const emailFlagTool: Tool = {
    name: "email_flag",
    description: "Mark an email read/unread or flagged/unflagged by uid.",
    parameters: {
        type: "object",
        properties: {
            uid: { type: "number", description: "UID of the message." },
            action: { type: "string", description: "One of: read, unread, flag, unflag." },
            folder: { type: "string", description: "Folder (default INBOX)." },
        },
        required: ["uid", "action"],
    },
    async execute(params) {
        const agentId = params.args._agentId;
        if (!agentId) return { result: "Error: No agent profile ID available." };
        const config = await resolveEmailConfig(params.tenantId, agentId);
        if (!config?.imap) return { result: "Error: No email (IMAP) configuration found." };
        const map: Record<string, { flag: string; add: boolean }> = {
            read: { flag: "\\Seen", add: true },
            unread: { flag: "\\Seen", add: false },
            flag: { flag: "\\Flagged", add: true },
            unflag: { flag: "\\Flagged", add: false },
        };
        const op = map[String(params.args.action)];
        if (!op) return { result: "Error: action must be read, unread, flag, or unflag." };
        try {
            await setMessageFlag(config.imap, Number(params.args.uid), op.flag, op.add, params.args.folder || "INBOX");
            return { result: JSON.stringify({ ok: true, uid: params.args.uid, action: params.args.action }) };
        } catch (err: any) {
            return { result: `Error updating flag: ${err.message}` };
        }
    },
};

export const emailMoveTool: Tool = {
    name: "email_move",
    description: "Move an email to another folder (e.g. to file it under a project or archive).",
    parameters: {
        type: "object",
        properties: {
            uid: { type: "number", description: "UID of the message." },
            to_folder: { type: "string", description: "Destination folder path (see email_folders)." },
            from_folder: { type: "string", description: "Source folder (default INBOX)." },
        },
        required: ["uid", "to_folder"],
    },
    async execute(params) {
        const agentId = params.args._agentId;
        if (!agentId) return { result: "Error: No agent profile ID available." };
        const config = await resolveEmailConfig(params.tenantId, agentId);
        if (!config?.imap) return { result: "Error: No email (IMAP) configuration found." };
        try {
            await moveMessage(config.imap, Number(params.args.uid), String(params.args.to_folder), params.args.from_folder || "INBOX");
            return { result: JSON.stringify({ moved: true, uid: params.args.uid, to: params.args.to_folder }) };
        } catch (err: any) {
            return { result: `Error moving email: ${err.message}` };
        }
    },
};

export const emailDeleteTool: Tool = {
    name: "email_delete",
    description: "Delete an email (moves it to Trash where available). Destructive — usually gate this behind approval.",
    parameters: {
        type: "object",
        properties: {
            uid: { type: "number", description: "UID of the message." },
            folder: { type: "string", description: "Folder (default INBOX)." },
        },
        required: ["uid"],
    },
    async execute(params) {
        const agentId = params.args._agentId;
        if (!agentId) return { result: "Error: No agent profile ID available." };
        const config = await resolveEmailConfig(params.tenantId, agentId);
        if (!config?.imap) return { result: "Error: No email (IMAP) configuration found." };
        try {
            await deleteMessage(config.imap, Number(params.args.uid), params.args.folder || "INBOX");
            return { result: JSON.stringify({ deleted: true, uid: params.args.uid }) };
        } catch (err: any) {
            return { result: `Error deleting email: ${err.message}` };
        }
    },
};

export const emailFoldersTool: Tool = {
    name: "email_folders",
    description: "List the mailbox folders available (INBOX, Sent, Trash, and any custom folders).",
    parameters: { type: "object", properties: {} },
    async execute(params) {
        const agentId = params.args._agentId;
        if (!agentId) return { result: "Error: No agent profile ID available." };
        const config = await resolveEmailConfig(params.tenantId, agentId);
        if (!config?.imap) return { result: "Error: No email (IMAP) configuration found." };
        try {
            const folders = await listFolders(config.imap);
            return { result: JSON.stringify({ folders }) };
        } catch (err: any) {
            return { result: `Error listing folders: ${err.message}` };
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
