import { db } from "../../../../storage/db";
import { installedPlugins, tenantPluginConfigs, credentials } from "../../../../storage/schema";
import { eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { createCipheriv, randomBytes } from "crypto";
import TenantPluginsClient from "./TenantPluginsClient";
import { requireTenant } from "../../../../utils/tenant-auth";
import { BUSINESS_INTEGRATION_CATALOG, type BusinessCredentialField } from "../../../../utils/business-integrations";

type RuntimeStatus = "available" | "missing" | "admin_disabled" | "pending_approval";
type PluginConfigRecord = Record<string, unknown>;

export const dynamic = "force-dynamic";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length !== 64) throw new Error("ENCRYPTION_KEY must be 64-char hex");
    return Buffer.from(key, "hex");
}

function encrypt(plaintext: string): string {
    if (!plaintext) return "";
    const encKey = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, encKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function configRecord(value: unknown): PluginConfigRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? value as PluginConfigRecord : {};
}

function configString(config: PluginConfigRecord, key: string): string {
    const value = config[key];
    return typeof value === "string" ? value : "";
}

function configNumber(config: PluginConfigRecord, key: string): number {
    const value = config[key];
    return typeof value === "number" ? value : 0;
}

function configStringArray(config: PluginConfigRecord, key: string): string[] {
    const value = config[key];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function configCredentialSchema(config: PluginConfigRecord): BusinessCredentialField[] {
    const value = config.credentialSchema;
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        const name = typeof record.name === "string" ? record.name : "";
        const label = typeof record.label === "string" ? record.label : "";
        const type = record.type;
        if (!name || !label || (type !== "url" && type !== "text" && type !== "secret")) return [];

        return [{
            name,
            label,
            type,
            placeholder: typeof record.placeholder === "string" ? record.placeholder : undefined,
            required: typeof record.required === "boolean" ? record.required : undefined,
            helpText: typeof record.helpText === "string" ? record.helpText : undefined,
        }];
    });
}

async function savePluginCredentials(formData: FormData) {
    "use server";
    const tenantCheck = await requireTenant("tenant.settings.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    const pluginName = formData.get("pluginName") as string;
    const schemaRaw = formData.get("credentialSchema") as string;

    if (!schemaRaw) return;

    let schema: Array<{ name: string; type: string }>;
    try {
        schema = JSON.parse(schemaRaw);
    } catch {
        return;
    }

    for (const field of schema) {
        const value = formData.get(`cred_${field.name}`) as string;
        // Empty password fields = keep current value
        if (!value) continue;

        const credName = field.name.toUpperCase();

        await db
            .insert(credentials)
            .values({
                tenantId,
                name: credName,
                encryptedValue: encrypt(value),
                description: `${pluginName} plugin credential`,
                credentialType: field.type === "secret" ? "api_key" : "api_key",
            })
            .onConflictDoUpdate({
                // See plugins/page.tsx: migration 0050 made (tenant,name) a
                // PARTIAL unique (agent_id IS NULL), so ON CONFLICT must name
                // that predicate or the insert throws.
                target: [credentials.tenantId, credentials.name],
                targetWhere: sql`${credentials.agentId} is null`,
                set: {
                    encryptedValue: encrypt(value),
                    description: `${pluginName} plugin credential`,
                    updatedAt: new Date(),
                },
            });
    }

    revalidatePath("/dashboard/settings/plugins");
}

async function toggleTenantPluginEnabled(formData: FormData) {
    "use server";
    const tenantCheck = await requireTenant("tenant.settings.write");
    if (!tenantCheck.authorized) return;
    const tenantId = tenantCheck.tenantId;

    const pluginId = formData.get("pluginId") as string;
    const currentlyEnabled = formData.get("enabled") === "true";

    if (!pluginId) return;

    const plugin = await db.query.installedPlugins.findFirst({
        where: eq(installedPlugins.id, pluginId),
        columns: { id: true },
    });
    if (!plugin) return;

    await db
        .insert(tenantPluginConfigs)
        .values({
            tenantId,
            pluginId,
            enabled: !currentlyEnabled,
            config: {},
        })
        .onConflictDoUpdate({
            target: [tenantPluginConfigs.tenantId, tenantPluginConfigs.pluginId],
            set: {
                enabled: !currentlyEnabled,
            },
        });

    revalidatePath("/dashboard/settings/plugins");
}

export default async function TenantPluginsPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/auth/login");

    const tenantId = (session.user as { tenantId?: string | null }).tenantId;
    if (!tenantId) return <div className="p-4 sm:p-5 lg:p-6 text-pulse-muted">No tenant associated with this account.</div>;

    // Get globally-known plugins. Tenants can only activate plugins that are
    // globally enabled and approved, but disabled/pending plugins still show
    // honestly in the setup catalog.
    const allPlugins = await db.query.installedPlugins.findMany({
        orderBy: [desc(installedPlugins.installedAt)],
    });
    const pluginByName = new Map(allPlugins.map((p) => [p.name, p]));

    // Get tenant-specific overrides
    const tenantConfigs = await db.query.tenantPluginConfigs.findMany({
        where: eq(tenantPluginConfigs.tenantId, tenantId),
    });
    const configMap = new Map(tenantConfigs.map((c) => [c.pluginId, c]));

    // Get tenant's existing credential names (without values)
    const existingCreds = await db.query.credentials.findMany({
        where: eq(credentials.tenantId, tenantId),
        columns: { name: true, updatedAt: true },
    });
    const credentialNames = new Set(existingCreds.map((c) => c.name));

    const catalogPluginNames = new Set(BUSINESS_INTEGRATION_CATALOG.map((entry) => entry.pluginName));
    const catalogEntries = BUSINESS_INTEGRATION_CATALOG.map((entry) => {
        const plugin = pluginByName.get(entry.pluginName);
        const cfg = configRecord(plugin?.config);
        const pluginSchema = configCredentialSchema(cfg);
        const credSchema = pluginSchema.length > 0 ? pluginSchema : entry.credentialSchema;
        const tenantOverride = plugin ? configMap.get(plugin.id) : undefined;
        const tenantEnabled = plugin ? (tenantOverride ? tenantOverride.enabled !== false : true) : false;
        const globallyEnabled = plugin ? plugin.enabled !== false : false;
        const approved = plugin ? !!plugin.approvedHash && plugin.approvedHash === plugin.manifestHash : false;
        const runtimeStatus: RuntimeStatus =
            !plugin ? "missing" :
            !globallyEnabled ? "admin_disabled" :
            !approved ? "pending_approval" :
            "available";

        return {
            id: entry.id,
            pluginId: plugin?.id ?? null,
            pluginName: entry.pluginName,
            name: entry.name,
            version: plugin?.version ?? null,
            category: entry.category,
            runtimeStatus,
            tenantEnabled,
            canToggle: runtimeStatus === "available",
            setupNotes: entry.setupNotes,
            config: {
                description: configString(cfg, "description") || entry.description,
                author: configString(cfg, "author"),
                toolCount: configNumber(cfg, "toolCount"),
                hookNames: configStringArray(cfg, "hookNames"),
                routeCount: configNumber(cfg, "routeCount"),
                credentialSchema: credSchema.map((field) => ({
                    ...field,
                    configured: credentialNames.has(field.name?.toUpperCase?.() || field.name),
                })),
            },
        };
    });

    const otherPluginEntries = allPlugins
        .filter((plugin) => !catalogPluginNames.has(plugin.name))
        .map((plugin) => {
            const cfg = configRecord(plugin.config);
            const credSchema = configCredentialSchema(cfg);
            const tenantOverride = configMap.get(plugin.id);
            const tenantEnabled = tenantOverride ? tenantOverride.enabled !== false : true;
            const globallyEnabled = plugin.enabled !== false;
            const approved = !!plugin.approvedHash && plugin.approvedHash === plugin.manifestHash;
            const runtimeStatus: RuntimeStatus =
                !globallyEnabled ? "admin_disabled" :
                !approved ? "pending_approval" :
                "available";

            return {
                id: plugin.name,
                pluginId: plugin.id,
                pluginName: plugin.name,
                name: plugin.name,
                version: plugin.version,
                category: "API" as const,
                runtimeStatus,
                tenantEnabled,
                canToggle: runtimeStatus === "available",
                setupNotes: "Runtime is available when this plugin is globally enabled and approved.",
                config: {
                    description: configString(cfg, "description"),
                    author: configString(cfg, "author"),
                    toolCount: configNumber(cfg, "toolCount"),
                    hookNames: configStringArray(cfg, "hookNames"),
                    routeCount: configNumber(cfg, "routeCount"),
                    credentialSchema: credSchema.map((field) => ({
                        ...field,
                        configured: credentialNames.has(field.name?.toUpperCase?.() || field.name),
                    })),
                },
            };
        });

    return (
        <TenantPluginsClient
            integrations={[...catalogEntries, ...otherPluginEntries]}
            tenantId={tenantId}
            savePluginCredentials={savePluginCredentials}
            toggleTenantPluginEnabled={toggleTenantPluginEnabled}
        />
    );
}
