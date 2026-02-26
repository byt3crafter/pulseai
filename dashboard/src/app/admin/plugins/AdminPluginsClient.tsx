"use client";

import { useState } from "react";
import ConfirmDialog from "../../../components/ConfirmDialog";

interface PluginData {
    id: string;
    name: string;
    version: string | null;
    source: string;
    sourcePath: string | null;
    enabled: boolean;
    config: Record<string, any>;
    installedAt: string | null;
}

interface TenantData {
    id: string;
    name: string;
    slug: string;
    status: string | null;
}

interface TenantConfigData {
    id: string;
    tenantId: string;
    pluginId: string;
    enabled: boolean;
}

interface Props {
    plugins: PluginData[];
    tenants: TenantData[];
    tenantConfigs: TenantConfigData[];
    toggleGlobalPlugin: (formData: FormData) => Promise<void>;
    setTenantPluginOverride: (formData: FormData) => Promise<void>;
    uninstallPlugin: (formData: FormData) => Promise<void>;
}

export default function AdminPluginsClient({
    plugins,
    tenants,
    tenantConfigs,
    toggleGlobalPlugin,
    setTenantPluginOverride,
    uninstallPlugin,
}: Props) {
    const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());
    const [removePluginId, setRemovePluginId] = useState<string | null>(null);

    const toggleExpand = (pluginId: string) => {
        setExpandedPlugins((prev) => {
            const next = new Set(prev);
            if (next.has(pluginId)) next.delete(pluginId);
            else next.add(pluginId);
            return next;
        });
    };

    const configMap = new Map<string, TenantConfigData[]>();
    for (const c of tenantConfigs) {
        const list = configMap.get(c.pluginId) || [];
        list.push(c);
        configMap.set(c.pluginId, list);
    }

    return (
        <div className="p-8">
            <div className="mb-8">
                <a href="/admin/settings" className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">&larr; Back to Settings</a>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-violet-50 rounded-lg">
                        <PuzzleIcon className="w-6 h-6 text-violet-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Plugins</h1>
                </div>
                <p className="text-slate-500">Manage plugins and control per-tenant access.</p>
            </div>

            {plugins.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                    <PuzzleIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 text-sm">No plugins discovered. Place plugins in <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">pulse/plugins/</code> and restart the backend.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-slate-500">{plugins.length} plugin{plugins.length !== 1 ? "s" : ""} discovered</p>

                    {plugins.map((plugin) => {
                        const isExpanded = expandedPlugins.has(plugin.id);
                        const cfg = plugin.config || {};
                        const toolCount = cfg.toolCount || 0;
                        const routeCount = cfg.routeCount || 0;
                        const hookNames: string[] = cfg.hookNames || [];
                        const description = cfg.description || plugin.name;
                        const author = cfg.author || "";
                        const credentialSchema = cfg.credentialSchema || [];
                        const pluginTenantConfigs = configMap.get(plugin.id) || [];
                        const tenantConfigLookup = new Map(pluginTenantConfigs.map((c) => [c.tenantId, c]));

                        return (
                            <div key={plugin.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                {/* Plugin Header */}
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1.5">
                                                <h3 className="text-lg font-semibold text-slate-900">{plugin.name}</h3>
                                                <span className="text-xs text-slate-400">v{plugin.version || "?"}</span>
                                                <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded-full">{plugin.source}</span>
                                            </div>
                                            <p className="text-sm text-slate-500 mb-3">{description}</p>
                                            {author && <p className="text-xs text-slate-400 mb-3">by {author}</p>}

                                            {/* Stats badges */}
                                            <div className="flex flex-wrap gap-2">
                                                {toolCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-full">
                                                        <WrenchIcon className="w-3 h-3" /> {toolCount} tool{toolCount !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {routeCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-full">
                                                        <RouteIcon className="w-3 h-3" /> {routeCount} route{routeCount !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {hookNames.length > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded-full">
                                                        <HookIcon className="w-3 h-3" /> {hookNames.length} hook{hookNames.length !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {credentialSchema.length > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-violet-50 text-violet-700 rounded-full">
                                                        <KeyIcon className="w-3 h-3" /> {credentialSchema.length} credential{credentialSchema.length !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-3 ml-4">
                                            <form action={toggleGlobalPlugin}>
                                                <input type="hidden" name="pluginId" value={plugin.id} />
                                                <input type="hidden" name="enabled" value={String(plugin.enabled)} />
                                                <button
                                                    type="submit"
                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                        plugin.enabled ? "bg-green-500" : "bg-slate-300"
                                                    }`}
                                                    title={plugin.enabled ? "Disable globally" : "Enable globally"}
                                                >
                                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                        plugin.enabled ? "translate-x-6" : "translate-x-1"
                                                    }`} />
                                                </button>
                                            </form>

                                            <button
                                                onClick={() => toggleExpand(plugin.id)}
                                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
                                            >
                                                {isExpanded ? "Hide tenants" : "Manage tenants"}
                                            </button>

                                            <button
                                                onClick={() => setRemovePluginId(plugin.id)}
                                                className="text-xs text-red-500 hover:text-red-700 font-medium"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded: Tenant List */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                                        <h4 className="text-sm font-medium text-slate-700 mb-3">Per-Tenant Access</h4>
                                        {tenants.length === 0 ? (
                                            <p className="text-xs text-slate-400">No tenants found.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {tenants.map((tenant) => {
                                                    const override = tenantConfigLookup.get(tenant.id);
                                                    // Default enabled if no override exists
                                                    const isEnabled = override ? override.enabled : true;

                                                    return (
                                                        <div key={tenant.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-slate-200">
                                                            <div>
                                                                <span className="text-sm font-medium text-slate-800">{tenant.name}</span>
                                                                <span className="text-xs text-slate-400 ml-2">({tenant.slug})</span>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <span className={`text-xs font-medium ${isEnabled ? "text-green-600" : "text-slate-400"}`}>
                                                                    {isEnabled ? "Enabled" : "Disabled"}
                                                                    {!override && <span className="text-slate-300 ml-1">(default)</span>}
                                                                </span>
                                                                <form action={setTenantPluginOverride}>
                                                                    <input type="hidden" name="tenantId" value={tenant.id} />
                                                                    <input type="hidden" name="pluginId" value={plugin.id} />
                                                                    <input type="hidden" name="enabled" value={String(isEnabled)} />
                                                                    <button
                                                                        type="submit"
                                                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                                                            isEnabled ? "bg-green-500" : "bg-slate-300"
                                                                        }`}
                                                                    >
                                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                                                            isEnabled ? "translate-x-4" : "translate-x-0.5"
                                                                        }`} />
                                                                    </button>
                                                                </form>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <ConfirmDialog
                open={!!removePluginId}
                title="Remove Plugin"
                message="This will uninstall the plugin and remove it from all tenants. This action cannot be undone."
                confirmLabel="Remove Plugin"
                variant="danger"
                onConfirm={() => {
                    if (!removePluginId) return;
                    const fd = new FormData();
                    fd.append("pluginId", removePluginId);
                    uninstallPlugin(fd);
                    setRemovePluginId(null);
                }}
                onCancel={() => setRemovePluginId(null)}
            />
        </div>
    );
}

/* --- Inline SVG Icons --- */

function PuzzleIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
        </svg>
    );
}

function WrenchIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.049.58.025 1.194-.14 1.743" />
        </svg>
    );
}

function RouteIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
    );
}

function HookIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.752a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.5 8.688" />
        </svg>
    );
}

function KeyIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
    );
}
