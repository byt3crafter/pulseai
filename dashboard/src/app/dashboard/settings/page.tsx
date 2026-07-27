import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import { tenants, tenantBalances, channelConnections, oauthClients, tenantProviderKeys, pairingCodes, allowlists, apiTokens, installedPlugins, tenantPluginConfigs, credentials, users, tenantSkills } from "../../../storage/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { encrypt } from "../../../utils/crypto";
import { requireTenant } from "../../../utils/tenant-auth";
import { getEmbeddingStatusAction } from "./actions";
import { getCredentials, getTenantAgents, addCredential } from "./credentials/actions";
import { CHANNEL_SETUP_CATALOG } from "../../../utils/channel-catalog";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const session = await auth();
    const tenantId = session?.user?.tenantId;
    const resolvedParams = await searchParams;
    const tab = resolvedParams?.tab ?? "account";

    const [balances, channels, clients, providerKeys, apiTokensList] = await Promise.all([
        tenantId ? db.select().from(tenantBalances).where(eq(tenantBalances.tenantId, tenantId)).limit(1) : [],
        tenantId ? db.select().from(channelConnections).where(eq(channelConnections.tenantId, tenantId)) : [],
        tenantId ? db.select({ clientId: oauthClients.clientId, name: oauthClients.name, createdAt: oauthClients.createdAt })
            .from(oauthClients).where(eq(oauthClients.tenantId, tenantId)) : [],
        tenantId ? db.select({
            provider: tenantProviderKeys.provider,
            authMethod: tenantProviderKeys.authMethod,
            keyAlias: tenantProviderKeys.keyAlias,
            isActive: tenantProviderKeys.isActive,
            lastValidatedAt: tenantProviderKeys.lastValidatedAt,
        }).from(tenantProviderKeys).where(eq(tenantProviderKeys.tenantId, tenantId)) : [],
        tenantId ? db.select({
            id: apiTokens.id,
            name: apiTokens.name,
            createdAt: apiTokens.createdAt,
            lastUsedAt: apiTokens.lastUsedAt,
        }).from(apiTokens).where(eq(apiTokens.tenantId, tenantId)) : [],
    ]);

    // Fetch tenant config for telegram policies
    const tenantRow = tenantId
        ? await db.select({ config: tenants.config }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
        : [];
    const tenantConfig = (tenantRow[0]?.config as Record<string, any>) || {};

    // Read the display name fresh from the DB (not the JWT), so an edit is
    // reflected immediately without requiring a re-login.
    const userRow = session?.user?.id
        ? await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, session.user.id)).limit(1)
        : [];
    const freshUserName = userRow[0]?.name ?? session?.user?.name ?? "";

    // Credentials tab data (folded into the settings shell for a uniform layout).
    const [storedCredentials, credentialAgents] = tenantId
        ? await Promise.all([getCredentials(tenantId), getTenantAgents(tenantId)])
        : [[], []];

    // Fetch pending pairing codes
    const pendingPairings = tenantId
        ? await db.select({
            id: pairingCodes.id,
            code: pairingCodes.code,
            contactId: pairingCodes.contactId,
            contactName: pairingCodes.contactName,
            createdAt: pairingCodes.createdAt,
        }).from(pairingCodes).where(
            and(eq(pairingCodes.tenantId, tenantId), eq(pairingCodes.status, "pending"))
        )
        : [];

    // Fetch approved users
    const approvedUsers = tenantId
        ? await db.select({
            id: allowlists.id,
            contactId: allowlists.contactId,
            contactName: allowlists.contactName,
            contactType: allowlists.contactType,
        }).from(allowlists).where(
            and(
                eq(allowlists.tenantId, tenantId),
                eq(allowlists.channelType, "telegram"),
                eq(allowlists.contactType, "user"),
                eq(allowlists.status, "approved")
            )
        )
        : [];

    // Fetch approved groups
    const approvedGroups = tenantId
        ? await db.select({
            id: allowlists.id,
            contactId: allowlists.contactId,
            contactName: allowlists.contactName,
            contactType: allowlists.contactType,
        }).from(allowlists).where(
            and(
                eq(allowlists.tenantId, tenantId),
                eq(allowlists.channelType, "telegram"),
                eq(allowlists.contactType, "group"),
                eq(allowlists.status, "approved")
            )
        )
        : [];

    const embeddingStatus = await getEmbeddingStatusAction();

    const credits = Number(balances[0]?.balance ?? 0);
    const telegramChannel = channels.find(c => c.channelType === "telegram");
    const emailChannel = channels.find(c => c.channelType === "email");
    const channelSetupStatus = CHANNEL_SETUP_CATALOG.map((definition) => {
        const connection = channels.find((c) => c.channelType === definition.type);
        const config = (connection?.channelConfig as Record<string, unknown>) || {};
        const configuredFields = definition.fields
            .filter((field) => !!config[field.name])
            .map((field) => field.name);
        return {
            type: definition.type,
            status: connection?.status ?? "not_configured",
            configuredFields,
        };
    });

    // ─── Plugin data ─────────────────────────────────────────────────────────
    const allPlugins = tenantId
        ? await db.query.installedPlugins.findMany({
            where: eq(installedPlugins.enabled, true),
            orderBy: [desc(installedPlugins.installedAt)],
        })
        : [];

    const tenantPluginConfigRows = tenantId
        ? await db.query.tenantPluginConfigs.findMany({ where: eq(tenantPluginConfigs.tenantId, tenantId) })
        : [];
    const pluginConfigMap = new Map(tenantPluginConfigRows.map((c) => [c.pluginId, c]));

    const existingCreds = tenantId
        ? await db.query.credentials.findMany({
            where: eq(credentials.tenantId, tenantId),
            columns: { name: true },
        })
        : [];

    // Built-in tools currently enabled for this workspace (the tenant_skills gate).
    const enabledToolRows = tenantId
        ? await db.select({ skillName: tenantSkills.skillName })
            .from(tenantSkills)
            .where(and(eq(tenantSkills.tenantId, tenantId), eq(tenantSkills.enabled, true)))
        : [];
    const enabledTools = enabledToolRows.map((r) => r.skillName);
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

        revalidatePath("/dashboard/settings");
    }

    return (
        <SettingsClient
            tab={tab}
            credits={credits}
            telegramConnected={!!telegramChannel}
            channelSetups={channelSetupStatus}
            oauthClients={clients.map(c => ({ clientId: c.clientId, name: c.name, createdAt: c.createdAt?.toISOString() ?? "" }))}
            apiTokens={(apiTokensList || []).map((t: any) => ({
                id: t.id,
                name: t.name,
                createdAt: t.createdAt?.toISOString() ?? "",
                lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
            }))}
            userEmail={session?.user?.email ?? ""}
            userName={freshUserName}
            enableThirdPartyCli={tenantConfig.enable_third_party_cli ?? false}
            apiBaseUrl={process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.PORT || 3000}`}
            providerKeys={providerKeys.map(k => ({
                provider: k.provider,
                authMethod: k.authMethod,
                keyAlias: k.keyAlias,
                isActive: k.isActive,
                lastValidatedAt: k.lastValidatedAt?.toISOString() ?? null,
            }))}
            telegramConfig={{
                dmPolicy: tenantConfig.telegram_dm_policy ?? "open",
                groupPolicy: tenantConfig.telegram_group_policy ?? "disabled",
                requireMention: tenantConfig.telegram_require_mention ?? true,
                visionEnabled: tenantConfig.telegram_vision_enabled ?? true,
            }}
            autoMemoryConfig={{
                enabled: tenantConfig.auto_memory?.enabled !== false,
                maxMemories: Math.max(0, Math.min(5, Math.floor(Number(tenantConfig.auto_memory?.maxMemories ?? 3)))),
            }}
            commitmentsConfig={{
                enabled: tenantConfig.commitments?.enabled === true,
                deliveryMode: (["channel", "owner", "internal"].includes(tenantConfig.commitments?.deliveryMode)
                    ? tenantConfig.commitments.deliveryMode
                    : "internal") as "channel" | "owner" | "internal",
                maxPerDay: Math.max(0, Math.min(20, Math.floor(Number(tenantConfig.commitments?.maxPerDay ?? 3)))),
                ownerContact: typeof tenantConfig.commitments?.ownerContact === "string" ? tenantConfig.commitments.ownerContact : "",
            }}
            toolSearchConfig={{
                mode: (["off", "auto", "on"].includes(tenantConfig.toolSearch?.mode)
                    ? tenantConfig.toolSearch.mode
                    : "auto") as "off" | "auto" | "on",
                threshold: Math.max(1, Math.min(100, Math.floor(Number(tenantConfig.toolSearch?.threshold ?? 12)))),
                maxResults: Math.max(1, Math.min(25, Math.floor(Number(tenantConfig.toolSearch?.maxResults ?? 6)))),
            }}
            pendingPairings={pendingPairings.map(p => ({
                id: p.id,
                code: p.code,
                contactId: p.contactId,
                contactName: p.contactName,
                createdAt: p.createdAt?.toISOString() ?? "",
            }))}
            approvedUsers={approvedUsers.map(u => ({
                id: u.id,
                contactId: u.contactId,
                contactName: u.contactName,
            }))}
            approvedGroups={approvedGroups.map(g => ({
                id: g.id,
                contactId: g.contactId,
                contactName: g.contactName,
            }))}
            plugins={enabledPlugins}
            savePluginCredentials={savePluginCredentials}
            emailConfig={emailChannel ? (emailChannel.channelConfig as any) : null}
            embeddingConfigured={embeddingStatus.configured}
            allowSelfReset={tenantConfig.allow_self_reset ?? false}
            credentials={storedCredentials.map((c: any) => ({
                id: c.id,
                name: c.name,
                credentialType: c.credentialType,
                description: c.description ?? null,
                agentId: c.agentId ?? null,
                updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
            }))}
            credentialAgents={credentialAgents.map((a: any) => ({ id: a.id, name: a.name }))}
            addCredential={addCredential}
            enabledTools={enabledTools}
        />
    );
}
