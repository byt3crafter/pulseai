/**
 * Microsoft OneDrive / Graph HTTP client.
 *
 * Unlike ERPNext's static API key, OneDrive uses OAuth2: short-lived access
 * tokens (~1h) obtained from a stored refresh token. We resolve credentials
 * from the vault, refresh the access token as needed (cached in-memory per
 * tenant/agent), and call Microsoft Graph with a Bearer token.
 *
 * Credentials (Dashboard > Settings > Credentials):
 *   MS_CLIENT_ID      — Azure app (client) ID
 *   MS_CLIENT_SECRET  — Azure app client secret
 *   MS_REFRESH_TOKEN  — OAuth refresh token (manual for now; OAuth connect later)
 *   MS_TENANT_ID      — Azure AD tenant id, or "common" (optional, default "common")
 *   MS_SCOPE          — OAuth scope (optional)
 *   MS_DRIVE          — base drive resource (optional, default "/me/drive")
 */

import { credentialVault } from "../../src/agent/tools/credential-vault.js";
import { logger } from "../../src/utils/logger.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TIMEOUT_MS = 30_000;

export interface GraphResult<T = any> { ok: true; data: T; }
export interface GraphError { ok: false; error: string; httpStatus?: number; }
export type GraphResponse<T = any> = GraphResult<T> | GraphError;

export interface OneDriveCredentials {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    tenant: string;
    scope: string;
    drivePath: string;
}

/** Resolve OneDrive credentials from the vault (per-agent overrides tenant-wide). */
export async function getOneDriveCredentials(tenantId: string, agentId?: string): Promise<OneDriveCredentials | null> {
    const env = await credentialVault.getEnvVars(tenantId, agentId);
    const clientId = env["MS_CLIENT_ID"];
    const clientSecret = env["MS_CLIENT_SECRET"];
    const refreshToken = env["MS_REFRESH_TOKEN"];
    if (!clientId || !clientSecret || !refreshToken) return null;
    return {
        clientId,
        clientSecret,
        refreshToken,
        tenant: env["MS_TENANT_ID"] || "common",
        scope: env["MS_SCOPE"] || "https://graph.microsoft.com/.default offline_access",
        drivePath: (env["MS_DRIVE"] || "/me/drive").replace(/\/+$/, ""),
    };
}

export const MISSING_CREDENTIALS_MSG =
    `OneDrive is not configured for this tenant. Add the following via Dashboard > Settings > Credentials:\n` +
    `- MS_CLIENT_ID (Azure app / client ID)\n` +
    `- MS_CLIENT_SECRET (Azure app client secret)\n` +
    `- MS_REFRESH_TOKEN (OAuth refresh token with Files.ReadWrite scope + offline_access)\n` +
    `- MS_TENANT_ID (optional; your Azure AD tenant id, or "common")\n\n` +
    `Register a free app in Microsoft Entra ID (Azure AD), grant Microsoft Graph Files.ReadWrite (+ offline_access), and obtain a refresh token.`;

interface TokenEntry { accessToken: string; exp: number; refreshToken: string; }
const tokenCache = new Map<string, TokenEntry>();

/** Get a valid Graph access token, refreshing via the refresh-token grant if needed. */
async function getAccessToken(
    tenantId: string,
    agentId: string | undefined,
    creds: OneDriveCredentials
): Promise<string | GraphError> {
    const key = `${tenantId}:${agentId || ""}:${creds.clientId}`;
    const now = Date.now();
    const cached = tokenCache.get(key);
    if (cached && cached.exp > now + 60_000) return cached.accessToken;

    const refreshToken = cached?.refreshToken || creds.refreshToken;
    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(creds.tenant)}/oauth2/v2.0/token`;
    const form = new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: creds.scope,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form.toString(),
            signal: controller.signal,
        });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok || !json.access_token) {
            const msg = json.error_description || json.error || res.statusText;
            logger.warn({ status: res.status, msg }, "OneDrive token refresh failed");
            return { ok: false, error: `OneDrive authentication failed (${res.status}): ${msg}`, httpStatus: res.status };
        }
        tokenCache.set(key, {
            accessToken: json.access_token,
            exp: now + Number(json.expires_in || 3600) * 1000,
            refreshToken: json.refresh_token || refreshToken,
        });
        return json.access_token as string;
    } catch (err: any) {
        if (err.name === "AbortError") return { ok: false, error: "OneDrive authentication timed out (30s)" };
        logger.error({ err }, "OneDrive token refresh error");
        return { ok: false, error: `OneDrive authentication failed: ${err.message}` };
    } finally {
        clearTimeout(timer);
    }
}

/** Make an authenticated Microsoft Graph request. */
export async function graphRequest<T = any>(
    tenantId: string,
    agentId: string | undefined,
    creds: OneDriveCredentials,
    method: string,
    path: string,
    opts: { query?: Record<string, string>; json?: any; rawBody?: string; contentType?: string; expectText?: boolean } = {}
): Promise<GraphResponse<T>> {
    const tok = await getAccessToken(tenantId, agentId, creds);
    if (typeof tok !== "string") return tok;

    const url = new URL(path.startsWith("http") ? path : GRAPH + path);
    if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${tok}`,
            Accept: "application/json",
        };
        const fetchOpts: RequestInit = { method, headers, signal: controller.signal };
        if (opts.json !== undefined) {
            headers["Content-Type"] = "application/json";
            fetchOpts.body = JSON.stringify(opts.json);
        } else if (opts.rawBody !== undefined) {
            headers["Content-Type"] = opts.contentType || "text/plain";
            fetchOpts.body = opts.rawBody;
        }

        const res = await fetch(url.toString(), fetchOpts);
        const ct = res.headers.get("content-type") || "";

        if (!res.ok) {
            const j: any = ct.includes("json") ? await res.json().catch(() => ({})) : {};
            const msg = j?.error?.message || (await res.text().catch(() => "")) || res.statusText;
            logger.warn({ status: res.status, path, msg }, "OneDrive API error");
            return { ok: false, error: `OneDrive error (${res.status}): ${msg}`, httpStatus: res.status };
        }

        if (opts.expectText || !ct.includes("json")) {
            return { ok: true, data: (await res.text()) as any };
        }
        return { ok: true, data: (await res.json().catch(() => ({}))) as T };
    } catch (err: any) {
        if (err.name === "AbortError") return { ok: false, error: "OneDrive request timed out (30s)" };
        logger.error({ err, path }, "OneDrive request failed");
        return { ok: false, error: `OneDrive request failed: ${err.message}` };
    } finally {
        clearTimeout(timer);
    }
}

/** Build a Graph drive-item resource segment from a path or item id. */
export function itemRef(creds: OneDriveCredentials, opts: { path?: string; item_id?: string }): string {
    const base = creds.drivePath; // e.g. /me/drive
    if (opts.item_id) return `${base}/items/${encodeURIComponent(opts.item_id)}`;
    const p = (opts.path || "").replace(/^\/+/, "").replace(/\/+$/, "");
    if (!p) return `${base}/root`;
    const enc = p.split("/").map(encodeURIComponent).join("/");
    return `${base}/root:/${enc}:`;
}
