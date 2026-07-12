/**
 * Commitments Plugin for Pulse AI
 *
 * Lets agents record follow-up "check-ins" and come back to them. How a due
 * commitment is delivered is a per-tenant setting (tenants.config.commitments):
 *   deliveryMode: "channel" | "owner" | "internal"   (default "internal")
 * Nothing is hardcoded. (Due-delivery job + settings UI ship in part 2.)
 */

import { definePlugin } from "../../src/plugins/sdk/index.js";
import { PromptContext } from "../../src/plugins/sdk/types.js";
import { isPluginEnabledForTenant } from "../../src/plugins/tenant-access.js";
import { db } from "../../src/storage/db.js";
import { tenants } from "../../src/storage/schema.js";
import { eq } from "drizzle-orm";
import { parseCommitmentsConfig } from "../../src/commitments/commitment-service.js";
import { commitmentCreateTool, commitmentListTool, commitmentCompleteTool } from "./tools.js";

const MODE_BEHAVIOUR: Record<string, string> = {
    channel: "When one is due, the check-in is sent to the original person/channel.",
    owner: "When one is due, it's surfaced to the workspace owner (not the customer).",
    internal: "Due commitments are kept internal — nothing is sent automatically; you act on them yourself.",
};

export default definePlugin({
    name: "commitments",
    version: "1.0.0",
    description: "Follow-up commitments — agents record check-ins to come back to; delivery when due is a per-tenant setting.",
    author: "Runstate",

    tools: [commitmentCreateTool, commitmentListTool, commitmentCompleteTool],

    hooks: {
        "before-prompt-build": async (ctx: PromptContext): Promise<PromptContext | null> => {
            if (!(await isPluginEnabledForTenant("commitments", ctx.tenantId))) return null;
            const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, ctx.tenantId) });
            const cfg = parseCommitmentsConfig(tenant?.config);
            const behaviour = MODE_BEHAVIOUR[cfg.deliveryMode] || MODE_BEHAVIOUR.internal;
            return {
                ...ctx,
                systemPrompt:
                    ctx.systemPrompt +
                    `\n## Follow-up commitments\n` +
                    `Record things to come back to with \`commitment_create\` (e.g. "check if ABC Traders accepted the quote on Friday"). ` +
                    `Review with \`commitment_list\`, close with \`commitment_complete\`. ${behaviour}\n`,
            };
        },
    },

    routes: [
        {
            method: "GET",
            path: "/status",
            handler: async (_request: any, reply: any) =>
                reply.send({ plugin: "commitments", version: "1.0.0", status: "active", tools: ["commitment_create", "commitment_list", "commitment_complete"] }),
        },
    ],
});
