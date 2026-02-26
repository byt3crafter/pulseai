"use server";

import { db } from "../../../storage/db";
import { globalSettings, scheduledJobs, agentProfiles } from "../../../storage/schema";
import { revalidatePath } from "next/cache";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../../../utils/admin-auth";

const settingsSchema = z.object({
    anthropicApiKey: z.string().optional(),
    openaiApiKey: z.string().optional(),
});

export async function getGlobalSettings() {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return { anthropicApiKeyHash: null, openaiApiKeyHash: null, gatewayConfig: {} };

    const settings = await db.query.globalSettings.findFirst({
        where: (table, { eq }) => eq(table.id, "root")
    });

    return settings || { anthropicApiKeyHash: null, openaiApiKeyHash: null, gatewayConfig: {} };
}

export async function saveGlobalSettingsAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return;

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

        const currentSettings = await db.query.globalSettings.findFirst({
            where: (table, { eq }) => eq(table.id, "root")
        }) as any;
        let gatewayConfig: any = currentSettings?.gatewayConfig ? { ...currentSettings.gatewayConfig } : {};
        let updateConfig = false;

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

export async function saveMemorySettingsAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return;

    try {
        const currentSettings = await db.query.globalSettings.findFirst({
            where: (table, { eq }) => eq(table.id, "root"),
        });
        const gwConfig: any = currentSettings?.gatewayConfig
            ? { ...(currentSettings.gatewayConfig as any) }
            : {};

        gwConfig.memory_system = {
            enabled: formData.get("enabled") === "on",
            embedding_model: formData.get("embeddingModel") as string || "text-embedding-3-small",
            max_memories_per_agent: parseInt(formData.get("maxMemories") as string) || 10000,
            decay_half_life_days: parseInt(formData.get("decayHalfLife") as string) || 30,
            mmr_lambda: parseFloat(formData.get("mmrLambda") as string) || 0.7,
        };

        await db
            .insert(globalSettings)
            .values({ id: "root", gatewayConfig: gwConfig, updatedAt: new Date() })
            .onConflictDoUpdate({
                target: globalSettings.id,
                set: { gatewayConfig: gwConfig, updatedAt: new Date() },
            });

        revalidatePath("/admin/settings");
    } catch (error) {
        console.error("Failed to save memory settings:", error);
    }
}

export async function saveSandboxSettingsAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return;

    try {
        const currentSettings = await db.query.globalSettings.findFirst({
            where: (table, { eq }) => eq(table.id, "root"),
        });
        const gwConfig: any = currentSettings?.gatewayConfig
            ? { ...(currentSettings.gatewayConfig as any) }
            : {};

        gwConfig.python_sandbox = {
            image: formData.get("pythonImage") as string || "pulse-python-sandbox:latest",
            memory_limit: formData.get("memoryLimit") as string || "256m",
            cpu_limit: formData.get("cpuLimit") as string || "1.0",
            default_timeout: parseInt(formData.get("defaultTimeout") as string) || 60,
            max_timeout: parseInt(formData.get("maxTimeout") as string) || 300,
            network_enabled: formData.get("networkEnabled") === "on",
        };

        await db
            .insert(globalSettings)
            .values({ id: "root", gatewayConfig: gwConfig, updatedAt: new Date() })
            .onConflictDoUpdate({
                target: globalSettings.id,
                set: { gatewayConfig: gwConfig, updatedAt: new Date() },
            });

        revalidatePath("/admin/settings");
    } catch (error) {
        console.error("Failed to save sandbox settings:", error);
    }
}

export async function saveSchedulingSettingsAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return;

    try {
        const currentSettings = await db.query.globalSettings.findFirst({
            where: (table, { eq }) => eq(table.id, "root"),
        });
        const gwConfig: any = currentSettings?.gatewayConfig
            ? { ...(currentSettings.gatewayConfig as any) }
            : {};

        gwConfig.scheduling = {
            enabled: formData.get("enabled") === "on",
            max_jobs_per_tenant: parseInt(formData.get("maxJobsPerTenant") as string) || 50,
            max_jobs_per_agent: parseInt(formData.get("maxJobsPerAgent") as string) || 10,
            min_interval_seconds: parseInt(formData.get("minInterval") as string) || 300,
        };

        await db
            .insert(globalSettings)
            .values({ id: "root", gatewayConfig: gwConfig, updatedAt: new Date() })
            .onConflictDoUpdate({
                target: globalSettings.id,
                set: { gatewayConfig: gwConfig, updatedAt: new Date() },
            });

        revalidatePath("/admin/settings");
    } catch (error) {
        console.error("Failed to save scheduling settings:", error);
    }
}

export async function getScheduledJobs() {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return [];

    return db
        .select({
            id: scheduledJobs.id,
            name: scheduledJobs.name,
            scheduleType: scheduledJobs.scheduleType,
            cronExpression: scheduledJobs.cronExpression,
            intervalSeconds: scheduledJobs.intervalSeconds,
            runAt: scheduledJobs.runAt,
            enabled: scheduledJobs.enabled,
            timezone: scheduledJobs.timezone,
            lastRunAt: scheduledJobs.lastRunAt,
            agentName: agentProfiles.name,
            tenantId: scheduledJobs.tenantId,
        })
        .from(scheduledJobs)
        .leftJoin(agentProfiles, eq(scheduledJobs.agentId, agentProfiles.id))
        .orderBy(desc(scheduledJobs.createdAt))
        .limit(50);
}
