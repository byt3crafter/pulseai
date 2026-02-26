"use server";

import { db } from "../../../../storage/db";
import { credentials, agentProfiles } from "../../../../storage/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../../utils/tenant-auth";

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

    return db.query.credentials.findMany({
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
        },
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
    const tenantCheck = await requireTenant();
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

        await db
            .insert(credentials)
            .values({
                tenantId,
                name,
                encryptedValue: encrypt(value),
                description: description || null,
                credentialType: credentialType || "api_key",
                agentId: agentId || null,
                metadata,
            })
            .onConflictDoUpdate({
                target: [credentials.tenantId, credentials.name],
                set: {
                    encryptedValue: encrypt(value),
                    description: description || null,
                    credentialType: credentialType || "api_key",
                    agentId: agentId || null,
                    metadata,
                    updatedAt: new Date(),
                },
            });

        revalidatePath("/dashboard/settings/credentials");
    } catch (error) {
        console.error("Failed to add credential:", error);
    }
}

export async function deleteCredential(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return;

    try {
        const credentialId = formData.get("credentialId") as string;
        await db.delete(credentials).where(eq(credentials.id, credentialId));
        revalidatePath("/dashboard/settings/credentials");
    } catch (error) {
        console.error("Failed to delete credential:", error);
    }
}
