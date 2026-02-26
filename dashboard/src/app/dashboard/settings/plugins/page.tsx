import { db } from "../../../../storage/db";
import { installedPlugins, tenantPluginConfigs, credentials } from "../../../../storage/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { createCipheriv, randomBytes } from "crypto";
import TenantPluginsClient from "./TenantPluginsClient";
import { requireTenant } from "../../../../utils/tenant-auth";

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

async function savePluginCredentials(formData: FormData) {
    "use server";
    const tenantCheck = await requireTenant();
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
                target: [credentials.tenantId, credentials.name],
                set: {
                    encryptedValue: encrypt(value),
                    description: `${pluginName} plugin credential`,
                    updatedAt: new Date(),
                },
            });
    }

    revalidatePath("/dashboard/settings/plugins");
}

export default async function TenantPluginsPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/auth/login");

    const tenantId = (session.user as any).tenantId;
    if (!tenantId) return <div className="p-8 text-slate-500">No tenant associated with this account.</div>;

    // Get globally-enabled plugins
    const allPlugins = await db.query.installedPlugins.findMany({
        where: eq(installedPlugins.enabled, true),
        orderBy: [desc(installedPlugins.installedAt)],
    });

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

    // Build plugin data for client
    const enabledPlugins = allPlugins
        .filter((p) => {
            const override = configMap.get(p.id);
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

    return (
        <TenantPluginsClient
            plugins={enabledPlugins}
            tenantId={tenantId}
            savePluginCredentials={savePluginCredentials}
        />
    );
}
