"use server";

import { db } from "../../../../../storage/db";
import { allowlists, pairingCodes } from "../../../../../storage/schema";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";

export async function approvePairingAction(tenantId: string, code: string) {
    try {
        const pairingRecord = await db.query.pairingCodes.findFirst({
            where: and(
                eq(pairingCodes.tenantId, tenantId),
                eq(pairingCodes.code, code),
                eq(pairingCodes.status, "pending")
            ),
        });

        if (!pairingRecord) {
            return { success: false, message: "Pairing code not found or already processed." };
        }

        // Update pairing code
        await db
            .update(pairingCodes)
            .set({ status: "approved" })
            .where(eq(pairingCodes.id, pairingRecord.id));

        // Update allowlist
        await db
            .update(allowlists)
            .set({ status: "approved" })
            .where(
                and(
                    eq(allowlists.tenantId, tenantId),
                    eq(allowlists.channelType, "telegram"),
                    eq(allowlists.contactId, pairingRecord.contactId)
                )
            );

        revalidatePath(`/admin/tenants/${tenantId}/approvals`);
        return { success: true };
    } catch (error) {
        console.error("Failed to approve pairing:", error);
        return { success: false, message: "Failed to approve pairing code." };
    }
}

export async function rejectPairingAction(tenantId: string, contactId: string) {
    try {
        await db
            .update(allowlists)
            .set({ status: "blocked" })
            .where(
                and(
                    eq(allowlists.tenantId, tenantId),
                    eq(allowlists.channelType, "telegram"),
                    eq(allowlists.contactId, contactId)
                )
            );

        // Also reject any pending codes for this contact
        await db
            .update(pairingCodes)
            .set({ status: "rejected" })
            .where(
                and(
                    eq(pairingCodes.tenantId, tenantId),
                    eq(pairingCodes.contactId, contactId),
                    eq(pairingCodes.status, "pending")
                )
            );

        revalidatePath(`/admin/tenants/${tenantId}/approvals`);
        return { success: true };
    } catch (error) {
        console.error("Failed to reject pairing:", error);
        return { success: false, message: "Failed to reject contact." };
    }
}

export async function addGroupToAllowlistAction(
    tenantId: string,
    groupChatId: string,
    groupName: string
) {
    try {
        await db.insert(allowlists).values({
            tenantId,
            channelType: "telegram",
            contactId: groupChatId,
            contactName: groupName,
            contactType: "group",
            status: "approved",
        });

        revalidatePath(`/admin/tenants/${tenantId}/approvals`);
        return { success: true };
    } catch (error) {
        if (error instanceof Error && error.message.includes("unique")) {
            return { success: false, message: "This group is already in the allowlist." };
        }
        console.error("Failed to add group:", error);
        return { success: false, message: "Failed to add group to allowlist." };
    }
}

export async function removeFromAllowlistAction(tenantId: string, contactId: string) {
    try {
        await db
            .delete(allowlists)
            .where(
                and(
                    eq(allowlists.tenantId, tenantId),
                    eq(allowlists.channelType, "telegram"),
                    eq(allowlists.contactId, contactId)
                )
            );

        revalidatePath(`/admin/tenants/${tenantId}/approvals`);
        return { success: true };
    } catch (error) {
        console.error("Failed to remove from allowlist:", error);
        return { success: false, message: "Failed to remove from allowlist." };
    }
}
