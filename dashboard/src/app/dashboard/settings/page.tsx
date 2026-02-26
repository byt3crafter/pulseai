import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import { tenants, tenantBalances, channelConnections, oauthClients, tenantProviderKeys, pairingCodes, allowlists, apiTokens } from "../../../storage/schema";
import { eq, and } from "drizzle-orm";
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

    const credits = Number(balances[0]?.balance ?? 0);
    const telegramChannel = channels.find(c => c.channelType === "telegram");

    return (
        <SettingsClient
            tab={tab}
            credits={credits}
            telegramConnected={!!telegramChannel}
            oauthClients={clients.map(c => ({ clientId: c.clientId, name: c.name, createdAt: c.createdAt?.toISOString() ?? "" }))}
            apiTokens={(apiTokensList || []).map((t: any) => ({
                id: t.id,
                name: t.name,
                createdAt: t.createdAt?.toISOString() ?? "",
                lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
            }))}
            userEmail={session?.user?.email ?? ""}
            userName={session?.user?.name ?? ""}
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
        />
    );
}
