import { Tool } from "../../../src/agent/tools/tool.interface.js";
import { credentialVault } from "../../../src/agent/tools/credential-vault.js";
import { getErpNextCredentials, erpNextRequest } from "../client.js";

/**
 * erpnext_connect — store ERPNext URL + API key + secret AND verify the
 * connection actually works before reporting success. The credentials are
 * encrypted at rest and never echoed. A "connected" claim is only returned
 * after a live test call succeeds — so the agent can't falsely say it's set up.
 */
export const erpnextConnectTool: Tool = {
    name: "erpnext_connect",
    description:
        "Connect this workspace to ERPNext: store the site URL, API key and API secret, then VERIFY the connection with a live test call. " +
        "Only reports success if the test actually reaches ERPNext. Credentials are encrypted and never shown again.",
    parameters: {
        type: "object",
        properties: {
            url: { type: "string", description: "ERPNext site URL, e.g. https://erp.metcheck.co.bw" },
            api_key: { type: "string", description: "ERPNext API key (User → API Access)." },
            api_secret: { type: "string", description: "ERPNext API secret." },
        },
        required: ["url", "api_key", "api_secret"],
    },
    async execute({ tenantId, args }) {
        const url = String(args?.url ?? "").trim().replace(/\/+$/, "");
        const apiKey = String(args?.api_key ?? "").trim();
        const apiSecret = String(args?.api_secret ?? "").trim();
        if (!url || !apiKey || !apiSecret) return { result: "Provide the ERPNext url, api_key and api_secret." };

        try {
            await credentialVault.store(tenantId, "ERPNEXT_URL", url);
            await credentialVault.store(tenantId, "ERPNEXT_API_KEY", apiKey);
            await credentialVault.store(tenantId, "ERPNEXT_API_SECRET", apiSecret);
        } catch (err: any) {
            return { result: `Could not store the ERPNext credentials: ${err?.message || "unknown error"}` };
        }

        const creds = await getErpNextCredentials(tenantId, typeof args?._agentId === "string" ? args._agentId : undefined);
        if (!creds) return { result: "Saved the ERPNext credentials, but could not read them back to verify. Check them and try again." };

        const res = await erpNextRequest(creds, "GET", "/api/resource/Company", undefined, { limit_page_length: "1" });
        if (!res.ok) {
            return { result: `Saved the credentials, but the ERPNext test call FAILED: ${res.error}. Double-check the URL, key and secret, and that the API user has access. Not connected yet.` };
        }
        const companies = Array.isArray(res.data) ? res.data.map((c: any) => c?.name).filter(Boolean) : [];
        return { result: `ERPNext connected and VERIFIED ✓ — reached ${url}${companies.length ? ` (company: ${companies[0]})` : ""}. Credentials stored encrypted. The erpnext_* tools are ready to use.` };
    },
};
