/**
 * login_save — lets an agent SAVE a website login to the password vault.
 * The counterpart to login_list (read). The password is AES-256-GCM encrypted
 * at rest and is NEVER echoed back. Without this tool, an agent asked to "save
 * this to the vault" has no way to actually do it (and must say so).
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { siteLogins } from "../../../storage/schema.js";
import { encrypt } from "../../../utils/crypto.js";
import { and, eq, isNull, ilike } from "drizzle-orm";

export const loginSaveTool: Tool = {
    name: "login_save",
    source: "builtin",
    description:
        "Save (or update) a website login in the password vault — a label, the site/URL, username and password. The password is stored encrypted and is never shown again. " +
        "If a login with the same label already exists it is updated. By default the login is available to all agents; set agent_only to keep it to you.",
    parameters: {
        type: "object",
        properties: {
            label: { type: "string", description: "A short name for this login, e.g. 'PPADB tender portal'." },
            username: { type: "string", description: "The username / email for the login." },
            password: { type: "string", description: "The password to store (encrypted at rest; never echoed)." },
            site: { type: "string", description: "The site URL or domain this login is for." },
            notes: { type: "string", description: "Optional notes." },
            agent_only: { type: "boolean", description: "If true, only you can use this login; otherwise all agents can (default)." },
        },
        required: ["label", "username", "password"],
    },
    execute: async ({ tenantId, args }) => {
        const label = String(args?.label ?? "").trim();
        const username = String(args?.username ?? "").trim();
        const password = args?.password != null ? String(args.password) : "";
        if (!label || !username || !password) return { result: "A vault login needs a label, username and password." };

        const agentId = typeof args?._agentId === "string" ? args._agentId : null;
        const scopeAgentId = args?.agent_only === true ? agentId : null;

        const vals = {
            site: args?.site ? String(args.site).slice(0, 2000) : null,
            username: username.slice(0, 320),
            encryptedPassword: encrypt(password),
            notes: args?.notes ? String(args.notes).slice(0, 1000) : null,
            agentId: scopeAgentId,
            updatedAt: new Date(),
        };

        // Update an existing login with the same label (in this scope) rather than duplicating.
        const scope = scopeAgentId ? eq(siteLogins.agentId, scopeAgentId) : isNull(siteLogins.agentId);
        const existing = await db.select({ id: siteLogins.id }).from(siteLogins)
            .where(and(eq(siteLogins.tenantId, tenantId), ilike(siteLogins.label, label), scope)).limit(1);

        if (existing[0]) {
            await db.update(siteLogins).set(vals).where(eq(siteLogins.id, existing[0].id));
            return { result: `Updated vault login "${label}" (${username}). Password stored encrypted.` };
        }
        await db.insert(siteLogins).values({ tenantId, label: label.slice(0, 200), ...vals });
        return { result: `Saved "${label}" (${username}) to the vault${vals.site ? ` for ${vals.site}` : ""}. Password stored encrypted — I'll never show it back. Use login_list to see it or browser_login to sign in.` };
    },
};
