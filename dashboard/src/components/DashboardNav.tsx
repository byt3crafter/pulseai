"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    HomeIcon,
    CpuChipIcon,
    ChatBubbleLeftRightIcon,
    ServerStackIcon,
    ChartBarSquareIcon,
    Cog6ToothIcon,
    ShieldCheckIcon,
} from "@heroicons/react/24/outline";

const links = [
    { href: "/dashboard", label: "Overview", icon: HomeIcon, exact: true },
    { href: "/dashboard/agents", label: "Agent Profiles", icon: CpuChipIcon, exact: false },
    { href: "/dashboard/conversations", label: "Conversations", icon: ChatBubbleLeftRightIcon, exact: false },
    { href: "/dashboard/mcp", label: "MCP Servers", icon: ServerStackIcon, exact: false },
    { href: "/dashboard/usage", label: "Usage & Billing", icon: ChartBarSquareIcon, exact: false },
    { href: "/dashboard/settings", label: "Settings", icon: Cog6ToothIcon, exact: false },
];

export default function DashboardNav({ isAdmin }: { isAdmin?: boolean }) {
    const pathname = usePathname();

    return (
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {links.map(({ href, label, icon: Icon, exact }) => {
                const isActive = exact ? pathname === href : pathname.startsWith(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                    >
                        <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? "text-indigo-600" : "text-slate-400"}`} style={{ width: 18, height: 18 }} />
                        {label}
                    </Link>
                );
            })}

            {isAdmin && (
                <>
                    <div className="pt-3 pb-1 px-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Administration</span>
                    </div>
                    <Link
                        href="/admin"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    >
                        <ShieldCheckIcon className="w-4.5 h-4.5 flex-shrink-0 text-slate-400" style={{ width: 18, height: 18 }} />
                        Admin Panel
                    </Link>
                </>
            )}
        </nav>
    );
}
