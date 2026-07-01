import { SparklesIcon } from "@heroicons/react/24/outline";
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
        <div className="flex h-screen bg-white w-full font-sans">

            {/* Sidebar */}
            <aside className="flex w-64 shrink-0 bg-[#F0F4F9] text-[#444746] h-screen flex-col border-r border-[#E1E5EA] overflow-y-auto">
                <div className="h-16 px-5 flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[#4285F4] via-[#9B72CB] to-[#D96570]">
                        <SparklesIcon className="w-4 h-4 text-white" aria-hidden="true" />
                    </span>
                    <span className="text-base tracking-tight leading-none">
                        <span className="font-bold text-[#1F1F1F]">Pulse</span>{" "}
                        <span className="font-normal text-[#5F6368]">Admin</span>
                    </span>
                </div>

                <AdminNav />

                <div className="p-3">
                    <div className="bg-white rounded-xl border border-[#E1E5EA] p-1.5">
                        <SidebarUserMenu
                            name={userName}
                            role="Administrator"
                            initials={userName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                            callbackUrl="/admin/login"
                            variant="light"
                            settingsHref="/admin/settings"
                        />
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-auto bg-white">
                {children}
            </main>
        </div>
    );
}
