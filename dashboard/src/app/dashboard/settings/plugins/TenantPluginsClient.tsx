"use client";

import { useState } from "react";
import type { SVGProps } from "react";

interface CredentialField {
    name: string;
    label: string;
    type: "url" | "text" | "secret";
    placeholder?: string;
    required?: boolean;
    helpText?: string;
    configured: boolean;
}

type RuntimeStatus = "available" | "missing" | "admin_disabled" | "pending_approval";

interface IntegrationData {
    id: string;
    pluginId: string | null;
    pluginName: string;
    name: string;
    version: string | null;
    category: "ERP" | "Accounting" | "API";
    runtimeStatus: RuntimeStatus;
    tenantEnabled: boolean;
    canToggle: boolean;
    setupNotes: string;
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
    integrations: IntegrationData[];
    tenantId: string;
    savePluginCredentials: (formData: FormData) => Promise<void>;
    toggleTenantPluginEnabled: (formData: FormData) => Promise<void>;
}

export default function TenantPluginsClient({
    integrations,
    tenantId,
    savePluginCredentials,
    toggleTenantPluginEnabled,
}: Props) {
    const [expandedIntegrations, setExpandedIntegrations] = useState<Set<string>>(new Set());

    const toggleExpand = (integrationId: string) => {
        setExpandedIntegrations((prev) => {
            const next = new Set(prev);
            if (next.has(integrationId)) next.delete(integrationId);
            else next.add(integrationId);
            return next;
        });
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-8">
                <a href="/dashboard/settings" className="text-sm text-indigo-500 hover:text-indigo-400 mb-2 inline-block transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">&larr; Back to Settings</a>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-violet-500/10 rounded-lg">
                        <PuzzleIcon className="w-6 h-6 text-violet-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-pulse-text tracking-tight">Business Integrations</h1>
                </div>
                <p className="text-pulse-muted">Enable, disable, and set up business systems for this workspace.</p>
            </div>

            {integrations.length === 0 ? (
                <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle p-12 text-center">
                    <PuzzleIcon className="w-12 h-12 text-pulse-faint mx-auto mb-4" />
                    <p className="text-pulse-muted text-sm">No integrations are available. Contact your administrator.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-pulse-muted">{integrations.length} integration{integrations.length !== 1 ? "s" : ""} available for setup</p>

                    {integrations.map((integration) => {
                        const { config } = integration;
                        const hasCredentials = config.credentialSchema.length > 0;
                        const isExpanded = expandedIntegrations.has(integration.id);
                        const allConfigured = config.credentialSchema.every((f) => f.configured);
                        const noneConfigured = config.credentialSchema.every((f) => !f.configured);
                        const runtimeLabel =
                            integration.runtimeStatus === "available" ? "Runtime available" :
                            integration.runtimeStatus === "admin_disabled" ? "Disabled by admin" :
                            integration.runtimeStatus === "pending_approval" ? "Pending approval" :
                            "Setup only";
                        const runtimeClass =
                            integration.runtimeStatus === "available" ? "bg-green-500/10 text-green-400" :
                            integration.runtimeStatus === "admin_disabled" ? "bg-red-500/10 text-red-400" :
                            integration.runtimeStatus === "pending_approval" ? "bg-amber-500/10 text-amber-400" :
                            "bg-pulse-hover text-pulse-muted";

                        return (
                            <div key={integration.id} className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                                {/* Integration Header */}
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1.5">
                                                <h3 className="text-lg font-semibold text-pulse-text">{integration.name}</h3>
                                                <span className="text-xs text-pulse-faint">{integration.category}</span>
                                                {integration.version && <span className="text-xs text-pulse-faint">v{integration.version}</span>}
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full font-medium ${runtimeClass}`}>
                                                    {runtimeLabel}
                                                </span>
                                                {integration.canToggle && (
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full font-medium ${
                                                        integration.tenantEnabled ? "bg-green-500/10 text-green-400" : "bg-pulse-hover text-pulse-muted"
                                                    }`}>
                                                        {integration.tenantEnabled ? "Enabled" : "Disabled"}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-pulse-muted mb-3">{config.description}</p>
                                            <p className="text-xs text-pulse-faint mb-3">{integration.setupNotes}</p>

                                            {/* Stats + Status */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                {config.toolCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/10 text-blue-400 rounded-full">
                                                        {config.toolCount} tool{config.toolCount !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {config.routeCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-emerald-500/10 text-emerald-400 rounded-full">
                                                        {config.routeCount} route{config.routeCount !== 1 ? "s" : ""}
                                                    </span>
                                                )}

                                                {hasCredentials && (
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full font-medium ${
                                                        allConfigured
                                                            ? "bg-green-500/10 text-green-400"
                                                            : noneConfigured
                                                            ? "bg-red-500/10 text-red-400"
                                                            : "bg-amber-500/10 text-amber-400"
                                                    }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                                            allConfigured ? "bg-green-500" : noneConfigured ? "bg-red-400" : "bg-amber-500"
                                                        }`} />
                                                        {allConfigured ? "Configured" : noneConfigured ? "Not configured" : "Partially configured"}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="ml-4 flex items-center gap-2">
                                            {integration.canToggle && integration.pluginId && (
                                                <form action={toggleTenantPluginEnabled}>
                                                    <input type="hidden" name="pluginId" value={integration.pluginId} />
                                                    <input type="hidden" name="enabled" value={String(integration.tenantEnabled)} />
                                                    <button
                                                        type="submit"
                                                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                                            integration.tenantEnabled
                                                                ? "text-red-400 hover:bg-red-500/10"
                                                                : "text-green-400 hover:bg-green-500/10"
                                                        }`}
                                                    >
                                                        {integration.tenantEnabled ? "Disable" : "Enable"}
                                                    </button>
                                                </form>
                                            )}
                                            {hasCredentials && (
                                                <button
                                                    onClick={() => toggleExpand(integration.id)}
                                                    className="px-3 py-1.5 text-sm font-medium text-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                >
                                                    {isExpanded ? "Close" : "Set up"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded: Credential Form */}
                                {isExpanded && hasCredentials && (
                                    <div className="border-t border-pulse-border-subtle bg-pulse-panel-alt px-5 py-4">
                                        <h4 className="text-sm font-medium text-pulse-text-soft mb-3">Credentials</h4>
                                        <form action={savePluginCredentials} className="space-y-4">
                                            <input type="hidden" name="tenantId" value={tenantId} />
                                            <input type="hidden" name="pluginName" value={integration.pluginName} />
                                            <input type="hidden" name="credentialSchema" value={JSON.stringify(config.credentialSchema)} />

                                            <div className="space-y-3">
                                                {config.credentialSchema.map((field) => (
                                                    <div key={field.name} className="bg-pulse-panel rounded-lg border border-pulse-border-subtle p-4">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <label className="text-sm font-medium text-pulse-text-soft">
                                                                {field.label}
                                                            </label>
                                                            {field.required && <span className="text-red-400 text-xs">required</span>}
                                                            <span className={`ml-auto inline-flex items-center gap-1 text-xs ${
                                                                field.configured ? "text-green-400" : "text-pulse-faint"
                                                            }`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                                    field.configured ? "bg-green-500" : "bg-pulse-border-strong"
                                                                }`} />
                                                                {field.configured ? "Saved" : "Not set"}
                                                            </span>
                                                        </div>
                                                        {field.helpText && (
                                                            <p className="text-xs text-pulse-faint mb-2">{field.helpText}</p>
                                                        )}
                                                        <input
                                                            type={field.type === "secret" ? "password" : field.type === "url" ? "url" : "text"}
                                                            name={`cred_${field.name}`}
                                                            placeholder={field.configured ? "Leave empty to keep current value" : field.placeholder || ""}
                                                            className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                                        />
                                                        <p className="text-xs text-pulse-faint mt-1 font-mono">{field.name}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex items-center justify-between pt-2">
                                                <p className="text-xs text-pulse-faint">
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
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel-alt"
        >
            Save Credentials
        </button>
    );
}

function PuzzleIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
        </svg>
    );
}
