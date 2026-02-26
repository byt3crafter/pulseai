import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import SidebarUserMenu from "../../components/SidebarUserMenu";
import AdminNav from "../../components/AdminNav";
import { auth } from "../../auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Attempt to get session — may return null even when authenticated
    // (middleware already protects admin routes, so we always render the sidebar)
    const session = await auth();
    const userName = session?.user?.name || "Admin";

    return (
        <div className="flex h-screen bg-slate-50 w-full font-sans">

            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-slate-300 h-screen flex-shrink-0 flex flex-col border-r border-slate-800">
                <div className="h-14 px-5 flex items-center border-b border-slate-800 gap-2">
                    <ShieldCheckIcon className="w-5 h-5 text-indigo-400" />
                    <span className="text-sm font-bold text-white tracking-tight">
                        Pulse <span className="text-indigo-400">Admin</span>
                    </span>
                </div>

                <AdminNav />

                <div className="p-3 border-t border-slate-800">
                    <SidebarUserMenu
                        name={userName}
                        role="Administrator"
                        initials={userName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                        callbackUrl="/admin/login"
                        variant="dark"
                        settingsHref="/admin/settings"
                    />
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-auto bg-slate-50">
                {children}
            </main>
        </div>
    );
}
