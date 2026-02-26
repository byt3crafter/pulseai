"use client";

import { useState } from "react";

interface CredentialField {
    name: string;
    label: string;
    type: "url" | "text" | "secret";
    placeholder?: string;
    required?: boolean;
    helpText?: string;
    configured: boolean;
}

interface PluginData {
    id: string;
    name: string;
    version: string | null;
    config: {
        description: string;
        author: string;
        toolCount: number;
        hookNames: string[];
        routeCount: number;
        credentialSchema: CredentialField[];
    };
}

interface Props {
    plugins: PluginData[];
    tenantId: string;
    savePluginCredentials: (formData: FormData) => Promise<void>;
}

export default function TenantPluginsClient({ plugins, tenantId, savePluginCredentials }: Props) {
    const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());

    const toggleExpand = (pluginId: string) => {
        setExpandedPlugins((prev) => {
            const next = new Set(prev);
            if (next.has(pluginId)) next.delete(pluginId);
            else next.add(pluginId);
            return next;
        });
    };

    return (
        <div className="p-8">
            <div className="mb-8">
                <a href="/dashboard/settings" className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">&larr; Back to Settings</a>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-violet-50 rounded-lg">
                        <PuzzleIcon className="w-6 h-6 text-violet-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Plugins</h1>
                </div>
                <p className="text-slate-500">Plugins enabled for your account. Configure credentials to activate integrations.</p>
            </div>

            {plugins.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                    <PuzzleIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 text-sm">No plugins enabled for your account. Contact your administrator.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-slate-500">{plugins.length} plugin{plugins.length !== 1 ? "s" : ""} enabled</p>

                    {plugins.map((plugin) => {
                        const { config } = plugin;
                        const hasCredentials = config.credentialSchema.length > 0;
                        const isExpanded = expandedPlugins.has(plugin.id);
                        const allConfigured = config.credentialSchema.every((f) => f.configured);
                        const noneConfigured = config.credentialSchema.every((f) => !f.configured);

                        return (
                            <div key={plugin.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                {/* Plugin Header */}
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1.5">
                                                <h3 className="text-lg font-semibold text-slate-900">{plugin.name}</h3>
                                                <span className="text-xs text-slate-400">v{plugin.version || "?"}</span>
                                            </div>
                                            <p className="text-sm text-slate-500 mb-3">{config.description}</p>

                                            {/* Stats + Status */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                {config.toolCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-full">
                                                        {config.toolCount} tool{config.toolCount !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {config.routeCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-full">
                                                        {config.routeCount} route{config.routeCount !== 1 ? "s" : ""}
                                                    </span>
                                                )}

                                                {hasCredentials && (
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full font-medium ${
                                                        allConfigured
                                                            ? "bg-green-50 text-green-700"
                                                            : noneConfigured
                                                            ? "bg-red-50 text-red-600"
                                                            : "bg-amber-50 text-amber-700"
                                                    }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                                            allConfigured ? "bg-green-500" : noneConfigured ? "bg-red-400" : "bg-amber-500"
                                                        }`} />
                                                        {allConfigured ? "Configured" : noneConfigured ? "Not configured" : "Partially configured"}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {hasCredentials && (
                                            <button
                                                onClick={() => toggleExpand(plugin.id)}
                                                className="ml-4 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
                                            >
                                                {isExpanded ? "Close" : "Configure"}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded: Credential Form */}
                                {isExpanded && hasCredentials && (
                                    <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                                        <h4 className="text-sm font-medium text-slate-700 mb-3">Credentials</h4>
                                        <form action={savePluginCredentials} className="space-y-4">
                                            <input type="hidden" name="tenantId" value={tenantId} />
                                            <input type="hidden" name="pluginName" value={plugin.name} />
                                            <input type="hidden" name="credentialSchema" value={JSON.stringify(config.credentialSchema)} />

                                            <div className="space-y-3">
                                                {config.credentialSchema.map((field) => (
                                                    <div key={field.name} className="bg-white rounded-lg border border-slate-200 p-4">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <label className="text-sm font-medium text-slate-700">
                                                                {field.label}
                                                            </label>
                                                            {field.required && <span className="text-red-400 text-xs">required</span>}
                                                            <span className={`ml-auto inline-flex items-center gap-1 text-xs ${
                                                                field.configured ? "text-green-600" : "text-slate-400"
                                                            }`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                                    field.configured ? "bg-green-500" : "bg-slate-300"
                                                                }`} />
                                                                {field.configured ? "Saved" : "Not set"}
                                                            </span>
                                                        </div>
                                                        {field.helpText && (
                                                            <p className="text-xs text-slate-400 mb-2">{field.helpText}</p>
                                                        )}
                                                        <input
                                                            type={field.type === "secret" ? "password" : field.type === "url" ? "url" : "text"}
                                                            name={`cred_${field.name}`}
                                                            placeholder={field.configured ? "Leave empty to keep current value" : field.placeholder || ""}
                                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400"
                                                        />
                                                        <p className="text-xs text-slate-400 mt-1 font-mono">{field.name}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex items-center justify-between pt-2">
                                                <p className="text-xs text-slate-400">
                                                    Encrypted with AES-256-GCM. Empty fields are skipped.
                                                </p>
                                                <SubmitButton />
                                            </div>
                                        </form>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function SubmitButton() {
    // Simple submit button - can't use useFormStatus across module boundaries easily,
    // so we keep it inline here
    return (
        <button
            type="submit"
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
        >
            Save Credentials
        </button>
    );
}

function PuzzleIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
        </svg>
    );
}
