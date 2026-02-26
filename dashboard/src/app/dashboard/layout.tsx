import { auth } from "../../auth";
import { db } from "../../storage/db";
import { users, tenants } from "../../storage/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { CpuChipIcon } from "@heroicons/react/24/outline";
import SidebarUserMenu from "../../components/SidebarUserMenu";
import DashboardNav from "../../components/DashboardNav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const tenantId = session?.user?.tenantId;
    const userId = session?.user?.id;

    // Fetch real workspace name and user name
    const [tenantRow, userRow] = await Promise.all([
        tenantId ? db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1) : Promise.resolve([]),
        userId ? db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1) : Promise.resolve([]),
    ]);

    const workspaceName = tenantRow[0]?.name ?? "Workspace";
    const userName = userRow[0]?.name ?? userRow[0]?.email ?? "User";
    const initials = userName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
    const isAdmin = session?.user?.role === "ADMIN";

    return (
        <div className="flex h-screen bg-slate-50 w-full font-sans">

            {/* Sidebar */}
            <aside className="w-60 bg-white flex-shrink-0 flex flex-col border-r border-slate-100 h-screen">

                {/* Brand */}
                <div className="h-14 px-5 flex items-center border-b border-slate-100">
                    <Link href="/dashboard" className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <CpuChipIcon className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-bold text-slate-900 tracking-tight truncate">{workspaceName}</span>
                    </Link>
                </div>

                {/* Nav — dynamic active state via DashboardNav (client component) */}
                <DashboardNav isAdmin={isAdmin} />

                {/* User + logout */}
                <div className="p-3 border-t border-slate-100">
                    <SidebarUserMenu
                        name={userName}
                        email={userRow[0]?.email ?? undefined}
                        role={isAdmin ? "Administrator" : "Workspace Member"}
                        initials={initials}
                        callbackUrl="/login"
                        variant="light"
                        settingsHref="/dashboard/settings?tab=account"
                    />
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 overflow-auto bg-slate-50">
                {children}
            </main>
        </div>
    );
}
