"use server";

import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import { oauthClients, oauthCodes, oauthTokens, tenants } from "../../../storage/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

/**
 * Approve an OAuth request from an external CLI tool.
 * Generates an auth code and returns a redirect URL back to the CLI.
 */
export async function approveOAuthAction(params: {
    clientId: string;
    redirectUri: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
}) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { error: "Not authenticated" };
    }

    const tenantId = session.user.tenantId;

    const tenantConfig = await getTenantConfig(tenantId);
    if (!tenantConfig.enable_third_party_cli) {
        return { error: "Third-party CLI access is not enabled. Enable it in Settings > API & Developer." };
    }

    const client = await db.query.oauthClients.findFirst({
        where: eq(oauthClients.clientId, params.clientId),
    });

    if (!client) {
        return { error: "Unknown OAuth client." };
    }

    // Generate authorization code
    const code = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(oauthCodes).values({
        code,
        clientId: params.clientId,
        tenantId,
        redirectUri: params.redirectUri || null,
        codeChallenge: params.codeChallenge || null,
        codeChallengeMethod: params.codeChallengeMethod || null,
        expiresAt,
    });

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (params.state) {
        redirectUrl.searchParams.set("state", params.state);
    }

    return { redirectUrl: redirectUrl.toString() };
}

/**
 * Dashboard-initiated approval flow.
 * Generates an access token directly (no auth code round-trip) and returns it.
 */
export async function approveDirectAction(clientId: string) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { error: "Not authenticated" };
    }

    const tenantId = session.user.tenantId;

    const tenantConfig = await getTenantConfig(tenantId);
    if (!tenantConfig.enable_third_party_cli) {
        return { error: "Third-party CLI access is not enabled. Enable it in Settings > API & Developer." };
    }

    const client = await db.query.oauthClients.findFirst({
        where: eq(oauthClients.clientId, clientId),
    });

    if (!client) {
        return { error: "Unknown OAuth client." };
    }

    // Generate access token directly
    const accessToken = "pls_" + randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

    await db.insert(oauthTokens).values({
        accessToken,
        clientId,
        tenantId,
        expiresAt,
    });

    return {
        token: accessToken,
        expiresIn: "90 days",
    };
}

/**
 * Ensure the tenant has a "Pulse Dashboard" OAuth client for self-initiated flows.
 * Returns the client_id.
 */
export async function ensureDashboardClientAction() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { error: "Not authenticated" };
    }

    const tenantId = session.user.tenantId;

    // Check for existing dashboard client for this tenant
    let client = await db.query.oauthClients.findFirst({
        where: and(
            eq(oauthClients.tenantId, tenantId),
            eq(oauthClients.name, "Pulse Dashboard"),
        ),
    });

    if (!client) {
        const clientId = `pls_dash_${randomBytes(8).toString("hex")}`;
        const [created] = await db.insert(oauthClients).values({
            tenantId,
            clientId,
            clientSecretHash: "personal",
            name: "Pulse Dashboard",
            redirectUris: [],
        }).returning();
        client = created;
    }

    return { clientId: client.clientId };
}

/**
 * Generate a personal API token directly (no consent page needed).
 */
export async function generateApiTokenAction() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Not authenticated." };
    }

    const tenantId = session.user.tenantId;

    const tenantConfig = await getTenantConfig(tenantId);
    if (!tenantConfig.enable_third_party_cli) {
        return { success: false, message: "Enable CLI access first in the toggle above." };
    }

    // Ensure dashboard client exists
    const result = await ensureDashboardClientAction();
    if (result.error || !result.clientId) {
        return { success: false, message: result.error ?? "Failed to create client." };
    }

    const accessToken = "pls_" + randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    await db.insert(oauthTokens).values({
        accessToken,
        clientId: result.clientId,
        tenantId,
        expiresAt,
    });

    return {
        success: true,
        token: accessToken,
        expiresAt: expiresAt.toISOString(),
    };
}

// Helper
async function getTenantConfig(tenantId: string): Promise<Record<string, any>> {
    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
    });
    return (tenant?.config as Record<string, any>) || {};
}
