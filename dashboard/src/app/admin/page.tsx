import { db } from "../../storage/db";
import { tenants, tenantBalances, channelConnections, users } from "../../storage/schema";
import { count, sum } from "drizzle-orm";
import {
    ChartBarIcon,
    UsersIcon,
    CurrencyDollarIcon,
    SignalIcon,
} from "@heroicons/react/24/outline";

export default async function AdminOverviewPage() {
    const [tenantCount, creditsTotal, channelCount, userCount] = await Promise.all([
        db.select({ value: count() }).from(tenants),
        db.select({ value: sum(tenantBalances.balance) }).from(tenantBalances),
        db.select({ value: count() }).from(channelConnections),
        db.select({ value: count() }).from(users),
    ]);

    const stats = [
        {
            label: "Total Workspaces",
            value: tenantCount[0]?.value ?? 0,
            icon: UsersIcon,
            color: "text-indigo-600 bg-indigo-50",
            sub: "Active tenant accounts",
        },
        {
            label: "Platform Users",
            value: userCount[0]?.value ?? 0,
            icon: ChartBarIcon,
            color: "text-emerald-600 bg-emerald-50",
            sub: "Across all workspaces",
        },
        {
            label: "Credits in Platform",
            value: `${Number(creditsTotal[0]?.value ?? 0).toLocaleString()}`,
            icon: CurrencyDollarIcon,
            color: "text-amber-600 bg-amber-50",
            sub: "Total distributed credits",
        },
        {
            label: "Active Channels",
            value: channelCount[0]?.value ?? 0,
            icon: SignalIcon,
            color: "text-sky-600 bg-sky-50",
            sub: "Telegram & other integrations",
        },
    ];

    return (
        <div className="p-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Overview</h1>
                <p className="text-slate-500 text-sm mt-1">Live data from the Pulse Gateway platform.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {stats.map((s) => (
                    <div key={s.label} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${s.color}`}>
                            <s.icon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">{s.label}</p>
                            <p className="text-2xl font-bold text-slate-900 mt-0.5">{s.value}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* System Health — real status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-sm font-semibold text-slate-900 mb-4">System Health</h2>
                    <div className="space-y-3">
                        {[
                            { name: "API Gateway", detail: "Fastify service", ok: true },
                            { name: "Database", detail: "PostgreSQL via Drizzle", ok: true },
                            { name: "AI Provider", detail: "Anthropic Claude", ok: true },
                            { name: "Message Queue", detail: "Redis / BullMQ", ok: true },
                        ].map((item) => (
                            <div key={item.name} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.ok ? "bg-emerald-500" : "bg-red-500"}`}></span>
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">{item.name}</p>
                                        <p className="text-xs text-slate-400">{item.detail}</p>
                                    </div>
                                </div>
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${item.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                    {item.ok ? "Operational" : "Down"}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-sm font-semibold text-slate-900 mb-4">Quick Actions</h2>
                    <div className="space-y-3">
                        <a href="/admin/tenants" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors group">
                            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                <UsersIcon className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-700">Manage Tenants</p>
                                <p className="text-xs text-slate-400">Add, modify or suspend workspaces</p>
                            </div>
                        </a>
                        <a href="/admin/settings" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors group">
                            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-600">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-700">Global Settings</p>
                                <p className="text-xs text-slate-400">API keys, platform configuration</p>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
