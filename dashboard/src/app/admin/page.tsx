import {
    ChartBarIcon,
    UsersIcon,
    CurrencyDollarIcon,
    CpuChipIcon,
} from "@heroicons/react/24/outline";

export default async function AdminOverviewPage() {
    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Platform Overview</h1>
                <p className="text-slate-500 mt-2">Monitor the health and usage of the entire Pulse Gateway platform.</p>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">

                {/* Stat 1 */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500 mb-1">Total Workspaces</p>
                        <p className="text-3xl font-bold text-slate-900">42</p>
                        <p className="text-xs text-emerald-600 font-medium mt-2 flex items-center">
                            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                            </svg>
                            +12% from last month
                        </p>
                    </div>
                    <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center">
                        <UsersIcon className="w-6 h-6 text-indigo-600" />
                    </div>
                </div>

                {/* Stat 2 */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500 mb-1">API Requests (24h)</p>
                        <p className="text-3xl font-bold text-slate-900">1.2M</p>
                        <p className="text-xs text-emerald-600 font-medium mt-2 flex items-center">
                            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                            </svg>
                            +5.4% from yesterday
                        </p>
                    </div>
                    <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center">
                        <ChartBarIcon className="w-6 h-6 text-emerald-600" />
                    </div>
                </div>

                {/* Stat 3 */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500 mb-1">Credits Distributed</p>
                        <p className="text-3xl font-bold text-slate-900">$4,500</p>
                        <p className="text-xs text-slate-400 font-medium mt-2 flex items-center">
                            Stable
                        </p>
                    </div>
                    <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center">
                        <CurrencyDollarIcon className="w-6 h-6 text-amber-600" />
                    </div>
                </div>

                {/* Stat 4 */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500 mb-1">Active LLM Tokens (M)</p>
                        <p className="text-3xl font-bold text-slate-900">34.5</p>
                        <p className="text-xs text-rose-600 font-medium mt-2 flex items-center">
                            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                            -2.1% from last month
                        </p>
                    </div>
                    <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center">
                        <CpuChipIcon className="w-6 h-6 text-rose-600" />
                    </div>
                </div>

            </div>

            {/* Main Charts Area Placeholder */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Main Graph */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-semibold text-slate-900">Traffic Activity</h3>
                        <select className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option>Last 7 Days</option>
                            <option>Last 30 Days</option>
                        </select>
                    </div>

                    {/* Mock Graph Layout */}
                    <div className="h-64 flex items-end justify-between space-x-2">
                        {/* Generate some random height bars for the mock chart */}
                        {[40, 70, 45, 90, 65, 80, 50, 95, 60, 100, 75, 85, 55, 65].map((h, i) => (
                            <div key={i} className="w-full bg-indigo-100 hover:bg-indigo-200 rounded-t transition-colors relative group" style={{ height: `${h}%` }}>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                    {h * 1234}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* System Status Table */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-6">System Health</h3>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                <div>
                                    <p className="text-sm font-medium text-slate-900">API Gateway</p>
                                    <p className="text-xs text-slate-500">12ms avg latency</p>
                                </div>
                            </div>
                            <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-1 rounded">Operational</span>
                        </div>

                        <div className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                <div>
                                    <p className="text-sm font-medium text-slate-900">Anthropic Connection</p>
                                    <p className="text-xs text-slate-500">450ms avg response</p>
                                </div>
                            </div>
                            <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-1 rounded">Operational</span>
                        </div>

                        <div className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                <div>
                                    <p className="text-sm font-medium text-slate-900">Database Load</p>
                                    <p className="text-xs text-slate-500">65% connection pool</p>
                                </div>
                            </div>
                            <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-1 rounded">Moderate</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}
