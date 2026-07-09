"use server";

import { db } from "../../../storage/db";
import { people, tenants, agentProfiles, approvalAllowances } from "../../../storage/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../utils/tenant-auth";

const PATH = "/dashboard/people";
type Result = { success: boolean; message: string };

const ACCESS_VALUES = ["talk", "observe", "blocked"] as const;
const APPROVAL_MODE_VALUES = ["auto", "requires_approval"] as const;

/**
 * Tenant-wide default access level applied to a Telegram user the first time
 * they're ever seen (tenants.config.default_person_access). Stored config —
 * never hardcoded — so an admin can flip the default without a code change.
 */
export async function updateDefaultPersonAccessAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const access = formData.get("defaultAccess") as string;
    if (!ACCESS_VALUES.includes(access as any)) {
        return { success: false, message: "Invalid access level." };
    }

    try {
        await db.execute(
            sql`UPDATE tenants SET config = config || ${JSON.stringify({ default_person_access: access })}::jsonb, updated_at = now() WHERE id = ${tenantId}::uuid`
        );
        revalidatePath(PATH);
        return { success: true, message: "Default access updated." };
    } catch (error) {
        console.error("Failed to update default person access:", error);
        return { success: false, message: "Could not save the default access setting." };
    }
}

export async function updatePersonAccessAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const personId = (formData.get("personId") as string) || "";
    const access = formData.get("access") as string;
    if (!personId) return { success: false, message: "Missing person." };
    if (!ACCESS_VALUES.includes(access as any)) return { success: false, message: "Invalid access level." };

    try {
        const res = await db
            .update(people)
            .set({ access, updatedAt: new Date() })
            .where(and(eq(people.id, personId), eq(people.tenantId, tenantId)))
            .returning({ id: people.id });
        if (res.length === 0) return { success: false, message: "Not found." };
        revalidatePath(PATH);
        return { success: true, message: "Access updated." };
    } catch (error) {
        console.error("Failed to update person access:", error);
        return { success: false, message: "Could not update access." };
    }
}

export async function updatePersonApproverAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const personId = (formData.get("personId") as string) || "";
    const isApprover = formData.get("isApprover") === "true";
    if (!personId) return { success: false, message: "Missing person." };

    try {
        const res = await db
            .update(people)
            .set({ isApprover, updatedAt: new Date() })
            .where(and(eq(people.id, personId), eq(people.tenantId, tenantId)))
            .returning({ id: people.id });
        if (res.length === 0) return { success: false, message: "Not found." };
        revalidatePath(PATH);
        return { success: true, message: isApprover ? "Marked as approver." : "Approver removed." };
    } catch (error) {
        console.error("Failed to update person approver flag:", error);
        return { success: false, message: "Could not update approver status." };
    }
}

// Enforced in the Telegram adapter's approval gate — see pulse/src/channels/approval-service.ts.
export async function updatePersonApprovalModeAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const personId = (formData.get("personId") as string) || "";
    const approvalMode = formData.get("approvalMode") as string;
    if (!personId) return { success: false, message: "Missing person." };
    if (!APPROVAL_MODE_VALUES.includes(approvalMode as any)) {
        return { success: false, message: "Invalid approval mode." };
    }

    try {
        const res = await db
            .update(people)
            .set({ approvalMode, updatedAt: new Date() })
            .where(and(eq(people.id, personId), eq(people.tenantId, tenantId)))
            .returning({ id: people.id });
        if (res.length === 0) return { success: false, message: "Not found." };
        revalidatePath(PATH);
        return { success: true, message: "Approval mode updated." };
    } catch (error) {
        console.error("Failed to update person approval mode:", error);
        return { success: false, message: "Could not update approval mode." };
    }
}

export async function updatePersonAllowedAgentsAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const personId = (formData.get("personId") as string) || "";
    if (!personId) return { success: false, message: "Missing person." };

    let allowedAgentIds: string[] = [];
    try {
        allowedAgentIds = JSON.parse((formData.get("allowedAgentIdsJson") as string) || "[]");
        if (!Array.isArray(allowedAgentIds)) allowedAgentIds = [];
    } catch {
        allowedAgentIds = [];
    }

    // Only keep agent ids that actually belong to this tenant.
    if (allowedAgentIds.length) {
        const owned = await db
            .select({ id: agentProfiles.id })
            .from(agentProfiles)
            .where(eq(agentProfiles.tenantId, tenantId));
        const ownedSet = new Set(owned.map((a) => a.id));
        allowedAgentIds = allowedAgentIds.filter((id) => ownedSet.has(id));
    }

    try {
        const res = await db
            .update(people)
            .set({ allowedAgentIds, updatedAt: new Date() })
            .where(and(eq(people.id, personId), eq(people.tenantId, tenantId)))
            .returning({ id: people.id });
        if (res.length === 0) return { success: false, message: "Not found." };
        revalidatePath(PATH);
        return { success: true, message: "Allowed agents updated." };
    } catch (error) {
        console.error("Failed to update person's allowed agents:", error);
        return { success: false, message: "Could not update allowed agents." };
    }
}

// Standing approvals ("Allow always") — granted from a Telegram approval
// card (pulse/src/channels/approval-service.ts). This is the dashboard's
// revoke path: it lasts until an admin explicitly revokes it here.
export async function revokeApprovalAllowanceAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const allowanceId = (formData.get("allowanceId") as string) || "";
    if (!allowanceId) return { success: false, message: "Missing allowance." };

    try {
        const res = await db
            .update(approvalAllowances)
            .set({ revokedAt: new Date() })
            .where(
                and(
                    eq(approvalAllowances.id, allowanceId),
                    eq(approvalAllowances.tenantId, tenantId),
                    isNull(approvalAllowances.revokedAt)
                )
            )
            .returning({ id: approvalAllowances.id });
        if (res.length === 0) return { success: false, message: "Not found." };
        revalidatePath(PATH);
        return { success: true, message: "Standing approval revoked." };
    } catch (error) {
        console.error("Failed to revoke standing approval:", error);
        return { success: false, message: "Could not revoke this standing approval." };
    }
}

export async function deletePersonAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const personId = (formData.get("personId") as string) || "";
    if (!personId) return { success: false, message: "Missing person." };

    try {
        await db.delete(people).where(and(eq(people.id, personId), eq(people.tenantId, tenantId)));
        revalidatePath(PATH);
        return { success: true, message: "Removed." };
    } catch (error) {
        console.error("Failed to delete person:", error);
        return { success: false, message: "Could not remove this person." };
    }
}
