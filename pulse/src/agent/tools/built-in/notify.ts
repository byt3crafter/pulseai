/**
 * notify — post a notification to the owner's in-app inbox (the bell in the
 * dashboard). The web-native way for the agent to reach the owner proactively:
 * a reply came in, a chase is overdue, a briefing is ready, something needs
 * attention. One record; other delivery channels (email/push/telegram) can fan
 * out from the same inbox later.
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { notifications } from "../../../storage/schema.js";

const PRIORITIES = new Set(["low", "normal", "high"]);
const KINDS = new Set(["info", "reply", "overdue", "briefing", "approval", "job", "system"]);

export const notifyTool: Tool = {
    name: "notify",
    source: "builtin",
    description:
        "Post a notification to the owner's in-app inbox (the bell in the dashboard) so they see it next time they open the app. " +
        "Use for anything worth surfacing proactively: a customer reply arrived, a follow-up is overdue, a briefing is ready, or something needs a decision. " +
        "Keep the title short and specific; put the detail and your recommended next step in the body.",
    parameters: {
        type: "object",
        properties: {
            title: { type: "string", description: "Short, specific headline, e.g. 'MP Mining replied on quote TI-002514'." },
            body: { type: "string", description: "The detail + your recommended next step." },
            priority: { type: "string", enum: ["low", "normal", "high"], description: "How urgent (default normal)." },
            kind: { type: "string", enum: ["info", "reply", "overdue", "briefing", "approval", "job"], description: "What kind of notification (default info)." },
        },
        required: ["title"],
    },
    execute: async ({ tenantId, args }) => {
        const title = String(args?.title ?? "").trim();
        if (!title) return { result: "A notification needs a title." };
        const agentId = typeof args?._agentId === "string" ? args._agentId : null;
        await db.insert(notifications).values({
            tenantId,
            agentId,
            title: title.slice(0, 300),
            body: args?.body ? String(args.body).slice(0, 4000) : null,
            priority: PRIORITIES.has(String(args?.priority)) ? String(args.priority) : "normal",
            kind: KINDS.has(String(args?.kind)) ? String(args.kind) : "info",
        });
        return { result: `Posted to the owner's inbox: "${title}".` };
    },
};
