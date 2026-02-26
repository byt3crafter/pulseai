import { db } from "../../../../storage/db";
import { installedPlugins, tenantPluginConfigs } from "../../../../storage/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function toggleTenantPlugin(formData: FormData) {
    "use server";
    const tenantId = formData.get("tenantId") as string;
    const pluginId = formData.get("pluginId") as string;
    const currentlyEnabled = formData.get("enabled") === "true";

    // Upsert the tenant plugin config
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

    revalidatePath("/dashboard/settings/plugins");
}

export default async function TenantPluginsPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/auth/login");

    const tenantId = (session.user as any).tenantId;
    if (!tenantId) return <div className="p-8 text-slate-500">No tenant associated with this account.</div>;

    // Get all admin-installed plugins
    const allPlugins = await db.query.installedPlugins.findMany({
        where: eq(installedPlugins.enabled, true),
        orderBy: [desc(installedPlugins.installedAt)],
    });

    // Get tenant-specific overrides
    const tenantConfigs = await db.query.tenantPluginConfigs.findMany({
        where: eq(tenantPluginConfigs.tenantId, tenantId),
    });

    const configMap = new Map(tenantConfigs.map((c) => [c.pluginId, c]));

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="mb-8">
                <a href="/dashboard/settings" className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">&larr; Back to Settings</a>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-violet-50 rounded-lg">
                        <PuzzleIcon className="w-6 h-6 text-violet-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Plugins</h1>
                </div>
                <p className="text-slate-500">Enable or disable installed plugins for your tenant.</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Available Plugins</h2>
                    <p className="text-sm text-slate-500 mt-1">{allPlugins.length} plugins available</p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                                <th className="px-6 py-3 font-medium">Plugin</th>
                                <th className="px-6 py-3 font-medium">Version</th>
                                <th className="px-6 py-3 font-medium">Source</th>
                                <th className="px-6 py-3 font-medium">Your Status</th>
                                <th className="px-6 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allPlugins.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400">
                                        No plugins available. Ask your administrator to install plugins.
                                    </td>
                                </tr>
                            )}
                            {allPlugins.map((plugin) => {
                                const tenantConfig = configMap.get(plugin.id);
                                // Default to enabled if no tenant config exists
                                const isEnabled = tenantConfig ? tenantConfig.enabled : true;

                                return (
                                    <tr key={plugin.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-6 py-3">
                                            <div className="text-sm font-medium text-slate-900">{plugin.name}</div>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-slate-500">{plugin.version || "—"}</td>
                                        <td className="px-6 py-3">
                                            <span className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded-full">{plugin.source}</span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                isEnabled ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                                            }`}>
                                                {isEnabled ? "Enabled" : "Disabled"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <form action={toggleTenantPlugin}>
                                                <input type="hidden" name="tenantId" value={tenantId} />
                                                <input type="hidden" name="pluginId" value={plugin.id} />
                                                <input type="hidden" name="enabled" value={String(isEnabled)} />
                                                <button type="submit" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                                                    {isEnabled ? "Disable" : "Enable"}
                                                </button>
                                            </form>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function PuzzleIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
        </svg>
    );
}
