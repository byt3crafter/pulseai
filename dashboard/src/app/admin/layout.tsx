import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import LogoutButton from "../../components/LogoutButton";
import AdminNav from "../../components/AdminNav";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen bg-gray-50 flex-col md:flex-row w-full font-sans">

            {/* Sidebar */}
            <aside className="w-full md:w-64 bg-slate-900 text-slate-300 md:h-screen flex-shrink-0 flex flex-col border-r border-slate-800">
                <div className="p-6 border-b border-slate-800 flex items-center gap-2">
                    <ShieldCheckIcon className="w-6 h-6 text-indigo-400" />
                    <span className="text-xl font-bold text-white tracking-tight">
                        Pulse <span className="text-indigo-400">Admin</span>
                    </span>
                </div>

                <AdminNav />

                <div className="p-4 border-t border-slate-800 flex flex-col gap-3">
                    <div className="text-xs text-slate-500 px-1">
                        Logged in as <b className="text-slate-300">Root Admin</b>
                    </div>
                    <LogoutButton />
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-auto bg-slate-50">
                {children}
            </main>
        </div>
    );
}
