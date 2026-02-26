"use server";

import { db } from "../../../storage/db";
import { globalSettings } from "../../../storage/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const settingsSchema = z.object({
    anthropicApiKey: z.string().optional(),
    openaiApiKey: z.string().optional(),
});

export async function getGlobalSettings() {
    const settings = await db.query.globalSettings.findFirst({
        where: (table, { eq }) => eq(table.id, "root")
    });

    return settings || { anthropicApiKeyHash: null, openaiApiKeyHash: null, gatewayConfig: {} };
}

export async function saveGlobalSettingsAction(formData: FormData) {
    try {
        const section = formData.get("section") as string;
        const updates: any = { updatedAt: new Date() };

        if (section === "providers") {
            const rawData = {
                anthropicApiKey: formData.get("anthropicApiKey") as string | undefined,
                openaiApiKey: formData.get("openaiApiKey") as string | undefined,
            };

            if (!rawData.anthropicApiKey) delete rawData.anthropicApiKey;
            if (!rawData.openaiApiKey) delete rawData.openaiApiKey;

            const validatedData = settingsSchema.parse(rawData);
            if (validatedData.anthropicApiKey) updates.anthropicApiKeyHash = validatedData.anthropicApiKey;
            if (validatedData.openaiApiKey) updates.openaiApiKeyHash = validatedData.openaiApiKey;
        }

        const currentSettings = await getGlobalSettings() as any;
        let gatewayConfig: any = currentSettings.gatewayConfig ? { ...currentSettings.gatewayConfig } : {};
        let updateConfig = false;

        if (section === "sandbox") {
            const sandboxMode = formData.get("sandboxMode") as string;
            const sandboxImage = formData.get("sandboxImage") as string;
            if (sandboxMode) {
                gatewayConfig.sandbox_defaults = {
                    mode: sandboxMode,
                    docker: { image: sandboxImage || undefined }
                };
                updateConfig = true;
            }
        }

        if (section === "pulse_system") {
            gatewayConfig.enable_hot_reload = formData.get("enableHotReload") === "on";
            gatewayConfig.trusted_proxy = formData.get("trustedProxy") as string;
            gatewayConfig.lan_discovery = formData.get("lanDiscovery") === "on";
            gatewayConfig.cli_backends = formData.get("cliBackends") as string;
            updateConfig = true;
        }

        if (updateConfig) {
            updates.gatewayConfig = gatewayConfig;
        }

        if (Object.keys(updates).length > 1) {
            await db.insert(globalSettings)
                .values({
                    id: "root",
                    ...updates
                })
                .onConflictDoUpdate({
                    target: globalSettings.id,
                    set: updates
                });
        }

        revalidatePath("/admin/settings");
    } catch (error) {
        console.error("Failed to save global settings:", error);
    }
}
