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

    try {
        // Resolve API key from global_settings or env
        const rootSettings = await db.query.globalSettings.findFirst({
            where: eq(globalSettings.id, "root"),
        });

        const keyMap: Record<string, string | null | undefined> = {
            anthropic: (rootSettings as any)?.anthropicApiKeyHash,
            openai: (rootSettings as any)?.openaiApiKeyHash,
        };
        let apiKey = keyMap[provider] || undefined;

        // Fallback to env vars
        if (!apiKey) {
            const envMap: Record<string, string | undefined> = {
                anthropic: process.env.ANTHROPIC_API_KEY,
                openai: process.env.OPENAI_API_KEY,
                openrouter: process.env.OPENROUTER_API_KEY,
                google: process.env.GOOGLE_API_KEY,
            };
            apiKey = envMap[provider];
        }

        if (!apiKey) {
            return { success: false, message: `No API key configured for ${provider}. Add one in AI Providers tab first.` };
        }

        // Call provider API directly to discover models
        const discovered = await discoverProviderModels(provider, apiKey);

        if (discovered.length === 0) {
            return { success: false, message: `No models discovered from ${provider}. Check your API key.` };
        }

        // Upsert discovered models into DB (preserve existing customer pricing)
        let inserted = 0;
        let updated = 0;

        for (const model of discovered) {
            const existing = await db.query.modelPricing.findFirst({
                where: and(
                    eq(modelPricing.provider, model.provider),
                    eq(modelPricing.modelId, model.modelId),
                ),
            });

            if (existing) {
                await db.update(modelPricing)
                    .set({
                        displayName: model.displayName,
                        category: model.category,
                        baseInputPerMillion: model.baseInputPerMillion.toString(),
                        baseOutputPerMillion: model.baseOutputPerMillion.toString(),
                        maxTokens: model.maxTokens,
                        updatedAt: new Date(),
                    })
                    .where(eq(modelPricing.id, existing.id));
                updated++;
            } else {
                await db.insert(modelPricing).values({
                    provider: model.provider,
                    modelId: model.modelId,
                    displayName: model.displayName,
                    category: model.category,
                    baseInputPerMillion: model.baseInputPerMillion.toString(),
                    baseOutputPerMillion: model.baseOutputPerMillion.toString(),
                    customerInputPerMillion: model.baseInputPerMillion.toString(),
                    customerOutputPerMillion: model.baseOutputPerMillion.toString(),
                    maxTokens: model.maxTokens,
                });
                inserted++;
            }
        }

        revalidatePath("/admin/settings");
        return { success: true, message: `Discovered ${discovered.length} models. ${inserted} new, ${updated} updated.` };
    } catch (err) {
        console.error("Failed to sync provider models:", err);
        return { success: false, message: "Failed to discover models." };
    }
}

// ─── Provider Model Discovery (inline) ─────────────────────────────────────

interface DiscoveredModel {
    modelId: string;
    displayName: string;
    provider: string;
    category: string;
    baseInputPerMillion: number;
    baseOutputPerMillion: number;
    maxTokens: number;
}

// Known pricing for common models (real provider costs, USD per 1M tokens)
const KNOWN_PRICING: Record<string, { input: number; output: number; maxTokens?: number; category?: string }> = {
    "claude-opus-4-6": { input: 15.0, output: 75.0, maxTokens: 32768 },
    "claude-sonnet-4-6": { input: 3.0, output: 15.0, maxTokens: 16384 },
    "claude-sonnet-4-20250514": { input: 3.0, output: 15.0, maxTokens: 8192 },
    "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0, maxTokens: 8192, category: "fast" },
    "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0, maxTokens: 8192, category: "fast" },
    "claude-3-haiku-20240307": { input: 0.25, output: 1.25, maxTokens: 4096, category: "fast" },
    "gpt-4.1": { input: 2.0, output: 8.0, maxTokens: 32768 },
    "gpt-4.1-mini": { input: 0.4, output: 1.6, maxTokens: 32768, category: "fast" },
    "gpt-4.1-nano": { input: 0.1, output: 0.4, maxTokens: 32768, category: "fast" },
    "gpt-4o": { input: 2.5, output: 10.0, maxTokens: 16384 },
    "gpt-4o-mini": { input: 0.15, output: 0.6, maxTokens: 16384, category: "fast" },
    "gpt-4-turbo": { input: 10.0, output: 30.0, maxTokens: 4096 },
    "o1": { input: 15.0, output: 60.0, maxTokens: 32768, category: "reasoning" },
    "o1-mini": { input: 1.1, output: 4.4, maxTokens: 16384, category: "reasoning" },
    "o3": { input: 10.0, output: 40.0, maxTokens: 32768, category: "reasoning" },
    "o3-mini": { input: 1.1, output: 4.4, maxTokens: 16384, category: "reasoning" },
    "o4-mini": { input: 1.1, output: 4.4, maxTokens: 16384, category: "reasoning" },
    "gemini-2.0-flash": { input: 0.1, output: 0.4, maxTokens: 8192, category: "fast" },
    "gemini-1.5-pro": { input: 1.25, output: 5.0, maxTokens: 8192 },
};

function categorizeModel(modelId: string): string {
    const known = KNOWN_PRICING[modelId];
    if (known?.category) return known.category;
    if (/haiku|mini|nano|flash/i.test(modelId)) return "fast";
    if (/o1|o3|o4|reasoning/i.test(modelId)) return "reasoning";
    return "flagship";
}

function prettifyModelId(modelId: string): string {
    return modelId
        .replace(/^models\//, "")
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
        .replace(/(\d) (\d)/g, "$1.$2");
}

async function discoverProviderModels(provider: string, apiKey: string): Promise<DiscoveredModel[]> {
    switch (provider) {
        case "anthropic": return discoverAnthropic(apiKey);
        case "openai": return discoverOpenAI(apiKey);
        case "openrouter": return discoverOpenRouter(apiKey);
        default: return [];
    }
}

async function discoverAnthropic(apiKey: string): Promise<DiscoveredModel[]> {
    const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const models: DiscoveredModel[] = [];
    for (const m of data.data || []) {
        if (/embed|instant/i.test(m.id)) continue;
        const known = KNOWN_PRICING[m.id];
        models.push({
            modelId: m.id,
            displayName: m.display_name || prettifyModelId(m.id),
            provider: "anthropic",
            category: categorizeModel(m.id),
            baseInputPerMillion: known?.input ?? 3.0,
            baseOutputPerMillion: known?.output ?? 15.0,
            maxTokens: known?.maxTokens ?? 8192,
        });
    }
    return models;
}

async function discoverOpenAI(apiKey: string): Promise<DiscoveredModel[]> {
    const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const models: DiscoveredModel[] = [];
    const chatPatterns = /^(gpt-4|gpt-3\.5|o1|o3|o4|chatgpt)/;
    const skipPatterns = /audio|realtime|tts|dall-e|whisper|embed|davinci|babbage|moderation|search/i;
    for (const m of data.data || []) {
        if (!chatPatterns.test(m.id) || skipPatterns.test(m.id)) continue;
        const known = KNOWN_PRICING[m.id];
        models.push({
            modelId: m.id,
            displayName: prettifyModelId(m.id),
            provider: "openai",
            category: categorizeModel(m.id),
            baseInputPerMillion: known?.input ?? 2.0,
            baseOutputPerMillion: known?.output ?? 8.0,
            maxTokens: known?.maxTokens ?? 16384,
        });
    }
    return models;
}

async function discoverOpenRouter(apiKey: string): Promise<DiscoveredModel[]> {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const models: DiscoveredModel[] = [];
    for (const m of data.data || []) {
        const inputPrice = parseFloat(m.pricing?.prompt || "0") * 1_000_000;
        const outputPrice = parseFloat(m.pricing?.completion || "0") * 1_000_000;
        if (inputPrice === 0 && outputPrice === 0) continue;
        models.push({
            modelId: m.id,
            displayName: m.name || prettifyModelId(m.id),
            provider: "openrouter",
            category: categorizeModel(m.id),
            baseInputPerMillion: inputPrice,
            baseOutputPerMillion: outputPrice,
            maxTokens: m.context_length ? Math.min(m.context_length, 32768) : 8192,
        });
    }
    return models;
}
