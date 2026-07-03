"use server";

import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "../../../storage/db";
import { tenants, tenantProviderKeys } from "../../../storage/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../utils/tenant-auth";
import { encrypt } from "../../../utils/crypto";

// OpenAI Codex CLI OAuth (PKCE) — public client, copy/paste callback flow.
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";
const PROVIDER = "chatgpt";

type Result = { success: boolean; message?: string; authUrl?: string };

function b64url(buf: Buffer): string {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function isEnabled(tenantId: string): Promise<boolean> {
    const [t] = await db.select({ config: tenants.config }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return !!(t?.config as any)?.chatgptConnectEnabled;
}

/** Start the flow: create PKCE + state, stash them in httpOnly cookies, return the auth URL. */
export async function startChatgptConnect(): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    if (!(await isEnabled(check.tenantId))) return { success: false, message: "ChatGPT Connect is not enabled for your workspace." };

    const verifier = b64url(crypto.randomBytes(64));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    const state = b64url(crypto.randomBytes(32));

    const jar = await cookies();
    const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
    jar.set("cg_oauth_verifier", verifier, opts);
    jar.set("cg_oauth_state", state, opts);

    const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPE,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        codex_cli_simplified_flow: "true",
        originator: "codex_cli_rs",
    });
    return { success: true, authUrl: `${AUTH_URL}?${params.toString()}` };
}

function decodeJwtAccountId(accessToken: string): string | null {
    try {
        const parts = accessToken.split(".");
        if (parts.length < 2) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        return payload?.["https://api.openai.com/auth"]?.chatgpt_account_id || null;
    } catch {
        return null;
    }
}

/** Finish the flow: user pastes the callback URL; validate state, exchange code, store tokens. */
export async function completeChatgptConnect(pastedUrl: string): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    if (!(await isEnabled(check.tenantId))) return { success: false, message: "ChatGPT Connect is not enabled for your workspace." };

    let code = "", state = "";
    try {
        const u = new URL(pastedUrl.trim());
        code = u.searchParams.get("code") || "";
        state = u.searchParams.get("state") || "";
    } catch {
        return { success: false, message: "That doesn't look like a valid URL. Paste the full callback URL." };
    }
    if (!code) return { success: false, message: "No authorization code found in that URL." };

    const jar = await cookies();
    const expectedState = jar.get("cg_oauth_state")?.value;
    const verifier = jar.get("cg_oauth_verifier")?.value;
    if (!verifier || !expectedState) return { success: false, message: "Your session expired — click Connect again to restart." };
    if (state !== expectedState) return { success: false, message: "State mismatch — please restart the connection." };

    let tokenData: any;
    try {
        const res = await fetch(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI,
                client_id: CLIENT_ID,
                code_verifier: verifier,
            }).toString(),
        });
        if (!res.ok) {
            console.error("ChatGPT token exchange failed:", res.status);
            return { success: false, message: "OpenAI rejected the connection. Please try again." };
        }
        tokenData = await res.json();
    } catch (e) {
        console.error("ChatGPT token exchange error:", e);
        return { success: false, message: "Could not reach OpenAI to complete the connection." };
    }

    const accessToken = tokenData.access_token || "";
    const refreshToken = tokenData.refresh_token || "";
    if (!accessToken) return { success: false, message: "OpenAI did not return an access token." };
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : null;
    const accountId = decodeJwtAccountId(accessToken);

    try {
        await db.insert(tenantProviderKeys)
            .values({
                tenantId: check.tenantId,
                provider: PROVIDER,
                authMethod: "oauth",
                oauthClientId: CLIENT_ID,
                oauthAccessTokenEnc: encrypt(accessToken),
                oauthRefreshTokenEnc: refreshToken ? encrypt(refreshToken) : null,
                oauthTokenExpiresAt: expiresAt,
                keyAlias: accountId || null,
                isActive: true,
                lastValidatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: [tenantProviderKeys.tenantId, tenantProviderKeys.provider],
                set: {
                    authMethod: "oauth",
                    oauthClientId: CLIENT_ID,
                    oauthAccessTokenEnc: encrypt(accessToken),
                    oauthRefreshTokenEnc: refreshToken ? encrypt(refreshToken) : null,
                    oauthTokenExpiresAt: expiresAt,
                    keyAlias: accountId || null,
                    isActive: true,
                    lastValidatedAt: new Date(),
                    updatedAt: new Date(),
                },
            });
    } catch (e) {
        console.error("Failed to store ChatGPT tokens:", e);
        return { success: false, message: "Connected, but saving the token failed. Please retry." };
    }

    jar.delete("cg_oauth_verifier");
    jar.delete("cg_oauth_state");
    revalidatePath("/dashboard/chatgpt");
    return { success: true, message: "ChatGPT account connected." };
}

export async function disconnectChatgpt(): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    try {
        await db.delete(tenantProviderKeys)
            .where(and(eq(tenantProviderKeys.tenantId, check.tenantId), eq(tenantProviderKeys.provider, PROVIDER)));
        revalidatePath("/dashboard/chatgpt");
        return { success: true, message: "Disconnected." };
    } catch (e) {
        console.error("Failed to disconnect ChatGPT:", e);
        return { success: false, message: "Could not disconnect." };
    }
}
