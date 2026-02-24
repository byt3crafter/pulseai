import Link from "next/link";
import {
    UsersIcon,
    ChartBarIcon,
    Cog6ToothIcon,
    ShieldCheckIcon
} from "@heroicons/react/24/outline";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen bg-gray-50 flex-col md:flex-row w-full font-sans">

            {/* Sidebar for Super Admin */}
            <aside className="w-full md:w-64 bg-slate-900 text-slate-300 md:h-screen flex-shrink-0 flex flex-col border-r border-slate-800">
                <div className="p-6 border-b border-slate-800 flex items-center gap-2">
                    <ShieldCheckIcon className="w-6 h-6 text-indigo-400" />
                    <span className="text-xl font-bold text-white tracking-tight">Pulse <span className="text-indigo-400">Admin</span></span>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <Link href="/admin" className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium hover:bg-slate-800 hover:text-white transition-colors">
                        <ChartBarIcon className="w-5 h-5" />
                        Platform Overview
                    </Link>
                    <Link href="/admin/tenants" className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium bg-indigo-500/10 text-indigo-300">
                        <UsersIcon className="w-5 h-5" />
                        Tenant Management
                    </Link>
                    <Link href="/admin/settings" className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium hover:bg-slate-800 hover:text-white transition-colors">
                        <Cog6ToothIcon className="w-5 h-5" />
                        Global Settings
                    </Link>
                </nav>

                <div className="p-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
                    <span>Logged in as <b>Root</b></span>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto bg-slate-50">
                {children}
            </main>
        </div>
    );
}
