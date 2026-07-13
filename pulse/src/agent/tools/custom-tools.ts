/**
 * Custom tools — per-tenant HTTP tools that connect a customer's own API/software.
 *
 * Each `custom_tools` row becomes an agent Tool at runtime: the LLM sees its name +
 * description + parameter schema, and calling it performs the configured HTTP request
 * (with {param} substitution into the URL/body). Auth headers are decrypted per call.
 * Hardened with an SSRF guard, a timeout, and a response-size cap.
 */
import { Tool } from "./tool.interface.js";
import { db } from "../../storage/db.js";
import { customTools } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { decrypt } from "../../utils/crypto.js";
import { logger } from "../../utils/logger.js";
import { assertSafeUrl, safeFetch } from "../../utils/ssrf.js";

// Re-exported for the playwright plugin, which imports assertSafeUrl from here.
export { assertSafeUrl } from "../../utils/ssrf.js";

const MAX_RESPONSE_CHARS = 20_000;

export interface CustomToolRow {
    id: string;
    name: string;
    description: string;
    method: string;
    urlTemplate: string;
    headersEnc: string | null;
    bodyTemplate: string | null;
    paramSchema: any;
    timeoutMs: number;
}

/** Replace {param} placeholders; `encode` for URL path segments. */
function substitute(template: string, args: Record<string, any>, encode: boolean, used: Set<string>): string {
    return template.replace(/\{(\w+)\}/g, (_m, key) => {
        used.add(key);
        const v = args[key];
        if (v === undefined || v === null) return "";
        const s = typeof v === "string" ? v : JSON.stringify(v);
        return encode ? encodeURIComponent(s) : s;
    });
}

export function createCustomTool(row: CustomToolRow): Tool {
    const schema = (row.paramSchema && typeof row.paramSchema === "object") ? row.paramSchema : {};
    return {
        name: row.name,
        description: row.description,
        parameters: {
            type: "object",
            properties: (schema.properties as Record<string, any>) || {},
            required: (schema.required as string[]) || [],
        },
        async execute({ args, tenantId }) {
            try {
                const cleanArgs: Record<string, any> = { ...args };
                delete cleanArgs._agentId;

                const used = new Set<string>();
                const urlStr = substitute(row.urlTemplate, cleanArgs, true, used);
                const url = assertSafeUrl(urlStr);

                // Static/auth headers (decrypted)
                const headers: Record<string, string> = {};
                if (row.headersEnc) {
                    try {
                        const parsed = JSON.parse(decrypt(row.headersEnc));
                        for (const [k, v] of Object.entries(parsed)) headers[k] = String(v);
                    } catch {
                        logger.warn({ toolName: row.name, tenantId }, "Failed to decrypt custom tool headers");
                    }
                }

                const method = (row.method || "GET").toUpperCase();
                const hasBody = method === "POST" || method === "PUT" || method === "PATCH";

                // Args not consumed by the URL: query string (no body) or JSON body.
                const leftover: Record<string, any> = {};
                for (const [k, v] of Object.entries(cleanArgs)) if (!used.has(k)) leftover[k] = v;

                let body: string | undefined;
                if (hasBody) {
                    if (row.bodyTemplate) {
                        body = substitute(row.bodyTemplate, cleanArgs, false, used);
                    } else {
                        body = JSON.stringify(leftover);
                    }
                    if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
                        headers["Content-Type"] = "application/json";
                    }
                } else {
                    for (const [k, v] of Object.entries(leftover)) {
                        url.searchParams.append(k, typeof v === "string" ? v : JSON.stringify(v));
                    }
                }

                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), Math.min(row.timeoutMs || 15000, 30000));
                let res: Response;
                try {
                    // safeFetch re-checks the resolved IP and every redirect hop.
                    res = await safeFetch(url.toString(), { method, headers, body, signal: controller.signal });
                } finally {
                    clearTimeout(timer);
                }

                const text = await res.text();
                const clipped = text.length > MAX_RESPONSE_CHARS
                    ? text.slice(0, MAX_RESPONSE_CHARS) + `\n…[truncated ${text.length - MAX_RESPONSE_CHARS} chars]`
                    : text;
                return { result: `HTTP ${res.status} ${res.statusText}\n${clipped}` };
            } catch (err: any) {
                const msg = err?.name === "AbortError" ? "request timed out" : (err?.message || "request failed");
                return { result: `Custom tool "${row.name}" error: ${msg}` };
            }
        },
    };
}

/** Load a tenant's enabled custom tools as agent Tools, scoped to the given agent. */
export async function getTenantCustomTools(tenantId: string, agentProfileId?: string): Promise<Tool[]> {
    try {
        const rows = await db
            .select()
            .from(customTools)
            .where(and(eq(customTools.tenantId, tenantId), eq(customTools.enabled, true)));
        return rows
            .filter((r) => {
                const allowed = Array.isArray(r.allowedAgentIds) ? (r.allowedAgentIds as string[]) : [];
                // Empty = available to all agents; otherwise only the listed agents.
                return allowed.length === 0 || (agentProfileId ? allowed.includes(agentProfileId) : false);
            })
            .map((r) => createCustomTool(r as unknown as CustomToolRow));
    } catch (err) {
        logger.error({ err, tenantId }, "Failed to load custom tools");
        return [];
    }
}
