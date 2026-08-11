import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { getExistingPage, ACTION_TIMEOUT_MS } from "../client.js";
import { db } from "../../../src/storage/db.js";
import { siteLogins } from "../../../src/storage/schema.js";
import { decrypt } from "../../../src/utils/crypto.js";
import { and, eq, or, isNull, ilike } from "drizzle-orm";

/**
 * browser_login — sign into the current page with a saved login.
 * The password is decrypted and filled SERVER-SIDE; it never enters the model's
 * context (the model only knows the login's label + username). Scoped to logins
 * that are unassigned or assigned to this agent.
 */
export const browserLoginTool: Tool = {
    name: "browser_login",
    description:
        "Sign in to the current page using a saved login (see login_list). Provide the login's label plus CSS selectors " +
        "for the username and password fields, and optionally a submit button. The saved password is filled securely and " +
        "is never revealed to you. Requires an active browser session — call browser_navigate to the login page first.",
    parameters: {
        type: "object",
        properties: {
            login: { type: "string", description: "Label of the saved login to use (from login_list)." },
            username_selector: { type: "string", description: "CSS selector of the username/email field." },
            password_selector: { type: "string", description: "CSS selector of the password field." },
            submit_selector: { type: "string", description: "Optional CSS selector of the submit/login button." },
        },
        required: ["login", "username_selector", "password_selector"],
    },
    async execute({ tenantId, conversationId, args }) {
        try {
            const sessionKey = (args._agentId as string) || conversationId;
            const agentId = typeof args._agentId === "string" ? args._agentId : null;
            const label = String(args.login || "").trim();
            if (!label) return { result: JSON.stringify({ error: "Provide the login label (see login_list)." }) };

            const scope = agentId
                ? or(isNull(siteLogins.agentId), eq(siteLogins.agentId, agentId))
                : isNull(siteLogins.agentId);
            const rows = await db.select().from(siteLogins)
                .where(and(eq(siteLogins.tenantId, tenantId), ilike(siteLogins.label, label), scope))
                .limit(3);
            if (rows.length === 0) return { result: JSON.stringify({ error: `No saved login called "${label}". Use login_list to see what's available.` }) };
            if (rows.length > 1) return { result: JSON.stringify({ error: `"${label}" matches multiple logins — use the exact label.` }) };

            const login = rows[0];
            let password: string;
            try { password = decrypt(login.encryptedPassword); }
            catch { return { result: JSON.stringify({ error: "Could not decrypt the stored password." }) }; }

            const page = getExistingPage(tenantId, sessionKey);
            await page.fill(String(args.username_selector), login.username, { timeout: ACTION_TIMEOUT_MS });
            await page.fill(String(args.password_selector), password, { timeout: ACTION_TIMEOUT_MS });
            password = ""; // drop it

            let submitted = false;
            if (args.submit_selector) {
                await page.click(String(args.submit_selector), { timeout: ACTION_TIMEOUT_MS });
                await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
                submitted = true;
            }
            // Never return the password.
            return { result: JSON.stringify({ ok: true, login: login.label, username: login.username, submitted, url: page.url() }) };
        } catch (err: any) {
            return { result: JSON.stringify({ error: err?.message || "Login failed" }) };
        }
    },
};
