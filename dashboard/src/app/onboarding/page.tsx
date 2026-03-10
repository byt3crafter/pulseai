import { auth } from "../../auth";
import { redirect } from "next/navigation";
import { db } from "../../storage/db";
import {
    users,
    tenants,
    tenantProviderKeys,
    channelConnections,
    installedPlugins,
    tenantPluginConfigs,
    credentials,
    agentProfiles,
} from "../../storage/schema";
import { eq, and } from "drizzle-orm";
import OnboardingWizard from "./OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/login");

    const user = session.user as any;
    if (user.onboardingComplete !== false) return redirect("/dashboard");

    const tenantId = user.tenantId as string;
    if (!tenantId) return redirect("/login");

    // Fetch tenant config to check apiMode
    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
        columns: { config: true },
    });
    const tenantConfig = (tenant?.config ?? {}) as Record<string, unknown>;
    const isPlatformMode = tenantConfig.apiMode === "platform";

    // Fetch current user record for mustChangePassword
    const [userRecord] = await db
        .select({ mustChangePassword: users.mustChangePassword })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

    // Fetch connected provider keys
    const providerKeys = await db
        .select({ provider: tenantProviderKeys.provider })
        .from(tenantProviderKeys)
        .where(
            and(
                eq(tenantProviderKeys.tenantId, tenantId),
                eq(tenantProviderKeys.isActive, true)
            )
        );

    // Fetch telegram connection
    const telegramConnections = await db
        .select({ id: channelConnections.id })
        .from(channelConnections)
        .where(
            and(
                eq(channelConnections.tenantId, tenantId),
                eq(channelConnections.channelType, "telegram"),
                eq(channelConnections.status, "active")
            )
        );

    // Fetch plugins enabled for this tenant (admin-installed + tenant-enabled)
    const enabledPlugins = await db
        .select({
            pluginId: tenantPluginConfigs.pluginId,
            pluginName: installedPlugins.name,
            pluginConfig: installedPlugins.config,
        })
        .from(tenantPluginConfigs)
        .innerJoin(
            installedPlugins,
            eq(tenantPluginConfigs.pluginId, installedPlugins.id)
        )
        .where(
            and(
                eq(tenantPluginConfigs.tenantId, tenantId),
                eq(tenantPluginConfigs.enabled, true),
                eq(installedPlugins.enabled, true)
            )
        );

    // Fetch existing credentials for this tenant
    const existingCredentials = await db
        .select({ name: credentials.name })
        .from(credentials)
        .where(eq(credentials.tenantId, tenantId));

    // Fetch agent profiles
    const agents = await db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.tenantId, tenantId));

    // Build plugin info with credential schema from plugin config
    const pluginsWithCredentials = enabledPlugins
        .map((p) => {
            const config = p.pluginConfig as any;
            const credentialSchema = config?.credentialSchema || [];
            return {
                pluginId: p.pluginId,
                pluginName: p.pluginName,
                credentialSchema,
                configured: credentialSchema.length === 0 || credentialSchema.every(
                    (field: any) => existingCredentials.some((c) => c.name === field.name)
                ),
            };
        })
        .filter((p) => p.credentialSchema.length > 0);

    // Determine current step based on DB state
    const needsPassword = userRecord?.mustChangePassword ?? false;
    const hasProvider = isPlatformMode || providerKeys.length > 0;
    const hasTelegram = telegramConnections.length > 0;
    const allPluginsConfigured =
        pluginsWithCredentials.length === 0 ||
        pluginsWithCredentials.every((p) => p.configured);
    const hasAgent = agents.length > 0;

    let currentStep = 1;
    if (!needsPassword) currentStep = 2;
    if (!needsPassword && hasProvider) currentStep = 3;
    if (!needsPassword && hasProvider && (hasTelegram || currentStep > 3))
        currentStep = hasTelegram ? 4 : 3;
    // Recalculate more carefully
    if (!needsPassword) {
        currentStep = 2;
        if (hasProvider) {
            currentStep = 3;
            // Step 3 (telegram) is skippable, so we only advance if they've connected
            // But we don't auto-advance past skippable steps — let the wizard handle skip state
        }
    }

    return (
        <OnboardingWizard
            initialStep={currentStep}
            needsPassword={needsPassword}
            connectedProviders={providerKeys.map((p) => p.provider)}
            hasTelegram={hasTelegram}
            plugins={pluginsWithCredentials}
            allPluginsConfigured={allPluginsConfigured}
            hasAgent={hasAgent}
            skipProviderStep={isPlatformMode}
        />
    );
}
