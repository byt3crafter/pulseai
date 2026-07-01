import Link from "next/link";
import SidebarUserMenu from "../../components/SidebarUserMenu";
import AdminNav from "../../components/AdminNav";
import CommandPalette from "../../components/admin/CommandPalette";
import StatusBar from "../../components/admin/StatusBar";
import { auth } from "../../auth";
import { getAdminStatus } from "./overview-data";
import { db } from "../../storage/db";
import { tenants } from "../../storage/schema";
import { ui } from "../../components/admin/ui";

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
    const initials = userName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

    const [status, tenantRows] = await Promise.all([
        getAdminStatus(),
        db.select({ id: tenants.id, name: tenants.name }).from(tenants).orderBy(tenants.name).limit(200),
    ]);

    return (
        <div className="flex flex-col h-screen bg-[#0A0A0B] text-[#EDEDED] font-sans">
            <div className="flex flex-1 min-h-0">
                {/* Sidebar */}
                <aside className="w-[232px] flex-shrink-0 bg-[#0C0C0E] border-r border-[#242429] flex flex-col">
                    {/* Brand */}
                    <div className="h-14 px-4 flex items-center gap-2.5 border-b border-[#242429]">
                        <span className="w-7 h-7 rounded bg-[#8B5CF6] flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">P</span>
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-[#EDEDED] leading-none">PULSE</p>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[#5A5A61] mt-1">Admin Console</p>
                        </div>
                    </div>

                    {/* Environment */}
                    <div className="mx-3 mt-3 border border-[#242429] rounded-md p-2.5">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]">Environment</p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" aria-hidden="true" />
                            <span className="text-[#EDEDED] text-xs">PRODUCTION</span>
                        </div>
                        <p className="text-[11px] text-[#5A5A61] mt-0.5">pulse.runstate.mu</p>
                    </div>

                    <div className="flex-1 overflow-y-auto mt-2">
                        <AdminNav />
                    </div>

                    {/* User */}
                    <div className="border-t border-[#242429] p-2">
                        <SidebarUserMenu
                            name={userName}
                            role="Administrator"
                            initials={initials}
                            callbackUrl="/admin/login"
                            variant="dark"
                            settingsHref="/admin/settings"
                        />
                    </div>
                </aside>

                {/* Main column */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Top command bar */}
                    <header className="h-12 flex-shrink-0 border-b border-[#242429] bg-[#0A0A0B] px-4 flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-[#8B5CF6]">&#9656;</span>
                            <span className="text-[#EDEDED]">ADMIN</span>
                            <span className="text-[#5A5A61]">&middot; platform control plane</span>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <CommandPalette tenants={tenantRows} />
                            <Link href="/admin/tenants" className={ui.btnPrimary}>
                                <span aria-hidden="true">+</span> New Workspace
                            </Link>
                        </div>
                    </header>

                    <main className="flex-1 overflow-auto">{children}</main>
                </div>
            </div>

            <StatusBar status={status} />
        </div>
    );
}
