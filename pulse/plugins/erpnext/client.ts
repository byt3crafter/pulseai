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
export async function getErpNextCredentials(tenantId: string, agentId?: string): Promise<ErpNextCredentials | null> {
    // Per-agent credentials (Settings → Credentials → Agent Scope) override
    // the tenant-wide ERPNext key, so each agent can be its own ERPNext user.
    const envVars = await credentialVault.getEnvVars(tenantId, agentId);

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

/**
 * Extra whitelisted server methods this tenant has declared as safe for agents
 * (e.g. a custom addon method that returns a public/guest document link).
 * Set as the credential ERPNEXT_ALLOWED_METHODS — comma- or newline-separated
 * fully-qualified method names. Nothing is hardcoded; each instance opts in.
 */
export async function getErpNextAllowedMethods(tenantId: string, agentId?: string): Promise<string[]> {
    const envVars = await credentialVault.getEnvVars(tenantId, agentId);
    const raw = envVars["ERPNEXT_ALLOWED_METHODS"];
    if (!raw) return [];
    return raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
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
                error: `Error: ERPNext (${res.status}) — ${errorMsg}`,
                httpStatus: res.status,
            };
        }

        return { ok: true, data: json.data ?? json.message ?? json };
    } catch (err: any) {
        if (err.name === "AbortError") {
            return { ok: false, error: "Error: ERPNext request timed out (30s)" };
        }
        logger.error({ err, path }, "ERPNext request failed");
        return { ok: false, error: `Error: ERPNext request failed: ${err.message}` };
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Filters the model writes as `status = Draft|Submitted|Cancelled` mean the
 * workflow state, which on submittable doctypes (Journal Entry, Payment Entry,
 * Stock Entry…) is `docstatus` 0/1/2 — many of them have no `status` column at
 * all and ERPNext rejects the query with "Field not permitted in query: status".
 * Rewrite those three values to docstatus (identical meaning on doctypes that DO
 * have a status column); any other status value is a real one and passes through.
 */
const DOCSTATUS_BY_WORD: Record<string, number> = { draft: 0, submitted: 1, cancelled: 2, canceled: 2 };
export function normalizeListFilters(filters: unknown): unknown {
    if (!Array.isArray(filters)) return filters;
    return filters.map((f) => {
        if (!Array.isArray(f) || f.length < 3) return f;
        // Both [field, op, value] and the 4-tuple [doctype, field, op, value] shapes.
        const i = f.length >= 4 ? 1 : 0;
        if (String(f[i]).toLowerCase() !== "status") return f;
        const op = String(f[i + 1]);
        const val = f[i + 2];
        const map = (v: unknown) => DOCSTATUS_BY_WORD[String(v).trim().toLowerCase()];
        if (Array.isArray(val) && /^(not )?in$/i.test(op)) {
            const mapped = val.map(map);
            if (mapped.some((m) => m === undefined)) return f;
            const out = [...f]; out[i] = "docstatus"; out[i + 2] = mapped; return out;
        }
        const m = map(val);
        if (m === undefined) return f;
        const out = [...f]; out[i] = "docstatus"; out[i + 2] = m; return out;
    });
}

/**
 * When ERPNext refuses a field ("Field not permitted in query: X"), fetch the
 * doctype's real field list so the model can correct itself in one step
 * instead of guessing. Best-effort — the original error is returned untouched
 * if the meta call fails.
 */
export async function describeQueryFieldError(creds: ErpNextCredentials, doctype: string, error: string): Promise<string> {
    if (!/Field not permitted in query/i.test(error)) return error;
    const meta = await erpNextRequest<any>(creds, "GET", "/api/method/frappe.desk.form.load.getdoctype", undefined, { doctype });
    if (!meta.ok) return error;
    const raw = meta.data?.docs ?? meta.data;
    const docs: any[] = Array.isArray(raw) ? raw : [];
    const main = docs.find((d) => d?.name === doctype);
    if (!main || !Array.isArray(main.fields)) return error;
    const names = main.fields
        .filter((fd: any) => fd?.fieldname && !/^(Section Break|Column Break|Tab Break|HTML|Button|Table|Table MultiSelect)$/.test(fd.fieldtype))
        .map((fd: any) => fd.fieldname);
    const std = ["name", "docstatus", "creation", "modified", "owner"];
    return `${error}. Valid ${doctype} fields: ${[...std, ...names].join(", ")}. ` +
        `Draft/Submitted/Cancelled is docstatus 0/1/2 (there is no "status" column on this doctype).`;
}

/**
 * Journal Entry rows: ERPNext recomputes the read-only `debit`/`credit` columns
 * from `debit_in_account_currency`/`credit_in_account_currency` on save, so a
 * payload that only sets `debit`/`credit` is silently zeroed and rejected with
 * "Row 1: Both Debit and Credit values cannot be zero". Copy the plain amounts
 * across when the *_in_account_currency fields are missing so either spelling
 * works. Everything else passes through untouched.
 */
export function normalizeDocPayload(doctype: string, data: Record<string, any>): Record<string, any> {
    if (doctype !== "Journal Entry" || !Array.isArray(data?.accounts)) return data;
    const accounts = data.accounts.map((row: any) => {
        if (!row || typeof row !== "object") return row;
        const out = { ...row };
        for (const side of ["debit", "credit"] as const) {
            const acc = `${side}_in_account_currency`;
            if (out[acc] == null && out[side] != null) out[acc] = Number(out[side]);
            else if (out[acc] != null) out[acc] = Number(out[acc]);
        }
        return out;
    });
    return { ...data, accounts };
}
