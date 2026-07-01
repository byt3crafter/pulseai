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
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
            {links.map(({ href, label, icon: Icon, exact }) => {
                const isActive = exact ? pathname === href : pathname.startsWith(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        className={`group relative flex items-center gap-3 pl-4 pr-4 py-2.5 rounded-full text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F0F4F9] ${isActive
                                ? "bg-white text-[#0B57D0] shadow-sm"
                                : "text-[#444746] hover:bg-white/60"
                            }`}
                    >
                        {isActive && (
                            <span
                                aria-hidden="true"
                                className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gradient-to-br from-[#4285F4] via-[#9B72CB] to-[#D96570]"
                            />
                        )}
                        <Icon aria-hidden="true" className="w-5 h-5 flex-shrink-0" />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );
}
