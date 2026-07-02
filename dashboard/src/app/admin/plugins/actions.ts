"use server";

import { db } from "../../../storage/db";
import { installedPlugins } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../../utils/admin-auth";
import { logAudit } from "../../../utils/audit";

export async function approvePluginAction(
    pluginId: string,
): Promise<{ success: boolean; message: string }> {
    const adminCheck = await requireAdmin("platform.plugins.write");
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    const plugin = await db.query.installedPlugins.findFirst({
        where: eq(installedPlugins.id, pluginId),
    });
    if (!plugin) return { success: false, message: "Plugin not found." };

    await db
        .update(installedPlugins)
        .set({
            approvedHash: plugin.manifestHash,
            approvedBy: adminCheck.userId,
            approvedAt: new Date(),
        })
        .where(eq(installedPlugins.id, pluginId));

    revalidatePath("/admin/plugins");

    await logAudit({
        action: "plugin.approve",
        targetType: "plugin",
        targetId: pluginId,
        summary: "Approved plugin capabilities",
    });

    return { success: true, message: "Plugin capabilities approved." };
}
