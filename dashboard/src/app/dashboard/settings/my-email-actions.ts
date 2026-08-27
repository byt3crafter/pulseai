"use server";

import { and, eq } from "drizzle-orm";
import { db } from "../../../storage/db";
import { userEmailAccounts } from "../../../storage/schema";
import { requireTenant } from "../../../utils/tenant-auth";
import { encrypt } from "../../../utils/crypto";
import { logAudit } from "../../../utils/audit";
import { revalidatePath } from "next/cache";

export interface MyEmailConfig {
    connected: boolean;
    emailAddress: string;
    displayName: string;
    smtpHost: string; smtpPort: string; smtpSecure: boolean; smtpUsername: string;
    imapHost: string; imapPort: string; imapSecure: boolean; imapUsername: string;
    hasSmtpPassword: boolean; hasImapPassword: boolean;
}

/**
 * The signed-in person's own mailbox.
 *
 * Passwords are never returned — only whether one is set — so a saved
 * credential cannot be read back out through the page that stored it.
 */
export async function getMyEmailAction(): Promise<MyEmailConfig> {
    const empty: MyEmailConfig = {
        connected: false, emailAddress: "", displayName: "",
        smtpHost: "", smtpPort: "587", smtpSecure: true, smtpUsername: "",
        imapHost: "", imapPort: "993", imapSecure: true, imapUsername: "",
        hasSmtpPassword: false, hasImapPassword: false,
    };
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return empty;

    const [row] = await db.select().from(userEmailAccounts)
        .where(eq(userEmailAccounts.userId, tenantCheck.userId)).limit(1);
    if (!row) return empty;

    return {
        connected: true,
        emailAddress: row.emailAddress ?? "",
        displayName: row.displayName ?? "",
        smtpHost: row.smtpHost ?? "", smtpPort: String(row.smtpPort ?? 587),
        smtpSecure: row.smtpSecure, smtpUsername: row.smtpUsername ?? "",
        imapHost: row.imapHost ?? "", imapPort: String(row.imapPort ?? 993),
        imapSecure: row.imapSecure, imapUsername: row.imapUsername ?? "",
        hasSmtpPassword: !!row.smtpPassword, hasImapPassword: !!row.imapPassword,
    };
}

export async function saveMyEmailAction(input: {
    emailAddress: string; displayName: string;
    smtpHost: string; smtpPort: string; smtpSecure: boolean; smtpUsername: string; smtpPassword: string;
    imapHost: string; imapPort: string; imapSecure: boolean; imapUsername: string; imapPassword: string;
}) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false as const, message: tenantCheck.message };
    const { tenantId, userId } = tenantCheck;

    const address = (input.emailAddress || "").trim();
    if (!address || !address.includes("@")) {
        return { success: false as const, message: "Enter the email address for this mailbox." };
    }

    try {
        const [existing] = await db.select().from(userEmailAccounts)
            .where(eq(userEmailAccounts.userId, userId)).limit(1);

        // An empty password field means "leave it alone", so re-saving the host
        // or username never silently wipes a working credential.
        const keepOr = (incoming: string, current: string | null) =>
            incoming.trim() ? encrypt(incoming.trim()) : current;

        const values = {
            tenantId, userId,
            emailAddress: address,
            displayName: (input.displayName || "").trim() || null,
            smtpHost: (input.smtpHost || "").trim() || null,
            smtpPort: Number(input.smtpPort) || 587,
            smtpSecure: !!input.smtpSecure,
            smtpUsername: (input.smtpUsername || "").trim() || null,
            smtpPassword: keepOr(input.smtpPassword, existing?.smtpPassword ?? null),
            imapHost: (input.imapHost || "").trim() || null,
            imapPort: Number(input.imapPort) || 993,
            imapSecure: !!input.imapSecure,
            imapUsername: (input.imapUsername || "").trim() || null,
            imapPassword: keepOr(input.imapPassword, existing?.imapPassword ?? null),
            updatedAt: new Date(),
        };

        if (existing) {
            await db.update(userEmailAccounts).set(values).where(eq(userEmailAccounts.id, existing.id));
        } else {
            await db.insert(userEmailAccounts).values(values);
        }

        await logAudit({
            action: "user.email.connect",
            targetType: "user_email_account", targetId: userId, tenantId,
            summary: `Connected personal mailbox ${address}`,
            // The address is the point of the record; credentials never appear.
            metadata: { emailAddress: address },
        });

        revalidatePath("/dashboard/settings");
        return { success: true as const, message: "Your mailbox is connected." };
    } catch (err) {
        console.error("Failed to save personal mailbox:", err);
        return { success: false as const, message: "Failed to save." };
    }
}

export async function disconnectMyEmailAction() {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false as const, message: tenantCheck.message };
    try {
        await db.delete(userEmailAccounts)
            .where(and(eq(userEmailAccounts.userId, tenantCheck.userId),
                       eq(userEmailAccounts.tenantId, tenantCheck.tenantId)));
        await logAudit({
            action: "user.email.disconnect", targetType: "user_email_account",
            targetId: tenantCheck.userId, tenantId: tenantCheck.tenantId,
            summary: "Disconnected personal mailbox",
        });
        revalidatePath("/dashboard/settings");
        return { success: true as const, message: "Mailbox disconnected." };
    } catch (err) {
        console.error("Failed to disconnect mailbox:", err);
        return { success: false as const, message: "Failed to disconnect." };
    }
}
