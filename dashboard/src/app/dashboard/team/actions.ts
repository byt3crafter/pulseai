"use server";

import { db } from "../../../storage/db";
import { users, channels, channelMembers, passwordResetTokens } from "../../../storage/schema";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { requireTenant } from "../../../utils/tenant-auth";
import { TENANT_ROLES } from "../../../utils/permissions";
import { logAudit } from "../../../utils/audit";
import { generateSecurePassword } from "../../../utils/password";
import { generateToken, hashToken } from "../../../utils/tokens";
import {
    appBaseUrl,
    resolveTenantSmtp,
    sendInviteEmail,
    sendInviteEmailWithSmtp,
} from "../../../utils/mailer";

const PATH = "/dashboard/team";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type Result = { success: boolean; message: string };
type InviteResult = Result & { delivered?: boolean; inviteLink?: string; tempPassword?: string; email?: string };

// ── Ownership guard (never trust an id from the client) ──
async function ownsUser(tenantId: string, userId: string): Promise<boolean> {
    const [row] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId))).limit(1);
    return !!row;
}

/**
 * Generate a fresh invite token for a user and try to deliver it by email —
 * the tenant's own SMTP (Settings → Email) first, then the platform SMTP
 * (Admin → Settings → Email) as a fallback. Always returns the link so the
 * caller can offer a manual "copy invite link" option regardless of delivery.
 */
async function sendTeamInvite(
    tenantId: string,
    userId: string,
    email: string,
    name: string | null
): Promise<{ delivered: boolean; inviteLink: string }> {
    const raw = generateToken();
    await db.insert(passwordResetTokens).values({
        userId,
        tokenHash: hashToken(raw),
        type: "invite",
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    const inviteLink = `${appBaseUrl()}/reset/${raw}`;

    let delivered = false;
    try {
        const tenantSmtp = await resolveTenantSmtp(tenantId);
        delivered = tenantSmtp
            ? await sendInviteEmailWithSmtp(tenantSmtp, email, name, inviteLink)
            : await sendInviteEmail(email, name, inviteLink);
    } catch (error) {
        console.error("Failed to send team invite email:", error);
    }
    return { delivered, inviteLink };
}

/**
 * Replace a user's department (channel) memberships with the set submitted
 * in `dept_<channelId>` fields ('talk' | 'observe' | anything else = none).
 * Shared by create + the per-row "edit departments" action so both stay
 * consistent — always scoped to channels that belong to this tenant.
 */
async function applyDepartmentAssignments(tenantId: string, userId: string, formData: FormData): Promise<void> {
    const tenantChannels = await db.select({ id: channels.id }).from(channels).where(eq(channels.tenantId, tenantId));
    if (tenantChannels.length === 0) return;
    const channelIds = tenantChannels.map((c) => c.id);

    const rows: { channelId: string; userId: string; access: "talk" | "observe" }[] = [];
    for (const channelId of channelIds) {
        const value = formData.get(`dept_${channelId}`);
        if (value === "talk" || value === "observe") rows.push({ channelId, userId, access: value });
    }

    await db.delete(channelMembers).where(
        and(eq(channelMembers.userId, userId), inArray(channelMembers.channelId, channelIds))
    );
    if (rows.length > 0) {
        await db.insert(channelMembers).values(rows);
    }
}

export async function createMemberAction(formData: FormData): Promise<InviteResult> {
    const check = await requireTenant("tenant.members.write");
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const name = ((formData.get("name") as string) || "").trim();
    const email = ((formData.get("email") as string) || "").trim().toLowerCase();
    const requestedRole = (formData.get("accessRole") as string) || "member";
    const accessRole = TENANT_ROLES.includes(requestedRole as any) ? requestedRole : "member";

    if (!name || !email) return { success: false, message: "Name and email are required." };

    try {
        const tempPassword = generateSecurePassword(16);
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        const [created] = await db.insert(users).values({
            name,
            email,
            passwordHash,
            role: "TENANT",
            accessRole,
            tenantId,
            mustChangePassword: true,
        }).returning({ id: users.id });

        await applyDepartmentAssignments(tenantId, created.id, formData);
        const { delivered, inviteLink } = await sendTeamInvite(tenantId, created.id, email, name);

        await logAudit({
            action: "team.member.create",
            targetType: "user",
            targetId: created.id,
            tenantId,
            summary: `Added team member ${email}`,
            metadata: { email, role: accessRole },
        });

        revalidatePath(PATH);
        return {
            success: true,
            message: delivered
                ? `Invite sent to ${email}.`
                : `Share these credentials with ${name} — they'll be asked to change the password on first login.`,
            delivered,
            inviteLink,
            tempPassword: delivered ? undefined : tempPassword,
            email,
        };
    } catch (error) {
        if (error instanceof Error && error.message.includes("users_email_unique")) {
            return { success: false, message: "A user with this email already exists." };
        }
        console.error("Failed to create team member:", error);
        return { success: false, message: "Failed to create team member." };
    }
}

export async function resendInviteAction(userId: string): Promise<InviteResult> {
    const check = await requireTenant("tenant.members.write");
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const [target] = await db.select({
        id: users.id, tenantId: users.tenantId, email: users.email, name: users.name, lastLoginAt: users.lastLoginAt,
    }).from(users).where(eq(users.id, userId)).limit(1);
    if (!target || target.tenantId !== tenantId) return { success: false, message: "Not found." };
    if (target.lastLoginAt) return { success: false, message: "This person has already signed in." };

    try {
        const { delivered, inviteLink } = await sendTeamInvite(tenantId, target.id, target.email, target.name);
        revalidatePath(PATH);
        return {
            success: true,
            message: delivered
                ? `Invite re-sent to ${target.email}.`
                : "Email isn't configured — copy the link below and share it manually.",
            delivered,
            inviteLink,
        };
    } catch (error) {
        console.error("Failed to resend invite:", error);
        return { success: false, message: "Failed to resend the invite." };
    }
}

export async function updateMemberRoleAction(userId: string, accessRole: string): Promise<Result> {
    const check = await requireTenant("tenant.members.write");
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    if (!TENANT_ROLES.includes(accessRole as any)) return { success: false, message: "Invalid role." };

    const [target] = await db.select({ id: users.id, tenantId: users.tenantId, accessRole: users.accessRole })
        .from(users).where(eq(users.id, userId)).limit(1);
    if (!target || target.tenantId !== tenantId) return { success: false, message: "Not found." };

    if (target.accessRole === "owner" && accessRole !== "owner") {
        const owners = await db.select({ id: users.id }).from(users)
            .where(and(eq(users.tenantId, tenantId), eq(users.accessRole, "owner")));
        if (owners.length <= 1) return { success: false, message: "Assign another owner before changing this one's role." };
    }

    try {
        await db.update(users).set({ accessRole, updatedAt: new Date() }).where(eq(users.id, userId));

        await logAudit({
            action: "team.member.role_change",
            targetType: "user",
            targetId: userId,
            tenantId,
            summary: "Changed role for team member",
            metadata: { role: accessRole },
        });

        revalidatePath(PATH);
        return { success: true, message: "Role updated." };
    } catch (error) {
        console.error("Failed to update member role:", error);
        return { success: false, message: "Failed to update role." };
    }
}

export async function removeMemberAction(userId: string): Promise<Result> {
    const check = await requireTenant("tenant.members.write");
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    if (check.userId === userId) return { success: false, message: "You can't remove your own account." };

    const [target] = await db.select({ id: users.id, tenantId: users.tenantId, accessRole: users.accessRole })
        .from(users).where(eq(users.id, userId)).limit(1);
    if (!target || target.tenantId !== tenantId) return { success: false, message: "Not found." };

    if (target.accessRole === "owner") {
        const owners = await db.select({ id: users.id }).from(users)
            .where(and(eq(users.tenantId, tenantId), eq(users.accessRole, "owner")));
        if (owners.length <= 1) return { success: false, message: "You can't remove the last owner." };
    }

    try {
        await db.delete(users).where(eq(users.id, userId));

        await logAudit({
            action: "team.member.remove",
            targetType: "user",
            targetId: userId,
            tenantId,
            summary: "Removed team member",
        });

        revalidatePath(PATH);
        return { success: true, message: "Team member removed." };
    } catch (error) {
        console.error("Failed to remove team member:", error);
        return { success: false, message: "Failed to remove team member." };
    }
}

export async function setMemberDepartmentsAction(formData: FormData): Promise<Result> {
    const check = await requireTenant("tenant.members.write");
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const userId = formData.get("userId") as string;
    if (!userId || !(await ownsUser(tenantId, userId))) return { success: false, message: "Not found." };

    try {
        await applyDepartmentAssignments(tenantId, userId, formData);
        revalidatePath(PATH);
        return { success: true, message: "Departments updated." };
    } catch (error) {
        console.error("Failed to update department assignments:", error);
        return { success: false, message: "Failed to update departments." };
    }
}
