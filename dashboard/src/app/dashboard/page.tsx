// We must include the missing imports manually since Next.js complains otherwise for the Lucide icons or Hero icons if used improperly. 
// Moving forward with Heroicons for consistency.

export default function DashboardOverview() {
    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Workspace Overview</h1>
                <p className="text-sm text-gray-500 mt-1">Monitor your Agent's API usage, credit balance, and active channels.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Credit Balance Card */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <h2 className="text-sm font-medium text-gray-500">Available Credits</h2>
                        <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-full">Healthy</span>
                    </div>
                    <div className="mt-4">
                        <div className="text-4xl font-bold tracking-tight text-gray-900">4,520<span className="text-xl text-gray-400 font-medium tracking-normal">.00</span></div>
                        <p className="text-sm text-gray-500 mt-1">Est. ~1.5M input tokens remaining</p>
                    </div>
                    <button className="mt-6 w-full bg-slate-900 hover:bg-slate-800 text-white py-2 rounded-lg font-medium transition-colors text-sm shadow-sm">
                        Top Up Balance
                    </button>
                </div>

                {/* API Usage Card */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <h2 className="text-sm font-medium text-gray-500">API Usage (This Month)</h2>
                    </div>
                    <div className="mt-4">
                        <div className="text-4xl font-bold tracking-tight text-gray-900">$12<span className="text-xl text-gray-400 font-medium tracking-normal">.50</span></div>
                        <p className="text-sm text-red-500 mt-1 font-medium flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            +14% vs last month
                        </p>
                    </div>

                    <div className="mt-6">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Claude 3.7 Sonnet</span>
                            <span>85%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full" style={{ width: "85%" }}></div>
                        </div>
                    </div>
                </div>

                {/* Active Channels Card */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <h2 className="text-sm font-medium text-gray-500">Active Integrations</h2>
                    </div>
                    <div className="mt-4 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" /></svg>
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900">Telegram Bot</div>
                                <div className="text-xs text-gray-500">Connected to @SupportAgent</div>
                            </div>
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900">Local CLI Auth</div>
                                <div className="text-xs text-gray-500">Last seen: 2 hours ago</div>
                            </div>
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
