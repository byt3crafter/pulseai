"use server";

import { and, eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../../storage/db";
import { siteLogins } from "../../../storage/schema";
import { requireTenant } from "../../../utils/tenant-auth";
import { logAudit } from "../../../utils/audit";

// Re-implement encrypt for dashboard (uses same ENCRYPTION_KEY) — mirrors
// dashboard/src/app/dashboard/settings/credentials/actions.ts. Never wire up
// a decrypt() here: this vault's passwords are write-only from the UI's
// perspective and are only ever decrypted by the agent runtime.
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

export interface LoginRow {
    id: string;
    label: string;
    site: string | null;
    username: string;
    agentId: string | null;
    notes: string | null;
    updatedAt: Date | null;
}

/** List the tenant's saved logins. NEVER selects encryptedPassword. Returns [] on auth failure. */
export async function getLogins(): Promise<LoginRow[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const rows = await db.select({
            id: siteLogins.id,
            label: siteLogins.label,
            site: siteLogins.site,
            username: siteLogins.username,
            agentId: siteLogins.agentId,
            notes: siteLogins.notes,
            updatedAt: siteLogins.updatedAt,
        })
            .from(siteLogins)
            .where(eq(siteLogins.tenantId, tenantId))
            .orderBy(asc(siteLogins.label));
        return rows;
    } catch (error) {
        console.error("Failed to load logins:", error);
        return [];
    }
}

/** Create or update a saved login (edit when `id` is present). Password only re-encrypted when provided. */
export async function saveLoginAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const id = ((formData.get("id") as string) || "").trim();
    const label = ((formData.get("label") as string) || "").trim();
    const site = ((formData.get("site") as string) || "").trim();
    const username = ((formData.get("username") as string) || "").trim();
    const password = ((formData.get("password") as string) || "").trim();
    const agentId = ((formData.get("agentId") as string) || "").trim();
    const notes = ((formData.get("notes") as string) || "").trim();

    if (!label) return { success: false, message: "Label is required." };
    if (!username) return { success: false, message: "Username is required." };
    if (!id && !password) return { success: false, message: "Password is required." };

    try {
        if (id) {
            const updates: Record<string, unknown> = {
                label,
                site: site || null,
                username,
                agentId: agentId || null,
                notes: notes || null,
                updatedAt: new Date(),
            };
            if (password) updates.encryptedPassword = encrypt(password);

            const [updated] = await db.update(siteLogins)
                .set(updates)
                .where(and(eq(siteLogins.id, id), eq(siteLogins.tenantId, tenantId)))
                .returning({ id: siteLogins.id });

            if (!updated) return { success: false, message: "Login not found." };
        } else {
            await db.insert(siteLogins).values({
                tenantId,
                label,
                site: site || null,
                username,
                encryptedPassword: encrypt(password),
                agentId: agentId || null,
                notes: notes || null,
            });
        }

        await logAudit({
            action: "login.save",
            targetType: "login",
            targetId: label,
            tenantId,
            summary: `Saved login: ${label}`,
            metadata: { site: site || undefined, username },
        });

        revalidatePath("/dashboard/logins");
        return { success: true, message: id ? "Login updated." : "Login added." };
    } catch (error) {
        console.error("Failed to save login:", error);
        return { success: false, message: "Failed to save login." };
    }
}

/** Delete a saved login by id, scoped to the tenant. */
export async function deleteLoginAction(id: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false, message: "Login id is required." };

    try {
        const [existing] = await db.select({ label: siteLogins.label })
            .from(siteLogins)
            .where(and(eq(siteLogins.id, id), eq(siteLogins.tenantId, tenantId)))
            .limit(1);

        await db.delete(siteLogins).where(and(eq(siteLogins.id, id), eq(siteLogins.tenantId, tenantId)));

        await logAudit({
            action: "login.delete",
            targetType: "login",
            targetId: id,
            tenantId,
            summary: `Deleted login: ${existing?.label ?? id}`,
        });

        revalidatePath("/dashboard/logins");
        return { success: true, message: "Login deleted." };
    } catch (error) {
        console.error("Failed to delete login:", error);
        return { success: false, message: "Failed to delete login." };
    }
}
