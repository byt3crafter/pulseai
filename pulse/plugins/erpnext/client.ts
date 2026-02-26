/**
 * ERPNext HTTP Client — handles authentication, requests, and error parsing.
 * Uses native fetch (Node 18+) with no external dependencies.
 */

import { credentialVault } from "../../src/agent/tools/credential-vault.js";
import { logger } from "../../src/utils/logger.js";

const TIMEOUT_MS = 30_000;

export interface ErpNextResult<T = any> {
    ok: true;
    data: T;
}

export interface ErpNextError {
    ok: false;
    error: string;
    httpStatus?: number;
}

export type ErpNextResponse<T = any> = ErpNextResult<T> | ErpNextError;

interface ErpNextCredentials {
    url: string;
    apiKey: string;
    apiSecret: string;
}

/**
 * Resolve ERPNext credentials from the credential vault for a tenant.
 * Expects: ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET
 */
export async function getErpNextCredentials(tenantId: string): Promise<ErpNextCredentials | null> {
    const envVars = await credentialVault.getEnvVars(tenantId);

    const url = envVars["ERPNEXT_URL"];
    const apiKey = envVars["ERPNEXT_API_KEY"];
    const apiSecret = envVars["ERPNEXT_API_SECRET"];

    if (!url || !apiKey || !apiSecret) {
        return null;
    }

    return {
        url: url.replace(/\/+$/, ""), // strip trailing slashes
        apiKey,
        apiSecret,
    };
}

export const MISSING_CREDENTIALS_MSG =
    `ERPNext is not configured for this tenant. Please add the following credentials via Dashboard > Settings > API Credentials:\n` +
    `- ERPNEXT_URL (e.g. https://mysite.erpnext.com)\n` +
    `- ERPNEXT_API_KEY\n` +
    `- ERPNEXT_API_SECRET\n\n` +
    `You can generate API keys in ERPNext under Settings > API Access.`;

/**
 * Parse ERPNext's _server_messages format (double-encoded JSON array of JSON strings).
 */
function parseServerMessages(raw: any): string {
    if (!raw) return "";
    try {
        const outer = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(outer)) {
            return outer
                .map((item: string) => {
                    try {
                        const parsed = JSON.parse(item);
                        return parsed.message || parsed;
                    } catch {
                        return item;
                    }
                })
                .join("; ");
        }
        return String(raw);
    } catch {
        return String(raw);
    }
}

/**
 * Make an authenticated request to the ERPNext API.
 */
export async function erpNextRequest<T = any>(
    creds: ErpNextCredentials,
    method: string,
    path: string,
    body?: Record<string, any>,
    query?: Record<string, string>
): Promise<ErpNextResponse<T>> {
    const url = new URL(path, creds.url);
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            url.searchParams.set(k, v);
        }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const headers: Record<string, string> = {
            Authorization: `token ${creds.apiKey}:${creds.apiSecret}`,
            Accept: "application/json",
        };

        const fetchOpts: RequestInit = {
            method,
            headers,
            signal: controller.signal,
        };

        if (body && method !== "GET") {
            headers["Content-Type"] = "application/json";
            fetchOpts.body = JSON.stringify(body);
        }

        const res = await fetch(url.toString(), fetchOpts);
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
            const serverMsg = parseServerMessages(json._server_messages);
            const exc = json.exc_type || json.exception || "";
            const fallback = json.message || json._error_message || res.statusText;
            const errorMsg = serverMsg || exc || fallback;

            logger.warn(
                { status: res.status, path, errorMsg },
                "ERPNext API error"
            );

            return {
                ok: false,
                error: `ERPNext error (${res.status}): ${errorMsg}`,
                httpStatus: res.status,
            };
        }

        return { ok: true, data: json.data ?? json.message ?? json };
    } catch (err: any) {
        if (err.name === "AbortError") {
            return { ok: false, error: "ERPNext request timed out (30s)" };
        }
        logger.error({ err, path }, "ERPNext request failed");
        return { ok: false, error: `ERPNext request failed: ${err.message}` };
    } finally {
        clearTimeout(timeout);
    }
}
