export interface PluginAccessState {
    exists: boolean;
    globallyEnabled: boolean;
}

export interface TenantPluginOverrideState {
    enabled: boolean | null;
}

export function resolveTenantPluginEnabled(
    plugin: PluginAccessState,
    override?: TenantPluginOverrideState | null,
): boolean {
    if (!plugin.exists || !plugin.globallyEnabled) return false;
    if (override && override.enabled === false) return false;
    return true;
}

export async function isPluginEnabledForTenant(pluginName: string, tenantId: string): Promise<boolean> {
    const [{ and, eq }, { db }, { installedPlugins, tenantPluginConfigs }] = await Promise.all([
        import("drizzle-orm"),
        import("../storage/db.js"),
        import("../storage/schema.js"),
    ]);

    const plugin = await db.query.installedPlugins.findFirst({
        where: eq(installedPlugins.name, pluginName),
        columns: {
            id: true,
            enabled: true,
        },
    });

    if (!plugin) {
        return false;
    }

    const override = await db.query.tenantPluginConfigs.findFirst({
        where: and(
            eq(tenantPluginConfigs.tenantId, tenantId),
            eq(tenantPluginConfigs.pluginId, plugin.id),
        ),
        columns: {
            enabled: true,
        },
    });

    return resolveTenantPluginEnabled(
        { exists: true, globallyEnabled: plugin.enabled !== false },
        override ? { enabled: override.enabled } : undefined,
    );
}
