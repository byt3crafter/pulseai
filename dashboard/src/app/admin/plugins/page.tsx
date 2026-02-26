import { db } from "../../../storage/db";
import { installedPlugins } from "../../../storage/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function installPlugin(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const source = formData.get("source") as string;
    const sourcePath = formData.get("sourcePath") as string;
    const version = (formData.get("version") as string) || "1.0.0";

    await db.insert(installedPlugins).values({
        name,
        version,
        source,
        sourcePath,
        enabled: true,
        config: {},
    }).onConflictDoNothing();

    revalidatePath("/admin/plugins");
}

async function togglePlugin(formData: FormData) {
    "use server";
    const pluginId = formData.get("pluginId") as string;
    const enabled = formData.get("enabled") === "true";

    await db
        .update(installedPlugins)
        .set({ enabled: !enabled })
        .where(eq(installedPlugins.id, pluginId));

    revalidatePath("/admin/plugins");
}

async function uninstallPlugin(formData: FormData) {
    "use server";
    const pluginId = formData.get("pluginId") as string;

    await db.delete(installedPlugins).where(eq(installedPlugins.id, pluginId));
    revalidatePath("/admin/plugins");
}

export default async function AdminPluginsPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const plugins = await db.query.installedPlugins.findMany({
        orderBy: [desc(installedPlugins.installedAt)],
    });

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="mb-8">
                <a href="/admin/settings" className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">&larr; Back to Settings</a>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-violet-50 rounded-lg">
                        <PuzzleIcon className="w-6 h-6 text-violet-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Plugins</h1>
                </div>
                <p className="text-slate-500">Manage installed plugins that extend Pulse AI capabilities.</p>
            </div>

            <div className="space-y-6">
                {/* Install Plugin */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Install Plugin</h2>
                    </div>
                    <form action={installPlugin} className="p-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Plugin Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    placeholder="my-plugin"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                                <select
                                    name="source"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"
                                >
                                    <option value="local">Local Directory</option>
                                    <option value="builtin">Built-in</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Version</label>
                                <input
                                    type="text"
                                    name="version"
                                    placeholder="1.0.0"
                                    defaultValue="1.0.0"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Source Path</label>
                            <input
                                type="text"
                                name="sourcePath"
                                required
                                placeholder="/path/to/plugin/index.ts or plugins/my-plugin/index.ts"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                            />
                        </div>
                        <div className="flex justify-end">
                            <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors text-sm">
                                Install Plugin
                            </button>
                        </div>
                    </form>
                </div>

                {/* Plugins Table */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-900">Installed Plugins</h2>
                        <p className="text-sm text-slate-500 mt-1">{plugins.length} plugins installed</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                                    <th className="px-6 py-3 font-medium">Name</th>
                                    <th className="px-6 py-3 font-medium">Version</th>
                                    <th className="px-6 py-3 font-medium">Source</th>
                                    <th className="px-6 py-3 font-medium">Status</th>
                                    <th className="px-6 py-3 font-medium">Installed</th>
                                    <th className="px-6 py-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {plugins.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">
                                            No plugins installed. Install one above to extend Pulse AI.
                                        </td>
                                    </tr>
                                )}
                                {plugins.map((plugin) => (
                                    <tr key={plugin.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-6 py-3">
                                            <div className="text-sm font-medium text-slate-900">{plugin.name}</div>
                                            <div className="text-xs text-slate-400 truncate max-w-xs">{plugin.sourcePath}</div>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-slate-500">{plugin.version || "—"}</td>
                                        <td className="px-6 py-3">
                                            <span className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded-full">{plugin.source}</span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                plugin.enabled ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                                            }`}>
                                                {plugin.enabled ? "Enabled" : "Disabled"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-xs text-slate-400">
                                            {plugin.installedAt ? new Date(plugin.installedAt).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex gap-2">
                                                <form action={togglePlugin}>
                                                    <input type="hidden" name="pluginId" value={plugin.id} />
                                                    <input type="hidden" name="enabled" value={String(plugin.enabled)} />
                                                    <button type="submit" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                                                        {plugin.enabled ? "Disable" : "Enable"}
                                                    </button>
                                                </form>
                                                <form action={uninstallPlugin}>
                                                    <input type="hidden" name="pluginId" value={plugin.id} />
                                                    <button type="submit" className="text-xs text-red-600 hover:text-red-800 font-medium">
                                                        Uninstall
                                                    </button>
                                                </form>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
