"use server";

import { db } from "../../../storage/db";
import { apiTokens } from "../../../storage/schema";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";
import { requireTenant } from "../../../utils/tenant-auth";

const WEBCHAT_TOKEN_NAME = "__webchat__";

/**
 * Mint a short-lived chat token for the browser to authenticate its WebSocket
 * to the gateway. Scoped to the caller's tenant (from session). Prunes the prior
 * web-chat token so we don't accumulate one per page load — there's only ever
 * one active browser-chat token per workspace.
 */
export async function getChatTokenAction() {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { ok: false as const, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    try {
        await db.delete(apiTokens).where(and(eq(apiTokens.tenantId, tenantId), eq(apiTokens.name, WEBCHAT_TOKEN_NAME)));
        const rawToken = `pulse-sk-${crypto.randomBytes(32).toString("hex")}`;
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        await db.insert(apiTokens).values({
            tenantId,
            tokenHash,
            name: WEBCHAT_TOKEN_NAME,
            scopes: ["chat"],
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12h
        });
        return { ok: true as const, token: rawToken };
    } catch (e) {
        console.error("Failed to mint chat token:", e);
        return { ok: false as const, message: "Could not start the assistant session." };
    }
}
