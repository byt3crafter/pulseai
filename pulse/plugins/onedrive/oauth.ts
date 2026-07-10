/**
 * OneDrive OAuth callback (one-click Connect).
 *
 * The dashboard sends the user to Microsoft's authorize URL with a signed
 * `state` (HMAC over tenantId with the shared ENCRYPTION_KEY). Microsoft
 * redirects back here with a `code`; we verify state, exchange the code for a
 * refresh token, and store it in the vault as MS_REFRESH_TOKEN for that tenant.
 */

import crypto from "crypto";
import { credentialVault } from "../../src/agent/tools/credential-vault.js";
import { logger } from "../../src/utils/logger.js";

const SCOPE = "Files.ReadWrite.All offline_access User.Read";
const DEFAULT_REDIRECT = "https://pulse.runstate.mu/api/gateway/plugins/onedrive/oauth/callback";

function redirectUri(): string {
    return process.env.MS_OAUTH_REDIRECT_URI || DEFAULT_REDIRECT;
}

function dashboardBase(): string {
    try { return new URL(redirectUri()).origin; } catch { return "https://pulse.runstate.mu"; }
}

/** Verify the signed state param → tenantId (or null if invalid/expired). */
export function verifyState(state: string | undefined): string | null {
    if (!state) return null;
    const parts = state.split(".");
    if (parts.length !== 3) return null;
    const [tenantId, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!tenantId || !exp || Number.isNaN(exp) || Date.now() > exp) return null;
    const expected = crypto.createHmac("sha256", process.env.ENCRYPTION_KEY || "").update(`${tenantId}.${expStr}`).digest("hex");
    if (sig.length !== expected.length) return null;
    try {
        if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
    } catch { return null; }
    return tenantId;
}

export async function handleOneDriveCallback(request: any, reply: any) {
    const q = request.query || {};
    const base = dashboardBase();
    const fail = (msg: string) =>
        reply.redirect(`${base}/dashboard/settings/plugins?onedrive=error&reason=${encodeURIComponent(String(msg).slice(0, 200))}`);

    if (q.error) return fail(q.error_description || q.error);
    const tenantId = verifyState(q.state);
    if (!tenantId) return fail("Invalid or expired connection request. Please try Connect again.");
    if (!q.code) return fail("No authorization code returned by Microsoft.");

    const env = await credentialVault.getEnvVars(tenantId);
    const clientId = env["MS_CLIENT_ID"];
    const clientSecret = env["MS_CLIENT_SECRET"];
    const tenant = env["MS_TENANT_ID"] || "common";
    if (!clientId || !clientSecret) return fail("OneDrive app credentials (MS_CLIENT_ID / MS_CLIENT_SECRET) are not configured.");

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
    const form = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: String(q.code),
        redirect_uri: redirectUri(),
        scope: SCOPE,
    });

    try {
        const res = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form.toString(),
        });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok || !json.refresh_token) {
            logger.warn({ status: res.status, err: json.error, desc: json.error_description }, "OneDrive OAuth token exchange failed");
            return fail(json.error_description || json.error || "Token exchange with Microsoft failed.");
        }
        await credentialVault.store(tenantId, "MS_REFRESH_TOKEN", json.refresh_token, {
            type: "oauth2",
            description: "OneDrive OAuth (connected)",
        });
        logger.info({ tenantId }, "OneDrive connected via OAuth");
        return reply.redirect(`${base}/dashboard/settings/plugins?onedrive=connected`);
    } catch (err: any) {
        logger.error({ err }, "OneDrive OAuth callback error");
        return fail("Could not complete the connection. Please try again.");
    }
}

export { SCOPE, redirectUri };
