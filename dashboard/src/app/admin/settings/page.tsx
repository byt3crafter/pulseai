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
