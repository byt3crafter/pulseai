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

    return settings || { anthropicApiKeyHash: null, openaiApiKeyHash: null };
}

export async function saveGlobalSettingsAction(formData: FormData) {
    try {
        const rawData = {
            anthropicApiKey: formData.get("anthropicApiKey") as string | undefined,
            openaiApiKey: formData.get("openaiApiKey") as string | undefined,
        };

        // Clean up empty strings from form submissions
        if (!rawData.anthropicApiKey) delete rawData.anthropicApiKey;
        if (!rawData.openaiApiKey) delete rawData.openaiApiKey;

        const validatedData = settingsSchema.parse(rawData);

        // In a real application, you would securely encrypt these keys here
        // before storing them in the DB. For this prototype we will store raw
        // to match the 'Hash' suffix currently used in schema.ts
        const updates: any = { updatedAt: new Date() };
        if (validatedData.anthropicApiKey) updates.anthropicApiKeyHash = validatedData.anthropicApiKey;
        if (validatedData.openaiApiKey) updates.openaiApiKeyHash = validatedData.openaiApiKey;

        // Upsert the singleton record
        await db.insert(globalSettings)
            .values({
                id: "root",
                ...updates
            })
            .onConflictDoUpdate({
                target: globalSettings.id,
                set: updates
            });

        revalidatePath("/admin/settings");
    } catch (error) {
        console.error("Failed to save global settings:", error);
    }
}
