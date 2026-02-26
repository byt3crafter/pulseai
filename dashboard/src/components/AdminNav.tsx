"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    UsersIcon,
    UserGroupIcon,
    ChartBarIcon,
    PresentationChartBarIcon,
    ChatBubbleLeftRightIcon,
    Cog6ToothIcon,
} from "@heroicons/react/24/outline";

const links = [
    { href: "/admin", label: "Platform Overview", icon: ChartBarIcon, exact: true },
    { href: "/admin/tenants", label: "Tenant Management", icon: UsersIcon, exact: false },
    { href: "/admin/users", label: "User Management", icon: UserGroupIcon, exact: false },
    { href: "/admin/conversations", label: "Conversations", icon: ChatBubbleLeftRightIcon, exact: false },
    { href: "/admin/usage", label: "Usage Analytics", icon: PresentationChartBarIcon, exact: false },
    { href: "/admin/settings", label: "Global Settings", icon: Cog6ToothIcon, exact: false },
];

export default function AdminNav() {
    const pathname = usePathname();

    return (
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {links.map(({ href, label, icon: Icon, exact }) => {
                const isActive = exact ? pathname === href : pathname.startsWith(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive
                                ? "bg-indigo-500/10 text-indigo-300"
                                : "text-slate-400 hover:bg-slate-800 hover:text-white"
                            }`}
                    >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );
}
