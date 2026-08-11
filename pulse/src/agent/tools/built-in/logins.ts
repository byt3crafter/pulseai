/**
 * login_list — lets an agent see which saved website logins it may use.
 * Returns labels/sites/usernames ONLY; passwords are never exposed to the model.
 * To actually sign in, the agent calls browser_login (playwright plugin), which
 * fills the decrypted password server-side without it ever entering the prompt.
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { siteLogins } from "../../../storage/schema.js";
import { and, eq, or, isNull } from "drizzle-orm";

export const loginListTool: Tool = {
    name: "login_list",
    source: "builtin",
    description:
        "List the saved website logins available to you — labels, sites and usernames only (passwords are NEVER shown). " +
        "To sign in, open the login page with browser_navigate, then call browser_login with the login's label and the field selectors.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async ({ tenantId, args }) => {
        const agentId = typeof args?._agentId === "string" ? args._agentId : null;
        const scope = agentId
            ? or(isNull(siteLogins.agentId), eq(siteLogins.agentId, agentId))
            : isNull(siteLogins.agentId);
        const rows = await db
            .select({ label: siteLogins.label, site: siteLogins.site, username: siteLogins.username })
            .from(siteLogins)
            .where(and(eq(siteLogins.tenantId, tenantId), scope));
        if (rows.length === 0) return { result: "No saved logins are available to you. The workspace owner can add them in Dashboard → Passwords." };
        const lines = rows.map((r) => `- ${r.label}${r.site ? ` (${r.site})` : ""} — username: ${r.username}`);
        return { result: `Saved logins you can use (passwords hidden — use browser_login with the label):\n${lines.join("\n")}` };
    },
};
