/**
 * WebSocket Auth — shared auth utilities for WS connections.
 * Supports api_tokens and oauth_tokens tables.
 */

import { hashToken } from "../middleware/api-token-auth.js";
import { db } from "../../storage/db.js";
import { apiTokens, oauthTokens } from "../../storage/schema.js";
import { eq } from "drizzle-orm";

export interface WsAuthResult {
    tenantId: string;
    scopes: string[];
    authType: "api_token" | "oauth_token";
}

export async function authenticateWsToken(token: string): Promise<WsAuthResult | null> {
    // Try API tokens first
    try {
        const tokenHash = hashToken(token);
        const apiRecord = await db.query.apiTokens.findFirst({
            where: eq(apiTokens.tokenHash, tokenHash),
        });

        if (apiRecord) {
            if (apiRecord.expiresAt && new Date(apiRecord.expiresAt) < new Date()) return null;
            return {
                tenantId: apiRecord.tenantId,
                scopes: apiRecord.scopes || ["chat", "responses"],
                authType: "api_token",
            };
        }
    } catch {}

    // Try OAuth tokens
    try {
        const oauthRecord = await db.query.oauthTokens.findFirst({
            where: eq(oauthTokens.accessToken, token),
        });

        if (oauthRecord) {
            if (new Date(oauthRecord.expiresAt) < new Date()) return null;
            return {
                tenantId: oauthRecord.tenantId,
                scopes: ["chat", "responses"],
                authType: "oauth_token",
            };
        }
    } catch {}

    return null;
}
