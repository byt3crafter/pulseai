"use server";

import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import { users } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

export async function changePasswordAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) return { success: false, message: "Not authenticated." };

    const newPassword = formData.get("newPassword") as string;
    const confirm = formData.get("confirmPassword") as string;

    if (!newPassword || newPassword.length < 8) {
        return { success: false, message: "Password must be at least 8 characters." };
    }
    if (newPassword !== confirm) {
        return { success: false, message: "Passwords do not match." };
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await db.update(users)
        .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
        .where(eq(users.id, session.user.id));

    return { success: true };
}

export async function saveTelegramChannelAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "No tenant context." };

    const token = formData.get("botToken") as string;
    if (!token) return { success: false, message: "Bot token is required." };

    // Live-validate token against Telegram API
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();
        if (!data.ok) {
            return { success: false, message: `Telegram rejected the token: ${data.description}` };
        }

        // Token is valid — save it to channel_connections
        const { db: dbClient } = await import("../../../storage/db");
        const { channelConnections, agentProfiles } = await import("../../../storage/schema");
        const { eq: eqOp } = await import("drizzle-orm");

        // Auto-link the tenant's agent profile to the channel connection
        const agentProfile = await dbClient.select({ id: agentProfiles.id })
            .from(agentProfiles)
            .where(eqOp(agentProfiles.tenantId, session.user.tenantId!))
            .limit(1);
        const agentProfileId = agentProfile[0]?.id ?? null;

        // Upsert: check if Telegram connection already exists for this tenant
        const existing = await dbClient.select()
            .from(channelConnections)
            .where(eqOp(channelConnections.tenantId, session.user.tenantId!))
            .limit(1);

        if (existing.length > 0) {
            await dbClient.update(channelConnections)
                .set({ channelConfig: { botToken: token }, agentProfileId })
                .where(eqOp(channelConnections.id, existing[0].id));
        } else {
            await dbClient.insert(channelConnections).values({
                tenantId: session.user.tenantId!,
                channelType: "telegram",
                channelConfig: { botToken: token },
                status: "active",
                agentProfileId,
            });
        }

        return { success: true, botUsername: data.result.username };
    } catch {
        return { success: false, message: "Failed to reach Telegram. Check your internet connection." };
    }
}
