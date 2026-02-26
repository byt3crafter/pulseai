/**
 * Vault tool — lets agents list available credentials (names only, never values).
 * Agents reference credentials by name as environment variables in code execution.
 */

import { Tool } from "../tool.interface.js";
import { credentialVault } from "../credential-vault.js";

export const credentialListTool: Tool = {
    name: "credential_list",
    description:
        "List available API credentials for this tenant. Returns names and descriptions only (never actual values). " +
        "Use the credential names as environment variable references in Python code: os.environ['KEY_NAME']. " +
        "Credentials are automatically injected when running python_execute or exec tools.",
    parameters: {
        type: "object",
        properties: {},
        required: [],
    },
    execute: async ({ tenantId }) => {
        const creds = await credentialVault.list(tenantId);

        if (creds.length === 0) {
            return {
                result: "No API credentials configured. Ask the tenant admin to add credentials in Dashboard > Settings > API Credentials.",
            };
        }

        const lines = creds.map((c) => {
            const scope = c.agentId ? "(agent-specific)" : "(all agents)";
            const urlNote = c.metadata?.baseUrl ? ` | URL env var: ${c.name}_URL` : "";
            return `- ${c.name} [${c.type}] ${scope}: ${c.description || "No description"}${urlNote}`;
        });

        return {
            result: `Available credentials (use as env vars in code):\n${lines.join("\n")}`,
        };
    },
};
