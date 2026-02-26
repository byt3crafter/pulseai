import { db } from "../../../storage/db";
import { installedPlugins, tenantPluginConfigs, tenants } from "../../../storage/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import AdminPluginsClient from "./AdminPluginsClient";
import { requireAdmin } from "../../../utils/admin-auth";

export const dynamic = "force-dynamic";

async function toggleGlobalPlugin(formData: FormData) {
    "use server";
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return;

    const pluginId = formData.get("pluginId") as string;
    const enabled = formData.get("enabled") === "true";

    await db
        .update(installedPlugins)
        .set({ enabled: !enabled })
        .where(eq(installedPlugins.id, pluginId));

    revalidatePath("/admin/plugins");
}

async function setTenantPluginOverride(formData: FormData) {
    "use server";
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return;

    const tenantId = formData.get("tenantId") as string;
    const pluginId = formData.get("pluginId") as string;
    const currentlyEnabled = formData.get("enabled") === "true";

    const existing = await db.query.tenantPluginConfigs.findFirst({
        where: (table, { and, eq }) =>
            and(eq(table.tenantId, tenantId), eq(table.pluginId, pluginId)),
    });

    if (existing) {
        await db
            .update(tenantPluginConfigs)
            .set({ enabled: !currentlyEnabled })
            .where(eq(tenantPluginConfigs.id, existing.id));
    } else {
        await db.insert(tenantPluginConfigs).values({
            tenantId,
            pluginId,
            enabled: !currentlyEnabled,
            config: {},
        });
    }

    revalidatePath("/admin/plugins");
}

async function uninstallPlugin(formData: FormData) {
    "use server";
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return;

    const pluginId = formData.get("pluginId") as string;

    // Delete tenant configs first (FK constraint)
    await db.delete(tenantPluginConfigs).where(eq(tenantPluginConfigs.pluginId, pluginId));
    await db.delete(installedPlugins).where(eq(installedPlugins.id, pluginId));
    revalidatePath("/admin/plugins");
}

export default async function AdminPluginsPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const plugins = await db.query.installedPlugins.findMany({
        orderBy: [desc(installedPlugins.installedAt)],
    });

    const allTenants = await db.query.tenants.findMany({
        orderBy: [desc(tenants.createdAt)],
    });

    const allTenantConfigs = await db.query.tenantPluginConfigs.findMany();

    return (
        <AdminPluginsClient
            plugins={plugins.map((p) => ({
                id: p.id,
                name: p.name,
                version: p.version,
                source: p.source,
                sourcePath: p.sourcePath,
                enabled: p.enabled ?? true,
                config: (p.config as Record<string, any>) || {},
                installedAt: p.installedAt?.toISOString() || null,
            }))}
            tenants={allTenants.map((t) => ({
                id: t.id,
                name: t.name,
                slug: t.slug,
                status: t.status,
            }))}
            tenantConfigs={allTenantConfigs.map((c) => ({
                id: c.id,
                tenantId: c.tenantId,
                pluginId: c.pluginId,
                enabled: c.enabled ?? true,
            }))}
            toggleGlobalPlugin={toggleGlobalPlugin}
            setTenantPluginOverride={setTenantPluginOverride}
            uninstallPlugin={uninstallPlugin}
        />
    );
}
