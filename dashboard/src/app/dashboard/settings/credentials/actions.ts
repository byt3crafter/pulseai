"use server";

import { db } from "../../../../storage/db";
import { credentials, agentProfiles } from "../../../../storage/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../../utils/tenant-auth";
import { logAudit } from "../../../../utils/audit";
import { decrypt as sharedDecrypt } from "../../../../utils/crypto";

// Re-implement encrypt/decrypt for dashboard (uses same ENCRYPTION_KEY)
import { createCipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length !== 64) throw new Error("ENCRYPTION_KEY must be 64-char hex");
    return Buffer.from(key, "hex");
}

function encrypt(plaintext: string): string {
    if (!plaintext) return "";
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export async function getCredentials(tenantId: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    if (tenantId !== tenantCheck.tenantId) return [];

    /*
     * `healthy` says whether the stored secret can actually be decrypted with
     * the current ENCRYPTION_KEY. A row showing "Configured" while its value is
     * undecryptable is exactly the trap that a key rotation creates — the UI
     * has to be able to say "this needs re-entering" instead of lying. We fetch
     * encryptedValue only to test it and NEVER return it to the browser.
     */
    const rows = await db.query.credentials.findMany({
        where: eq(credentials.tenantId, tenantCheck.tenantId),
        columns: {
            id: true,
            name: true,
            description: true,
            credentialType: true,
            agentId: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
            encryptedValue: true,
        },
    });
    return rows.map(({ encryptedValue, ...rest }) => {
        let healthy = true;
        try {
            if (encryptedValue) sharedDecrypt(encryptedValue);
        } catch {
            healthy = false;
        }
        return { ...rest, healthy };
    });
}

export async function getTenantAgents(tenantId: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    if (tenantId !== tenantCheck.tenantId) return [];

    return db.query.agentProfiles.findMany({
        where: eq(agentProfiles.tenantId, tenantCheck.tenantId),
        columns: { id: true, name: true },
    });
}

export async function addCredential(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.credentials.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    try {
        const name = (formData.get("name") as string).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        const value = formData.get("value") as string;
        const description = formData.get("description") as string;
        const credentialType = formData.get("credentialType") as string;
        const agentId = formData.get("agentId") as string || null;
        const baseUrl = formData.get("baseUrl") as string;

        const metadata: Record<string, any> = {};
        if (baseUrl) metadata.baseUrl = baseUrl;

        /*
         * Manual upsert, keyed on (tenant, name, agentScope). The old
         * onConflictDoUpdate targeted (tenant, name), which after migration
         * 0050 is no longer a single constraint — the same name can now exist
         * once tenant-wide and once per agent. So we find the row for THIS
         * scope and update it, else insert.
         */
        const scope = agentId || null;
        const existing = (await db
            .select({ id: credentials.id })
            .from(credentials)
            .where(and(
                eq(credentials.tenantId, tenantId),
                eq(credentials.name, name),
                scope === null ? isNull(credentials.agentId) : eq(credentials.agentId, scope),
            ))
            .limit(1))[0];

        const payload = {
            encryptedValue: encrypt(value),
            description: description || null,
            credentialType: credentialType || "api_key",
            agentId: scope,
            metadata,
            updatedAt: new Date(),
        };
        if (existing) {
            await db.update(credentials).set(payload).where(eq(credentials.id, existing.id));
        } else {
            await db.insert(credentials).values({ tenantId, name, ...payload });
        }

        await logAudit({
            action: "tenant.credential.add",
            targetType: "credential",
            targetId: name,
            tenantId,
            summary: `Added credential ${name}`,
            metadata: { name },
        });

        revalidatePath("/dashboard/settings/credentials");
        revalidatePath("/dashboard/settings");
    } catch (error) {
        console.error("Failed to add credential:", error);
    }
}

/**
 * Clear (disconnect) all credential rows a plugin uses, by their env-var names.
 * Lets the user remove a plugin integration in one click — savePluginCredentials
 * can only add/keep, never delete. Names are matched case-insensitively (stored
 * uppercased). Because credential names are unique per tenant (not per plugin),
 * the caller's confirm UI should note a shared-name credential is fully removed.
 */
export async function clearPluginCredentialsAction(names: string[]) {
    const tenantCheck = await requireTenant("tenant.settings.write");
    if (!tenantCheck.authorized) return { success: false as const, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const wanted = (names || []).map((n) => (n || "").toUpperCase()).filter(Boolean);
    if (wanted.length === 0) return { success: false as const, message: "Nothing to clear." };

    try {
        await db.delete(credentials).where(and(eq(credentials.tenantId, tenantId), inArray(credentials.name, wanted)));

        await logAudit({
            action: "tenant.credential.clear",
            targetType: "credential",
            tenantId,
            summary: `Cleared ${wanted.length} credential(s)`,
            metadata: { names: wanted },
        });

        revalidatePath("/dashboard/settings/plugins");
        revalidatePath("/dashboard/settings");
        return { success: true as const };
    } catch (error) {
        console.error("Failed to clear plugin credentials:", error);
        return { success: false as const, message: "Could not clear these credentials." };
    }
}

export async function deleteCredential(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.credentials.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    try {
        const credentialId = formData.get("credentialId") as string;
        await db.delete(credentials).where(and(eq(credentials.id, credentialId), eq(credentials.tenantId, tenantId)));

        await logAudit({
            action: "tenant.credential.delete",
            targetType: "credential",
            targetId: credentialId,
            tenantId,
            summary: "Deleted credential",
            metadata: { credentialId },
        });

        revalidatePath("/dashboard/settings/credentials");
        revalidatePath("/dashboard/settings");
    } catch (error) {
        console.error("Failed to delete credential:", error);
    }
}
