/**
 * pulse_help — an honest, live overview of what THIS workspace can do right now:
 * which integrations are connected, what's configured, and what still needs
 * setting up. Lets the agent answer "what can you do?" / "what do you need from
 * me?" accurately for a non-technical user instead of guessing.
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { channelConnections, installedPlugins, tenantSkills } from "../../../storage/schema.js";
import { and, eq } from "drizzle-orm";
import { credentialVault } from "../credential-vault.js";
import { isPluginEnabledForTenant } from "../../../plugins/tenant-access.js";

export const pulseHelpTool: Tool = {
    name: "pulse_help",
    source: "builtin",
    description:
        "Show what this workspace can do right now — connected integrations, what's configured, and what still needs setup. " +
        "Use it to answer 'what can you do?' or 'what do you need from me?' accurately, or before telling the user something isn't set up.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async ({ tenantId }) => {
        const lines: string[] = [];

        // Email
        try {
            const emailConn = await db.query.channelConnections.findFirst({
                where: and(eq(channelConnections.tenantId, tenantId), eq(channelConnections.channelType, "email")),
            });
            const cfg = emailConn?.channelConfig as any;
            if (cfg?.smtp?.host) {
                lines.push(`- Email: configured (send${cfg?.imap?.host ? " + read" : " only — no IMAP, can't read inbox"}) via ${cfg.smtp.host}`);
            } else {
                lines.push("- Email: NOT configured — I can set it up (email_configure) or you can in Settings → Email");
            }
        } catch { lines.push("- Email: status unavailable"); }

        // Credentials / ERPNext
        let credNames = new Set<string>();
        try {
            const creds = await credentialVault.list(tenantId);
            credNames = new Set(creds.map((c) => c.name));
        } catch { /* ignore */ }
        const erpnextSet = credNames.has("ERPNEXT_URL") && credNames.has("ERPNEXT_API_KEY") && credNames.has("ERPNEXT_API_SECRET");
        lines.push(`- ERPNext: ${erpnextSet ? "credentials set — erpnext_* tools available (erpnext_connect re-verifies)" : "NOT connected — I can connect it with erpnext_connect (needs URL, API key, API secret)"}`);
        const otherCreds = [...credNames].filter((n) => !n.startsWith("ERPNEXT_"));
        if (otherCreds.length) lines.push(`- Other credentials set: ${otherCreds.join(", ")}`);

        // Plugins enabled for this tenant
        try {
            const plugins = await db.select({ name: installedPlugins.name }).from(installedPlugins);
            const enabled: string[] = [];
            for (const p of plugins) {
                if (await isPluginEnabledForTenant(p.name, tenantId)) enabled.push(p.name);
            }
            lines.push(`- Integrations/plugins enabled: ${enabled.length ? enabled.join(", ") : "none"}`);
        } catch { lines.push("- Plugins: status unavailable"); }

        // Tools enabled
        try {
            const skills = await db.select({ name: tenantSkills.skillName }).from(tenantSkills)
                .where(and(eq(tenantSkills.tenantId, tenantId), eq(tenantSkills.enabled, true)));
            lines.push(`- Tools enabled for me: ${skills.length}`);
        } catch { /* ignore */ }

        return {
            result:
                `What this workspace can do right now:\n${lines.join("\n")}\n\n` +
                "To enable more tools: Dashboard → Settings → Workspace Tools. " +
                "I can set up integrations myself if you give me the details (e.g. \"connect ERPNext\", \"configure my email\", \"save this login to the vault\").",
        };
    },
};
