import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../storage/db";
import { tenants, installedPlugins, tenantPluginConfigs, credentials } from "../../../storage/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { encrypt } from "../../../utils/crypto";
import { requireTenant } from "../../../utils/tenant-auth";
import PluginsPageClient from "./PluginsPageClient";

export const dynamic = "force-dynamic";

export default async function PluginsPage({
    searchParams,
}: {
    searchParams: Promise<{ plugin?: string }>;
}) {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");
    const tenantId = session.user.tenantId;

    const resolvedParams = await searchParams;
    const initialPlugin = resolvedParams?.plugin ?? null;

    const tenantRow = await db.select({ config: tenants.config }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const tenantConfig = (tenantRow[0]?.config as Record<string, any>) || {};

    // ─── Plugin data ─────────────────────────────────────────────────────────
    const allPlugins = await db.query.installedPlugins.findMany({
        where: eq(installedPlugins.enabled, true),
        orderBy: [desc(installedPlugins.installedAt)],
    });

    const tenantPluginConfigRows = await db.query.tenantPluginConfigs.findMany({ where: eq(tenantPluginConfigs.tenantId, tenantId) });
    const pluginConfigMap = new Map(tenantPluginConfigRows.map((c) => [c.pluginId, c]));

    const existingCreds = await db.query.credentials.findMany({
        where: eq(credentials.tenantId, tenantId),
        columns: { name: true },
    });
    const credentialNames = new Set(existingCreds.map((c) => c.name));

    const enabledPlugins = allPlugins
        .filter((p) => {
            const override = pluginConfigMap.get(p.id);
            return override ? override.enabled : true;
        })
        .map((p) => {
            const cfg = (p.config as Record<string, any>) || {};
            const credSchema = cfg.credentialSchema || [];
            const configuredCreds = credSchema.map((field: any) => ({
                ...field,
                configured: credentialNames.has(field.name?.toUpperCase?.() || field.name),
            }));
            return {
                id: p.id,
                name: p.name,
                version: p.version,
                config: {
                    description: cfg.description || "",
                    author: cfg.author || "",
                    toolCount: cfg.toolCount || 0,
                    hookNames: cfg.hookNames || [],
                    routeCount: cfg.routeCount || 0,
                    credentialSchema: configuredCreds,
                },
            };
        });

    const toolSearchConfig = {
        mode: (["off", "auto", "on"].includes(tenantConfig.toolSearch?.mode)
            ? tenantConfig.toolSearch.mode
            : "auto") as "off" | "auto" | "on",
        threshold: Math.max(1, Math.min(100, Math.floor(Number(tenantConfig.toolSearch?.threshold ?? 12)))),
        maxResults: Math.max(1, Math.min(25, Math.floor(Number(tenantConfig.toolSearch?.maxResults ?? 6)))),
    };

    async function savePluginCredentials(formData: FormData) {
        "use server";
        const tenantCheck = await requireTenant();
        if (!tenantCheck.authorized) return;
        const tid = tenantCheck.tenantId;

        const pluginName = formData.get("pluginName") as string;
        const schemaRaw = formData.get("credentialSchema") as string;
        if (!schemaRaw) return;

        let schema: Array<{ name: string; type: string }>;
        try { schema = JSON.parse(schemaRaw); } catch { return; }

        for (const field of schema) {
            const value = formData.get(`cred_${field.name}`) as string;
            if (!value) continue;
            const credName = field.name.toUpperCase();

            await db.insert(credentials).values({
                tenantId: tid,
                name: credName,
                encryptedValue: encrypt(value),
                description: `${pluginName} plugin credential`,
                credentialType: "api_key",
            }).onConflictDoUpdate({
                target: [credentials.tenantId, credentials.name],
                set: {
                    encryptedValue: encrypt(value),
                    description: `${pluginName} plugin credential`,
                    updatedAt: new Date(),
                },
            });
        }

        revalidatePath("/dashboard/plugins");
    }

    return (
        <PluginsPageClient
            plugins={enabledPlugins}
            savePluginCredentials={savePluginCredentials}
            toolSearchConfig={toolSearchConfig}
            initialPlugin={initialPlugin}
        />
    );
}
