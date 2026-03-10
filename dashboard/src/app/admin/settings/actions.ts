"use server";

import { db } from "../../../storage/db";
import { globalSettings, scheduledJobs, agentProfiles, modelPricing } from "../../../storage/schema";
import { revalidatePath } from "next/cache";
import { eq, desc, and } from "drizzle-orm";
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

export async function saveDefaultSkillsAction(formData: FormData) {
    "use server";
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    const skillsRaw = formData.get("defaultSkills") as string;
    if (!skillsRaw) return { success: false, message: "Missing skills data." };

    let defaultSkills: string[];
    try {
        defaultSkills = JSON.parse(skillsRaw);
        if (!Array.isArray(defaultSkills)) throw new Error("Not an array");
    } catch {
        return { success: false, message: "Invalid skills data." };
    }

    try {
        const existing = await db.query.globalSettings.findFirst({
            where: eq(globalSettings.id, "root"),
        });

        const currentGatewayConfig = (existing?.gatewayConfig as any) ?? {};
        const updatedGatewayConfig = { ...currentGatewayConfig, defaultSkills };

        await db
            .insert(globalSettings)
            .values({ id: "root", gatewayConfig: updatedGatewayConfig })
            .onConflictDoUpdate({
                target: globalSettings.id,
                set: { gatewayConfig: updatedGatewayConfig },
            });

        revalidatePath("/admin/settings");
        return { success: true, message: "Default skills saved." };
    } catch (err) {
        console.error("Failed to save default skills:", err);
        return { success: false, message: "Failed to save default skills." };
    }
}

// ─── Model Pricing Actions ─────────────────────────────────────────────────

export async function getModelPricingList() {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return [];

    const rows = await db.select().from(modelPricing);
    return rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        modelId: r.modelId,
        displayName: r.displayName,
        category: r.category,
        baseInputPerMillion: parseFloat(r.baseInputPerMillion as string),
        baseOutputPerMillion: parseFloat(r.baseOutputPerMillion as string),
        customerInputPerMillion: parseFloat(r.customerInputPerMillion as string),
        customerOutputPerMillion: parseFloat(r.customerOutputPerMillion as string),
        maxTokens: r.maxTokens,
        isActive: r.isActive,
    }));
}

export async function saveModelPricingAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    const provider = formData.get("provider") as string;
    const modelId = formData.get("modelId") as string;
    const displayName = formData.get("displayName") as string;

    if (!provider || !modelId || !displayName) {
        return { success: false, message: "Provider, model ID, and display name are required." };
    }

    const category = (formData.get("category") as string) || "flagship";
    const baseInput = parseFloat(formData.get("baseInputPerMillion") as string) || 0;
    const baseOutput = parseFloat(formData.get("baseOutputPerMillion") as string) || 0;
    const customerInput = parseFloat(formData.get("customerInputPerMillion") as string) || 0;
    const customerOutput = parseFloat(formData.get("customerOutputPerMillion") as string) || 0;
    const maxTokens = parseInt(formData.get("maxTokens") as string) || 8192;
    const isActive = formData.get("isActive") !== "false";

    try {
        await db.insert(modelPricing)
            .values({
                provider,
                modelId,
                displayName,
                category,
                baseInputPerMillion: baseInput.toString(),
                baseOutputPerMillion: baseOutput.toString(),
                customerInputPerMillion: customerInput.toString(),
                customerOutputPerMillion: customerOutput.toString(),
                maxTokens,
                isActive,
            })
            .onConflictDoUpdate({
                target: [modelPricing.provider, modelPricing.modelId],
                set: {
                    displayName,
                    category,
                    baseInputPerMillion: baseInput.toString(),
                    baseOutputPerMillion: baseOutput.toString(),
                    customerInputPerMillion: customerInput.toString(),
                    customerOutputPerMillion: customerOutput.toString(),
                    maxTokens,
                    isActive,
                    updatedAt: new Date(),
                },
            });

        revalidatePath("/admin/settings");
        return { success: true, message: "Model pricing saved." };
    } catch (err) {
        console.error("Failed to save model pricing:", err);
        return { success: false, message: "Failed to save model pricing." };
    }
}

export async function deleteModelPricingAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    const id = formData.get("id") as string;
    if (!id) return { success: false, message: "Model ID is required." };

    try {
        await db.delete(modelPricing).where(eq(modelPricing.id, id));
        revalidatePath("/admin/settings");
        return { success: true, message: "Model deleted." };
    } catch (err) {
        console.error("Failed to delete model pricing:", err);
        return { success: false, message: "Failed to delete model." };
    }
}

export async function syncProviderModelsAction(formData: FormData) {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return { success: false, message: adminCheck.message };

    const provider = formData.get("provider") as string;
    if (!provider) return { success: false, message: "Provider is required." };

    // Get the gateway URL from env or default
    const gatewayUrl = process.env.GATEWAY_INTERNAL_URL || "http://localhost:3000";

    try {
        const res = await fetch(`${gatewayUrl}/api/admin/models/discover`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer admin",
            },
            body: JSON.stringify({ provider }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { success: false, message: err.error || "Discovery failed." };
        }

        const data = await res.json();
        revalidatePath("/admin/settings");
        return { success: true, message: data.message || `Discovered ${data.models?.length || 0} models.` };
    } catch (err) {
        console.error("Failed to sync provider models:", err);
        return { success: false, message: "Failed to connect to gateway for model discovery." };
    }
}
