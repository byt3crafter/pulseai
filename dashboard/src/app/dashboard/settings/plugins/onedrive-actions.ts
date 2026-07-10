"use server";

import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../storage/db";
import { credentials } from "../../../../storage/schema";
import { decrypt } from "../../../../utils/crypto";
import { requireTenant } from "../../../../utils/tenant-auth";

const SCOPE = "Files.ReadWrite.All offline_access User.Read";
const REDIRECT =
    process.env.MS_OAUTH_REDIRECT_URI || "https://pulse.runstate.mu/api/gateway/plugins/onedrive/oauth/callback";

async function readCred(tenantId: string, name: string): Promise<string | null> {
    const row = await db.query.credentials.findFirst({
        where: and(eq(credentials.tenantId, tenantId), eq(credentials.name, name)),
    });
    if (!row?.encryptedValue) return null;
    try {
        return decrypt(row.encryptedValue);
    } catch {
        return null;
    }
}

/**
 * Build the Microsoft OAuth authorize URL for connecting OneDrive.
 * State is HMAC-signed with the shared ENCRYPTION_KEY so the gateway callback
 * can trust which tenant is connecting. Requires the app credentials
 * (MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT_ID) to already be stored.
 */
export async function getOneDriveConnectUrlAction(): Promise<{ success: boolean; url?: string; message?: string }> {
    const t = await requireTenant();
    if (!t.authorized) return { success: false, message: t.message };
    const tenantId = t.tenantId;

    const clientId = await readCred(tenantId, "MS_CLIENT_ID");
    const msTenant = (await readCred(tenantId, "MS_TENANT_ID")) || "common";
    if (!clientId) {
        return {
            success: false,
            message: "Add MS_CLIENT_ID, MS_CLIENT_SECRET and MS_TENANT_ID under Settings → Credentials first, then click Connect.",
        };
    }

    const exp = Date.now() + 10 * 60 * 1000; // 10-minute window
    const sig = crypto.createHmac("sha256", process.env.ENCRYPTION_KEY || "").update(`${tenantId}.${exp}`).digest("hex");
    const state = `${tenantId}.${exp}.${sig}`;

    const url =
        `https://login.microsoftonline.com/${encodeURIComponent(msTenant)}/oauth2/v2.0/authorize` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&response_type=code&response_mode=query` +
        `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
        `&scope=${encodeURIComponent(SCOPE)}` +
        `&state=${encodeURIComponent(state)}`;

    return { success: true, url };
}
