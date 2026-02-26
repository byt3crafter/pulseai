import {
    Cog6ToothIcon,
    KeyIcon,
    ShieldCheckIcon
} from "@heroicons/react/24/outline";

import { saveGlobalSettingsAction, getGlobalSettings } from "./actions";

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';

    if (isNextBuild) {
        return <div>Building Component</div>;
    }

    const settings = await getGlobalSettings() as any;

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Global Configurations</h1>
                <p className="text-slate-500 mt-2">Manage backend environment variables, security keys, and Pulse system behaviors.</p>
            </div>

            <div className="space-y-6">

                {/* AI Providers */}
                <form action={saveGlobalSettingsAction} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <input type="hidden" name="section" value="providers" />
                    <div className="p-6 border-b border-slate-200">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 rounded-lg">
                                <CpuChipIcon className="w-5 h-5 text-indigo-600" />
                            </div>
                            <h2 className="text-lg font-semibold text-slate-900">AI Model Providers</h2>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 pl-12">Configure the master API keys used by all tenant agents.</p>
                    </div>

                    <div className="p-6 space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Anthropic API Key (Claude 3.7)</label>
                            <div className="flex">
                                <input
                                    type="password"
                                    name="anthropicApiKey"
                                    placeholder={settings.anthropicApiKeyHash ? "••••••••••••••••••••••••••••••••" : "sk-ant-api03-..."}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-l-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-slate-900 placeholder:text-slate-400"
                                />
                                <button type="submit" className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-l-0 border-indigo-200 rounded-r-lg font-medium hover:bg-indigo-100 transition-colors">
                                    Update
                                </button>
                            </div>
                            <p className="text-xs text-emerald-600 flex items-center mt-2">
                                <span className={`w-2 h-2 rounded-full mr-2 ${settings.anthropicApiKeyHash ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                {settings.anthropicApiKeyHash ? 'Active in Database' : 'Missing (Agent will fail)'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">OpenAI API Key (GPT-4o)</label>
                            <div className="flex">
                                <input
                                    type="password"
                                    name="openaiApiKey"
                                    placeholder={settings.openaiApiKeyHash ? "••••••••••••••••••••••••••••••••" : "sk-proj-..."}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-l-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-slate-900 placeholder:text-slate-400"
                                />
                                <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-r-lg font-medium hover:bg-slate-800 transition-colors">
                                    Save
                                </button>
                            </div>
                            <p className="text-xs text-emerald-600 flex items-center mt-2">
                                <span className={`w-2 h-2 rounded-full mr-2 ${settings.openaiApiKeyHash ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                {settings.openaiApiKeyHash ? 'Active in Database' : 'Optional fallback provider.'}
                            </p>
                        </div>
                    </div>
                </form>

                {/* Sandbox Defaults */}
                <form action={saveGlobalSettingsAction} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <input type="hidden" name="section" value="sandbox" />
                    <div className="p-6 border-b border-slate-200">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 rounded-lg">
                                <CodeBracketIcon className="w-5 h-5 text-slate-700" />
                            </div>
                            <h2 className="text-lg font-semibold text-slate-900">Default Sandbox Configuration</h2>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 pl-12">Default Docker execution engine settings for agents without specific overrides.</p>
                    </div>

                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Sandbox Mode</label>
                                <select
                                    name="sandboxMode"
                                    defaultValue={settings.gatewayConfig?.sandbox_defaults?.mode || "off"}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-slate-900"
                                >
                                    <option value="off">Off (Disabled)</option>
                                    <option value="non-main">Non-Main (Isolated)</option>
                                    <option value="all">All (Full Access)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Docker Image</label>
                                <input
                                    type="text"
                                    name="sandboxImage"
                                    defaultValue={settings.gatewayConfig?.sandbox_defaults?.docker?.image || ""}
                                    placeholder="alpine"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-slate-900 placeholder:text-slate-400"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors">
                                Save Defaults
                            </button>
                        </div>
                    </div>
                </form>

                {/* Pulse System Settings (Phases 8-13) */}
                <form action={saveGlobalSettingsAction} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <input type="hidden" name="section" value="pulse_system" />
                    <div className="p-6 border-b border-slate-200">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg">
                                <Cog6ToothIcon className="w-5 h-5 text-blue-600" />
                            </div>
                            <h2 className="text-lg font-semibold text-slate-900">Pulse System Services</h2>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 pl-12">Enable advanced features like hot-reload, trusted proxies, local discovery, and CLI backends.</p>
                    </div>

                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="enableHotReload"
                                        defaultChecked={settings.gatewayConfig?.enable_hot_reload ?? true}
                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                    />
                                    <div>
                                        <span className="text-sm font-medium text-slate-900">Enable Hot-Reload (Phase 8)</span>
                                        <p className="text-xs text-slate-500">Apply config changes without restarting</p>
                                    </div>
                                </label>
                            </div>

                            <div>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="lanDiscovery"
                                        defaultChecked={settings.gatewayConfig?.lan_discovery ?? false}
                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                    />
                                    <div>
                                        <span className="text-sm font-medium text-slate-900">LAN Discovery / Bonjour (Phase 12)</span>
                                        <p className="text-xs text-slate-500">Allow mDNS local gateway discovery</p>
                                    </div>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Trusted Proxy Network (Phase 10)</label>
                                <input
                                    type="text"
                                    name="trustedProxy"
                                    placeholder="10.0.0.0/8, 192.168.0.0/16"
                                    defaultValue={settings.gatewayConfig?.trusted_proxy || ""}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder:text-slate-400"
                                />
                                <p className="text-xs text-slate-500 mt-1">Comma-separated CIDR list for trusted LB proxies.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">CLI Backends Integration (Phase 13)</label>
                                <select
                                    name="cliBackends"
                                    defaultValue={settings.gatewayConfig?.cli_backends || "disabled"}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900"
                                >
                                    <option value="disabled">Disabled</option>
                                    <option value="enabled">Enabled (Local Only)</option>
                                    <option value="all">Enabled (All Interfaces)</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors">
                                Save System Services
                            </button>
                        </div>
                    </div>
                </form>

                {/* Exec Safety */}
                <a href="/admin/settings/exec-safety" className="block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:border-indigo-300 transition-colors">
                    <div className="p-6 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-rose-50 rounded-lg">
                                <ShieldCheckIcon className="w-5 h-5 text-rose-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Exec Safety</h2>
                                <p className="text-sm text-slate-500 mt-0.5">Command execution policies, audit logs, and safety rules.</p>
                            </div>
                        </div>
                        <span className="text-slate-400 text-sm">&rarr;</span>
                    </div>
                </a>

                {/* Scheduling */}
                <a href="/admin/settings/scheduling" className="block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:border-indigo-300 transition-colors">
                    <div className="p-6 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-50 rounded-lg">
                                <ClockIcon className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Scheduling</h2>
                                <p className="text-sm text-slate-500 mt-0.5">Cron jobs, scheduled tasks, and webhook triggers.</p>
                            </div>
                        </div>
                        <span className="text-slate-400 text-sm">&rarr;</span>
                    </div>
                </a>

                {/* Plugins */}
                <a href="/admin/plugins" className="block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:border-indigo-300 transition-colors">
                    <div className="p-6 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-violet-50 rounded-lg">
                                <PuzzleIcon className="w-5 h-5 text-violet-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Plugins</h2>
                                <p className="text-sm text-slate-500 mt-0.5">Install and manage plugins that extend Pulse AI.</p>
                            </div>
                        </div>
                        <span className="text-slate-400 text-sm">&rarr;</span>
                    </div>
                </a>

                {/* Database Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 rounded-lg">
                                <CircleStackIcon className="w-5 h-5 text-emerald-600" />
                            </div>
                            <h2 className="text-lg font-semibold text-slate-900">PostgreSQL Connection</h2>
                        </div>
                    </div>

                    <div className="p-6">
                        <label className="block text-sm font-medium text-slate-700 mb-1">DATABASE_URL</label>
                        <input
                            type="text"
                            readOnly
                            value="postgres://pulseadmin:******@localhost:5432/pulse"
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-500 focus:outline-none font-mono text-sm"
                        />
                        <div className="mt-4 flex gap-3">
                            <button className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors">
                                Test Connection
                            </button>
                            <button className="px-4 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 transition-colors">
                                Run Migrations
                            </button>
                        </div>
                    </div>
                </div>

                {/* Security Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-rose-50 rounded-lg">
                                <ShieldCheckIcon className="w-5 h-5 text-rose-600" />
                            </div>
                            <h2 className="text-lg font-semibold text-slate-900">Security & Encryption</h2>
                        </div>
                    </div>

                    <div className="p-6">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <div>
                                <p className="font-medium text-slate-900">ENCRYPTION_KEY Status</p>
                                <p className="text-sm text-slate-500">Used for signing OAuth tokens and NextAuth sessions.</p>
                            </div>
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">Valid (64-byte Hex)</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}

function CpuChipIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
    );
}

function CircleStackIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0v3.75C20.25 20.897 16.556 22.75 12 22.75s-8.25-1.847-8.25-4.125v-3.75" />
        </svg>
    )
}

function PuzzleIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
        </svg>
    );
}

function ClockIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
    );
}

function CodeBracketIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
        </svg>
    )
}
