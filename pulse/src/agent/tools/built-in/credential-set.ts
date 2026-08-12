/**
 * credential_set — lets an agent store/update a tenant credential or API key
 * (to connect an integration like ERPNext, a webhook, a custom API, etc.).
 * The write counterpart to credential_list. Values are AES-256-GCM encrypted at
 * rest and NEVER echoed back. Names are normalized to UPPER_SNAKE_CASE, the same
 * as the dashboard's Settings → API Credentials.
 */

import { Tool } from "../tool.interface.js";
import { credentialVault } from "../credential-vault.js";

const TYPES = new Set(["api_key", "basic", "bearer", "oauth2"]);

export const credentialSetTool: Tool = {
    name: "credential_set",
    source: "builtin",
    description:
        "Store or update a tenant credential / API key so tools and integrations can use it (e.g. ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET, or any service key). " +
        "The value is encrypted and never shown again. For a service base URL, pass it as base_url. Use credential_list to see which names are set.",
    parameters: {
        type: "object",
        properties: {
            name: { type: "string", description: "Credential name, e.g. ERPNEXT_API_KEY (normalized to UPPER_SNAKE_CASE)." },
            value: { type: "string", description: "The secret value (encrypted at rest, never echoed)." },
            base_url: { type: "string", description: "Optional service base URL to attach (stored in metadata.baseUrl)." },
            description: { type: "string", description: "Optional human description of what this credential is for." },
            type: { type: "string", enum: ["api_key", "basic", "bearer", "oauth2"], description: "Credential type (default api_key)." },
        },
        required: ["name", "value"],
    },
    execute: async ({ tenantId, args }) => {
        const name = String(args?.name ?? "").trim();
        const value = args?.value != null ? String(args.value) : "";
        if (!name || !value) return { result: "Provide both a credential name and a value." };
        const metadata = args?.base_url ? { baseUrl: String(args.base_url).trim().replace(/\/+$/, "") } : undefined;
        try {
            await credentialVault.store(tenantId, name, value, {
                description: args?.description ? String(args.description).slice(0, 500) : undefined,
                type: TYPES.has(String(args?.type)) ? String(args.type) : undefined,
                metadata,
            });
        } catch (err: any) {
            return { result: `Could not store the credential: ${err?.message || "unknown error"}` };
        }
        const normalized = name.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        return { result: `Stored credential ${normalized} (value encrypted, hidden).${metadata ? ` URL: ${metadata.baseUrl}.` : ""} It's available to your tools now.` };
    },
};
