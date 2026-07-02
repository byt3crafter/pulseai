"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    UsersIcon,
    UserGroupIcon,
    ChartBarIcon,
    PresentationChartBarIcon,
    ChatBubbleLeftRightIcon,
    ClipboardDocumentListIcon,
    Cog6ToothIcon,
} from "@heroicons/react/24/outline";

const links = [
    { href: "/admin", label: "Platform Overview", icon: ChartBarIcon, exact: true },
    { href: "/admin/tenants", label: "Tenant Management", icon: UsersIcon, exact: false },
    { href: "/admin/users", label: "User Management", icon: UserGroupIcon, exact: false },
    { href: "/admin/conversations", label: "Conversations", icon: ChatBubbleLeftRightIcon, exact: false },
    { href: "/admin/usage", label: "Usage Analytics", icon: PresentationChartBarIcon, exact: false },
    { href: "/admin/audit", label: "Audit Log", icon: ClipboardDocumentListIcon, exact: false },
    { href: "/admin/settings", label: "Global Settings", icon: Cog6ToothIcon, exact: false },
];

export default function AdminNav() {
    const pathname = usePathname();

    return (
        <nav className="px-2 space-y-0.5">
            {links.map(({ href, label, icon: Icon, exact }) => {
                const isActive = exact ? pathname === href : pathname.startsWith(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        className={`relative flex items-center gap-2.5 px-3 py-2 rounded text-[13px] transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pulse-accent ${
                            isActive
                                ? "text-pulse-accent bg-pulse-tint"
                                : "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text"
                        }`}
                    >
                        {isActive && (
                            <span
                                aria-hidden="true"
                                className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[2px] rounded-r bg-pulse-accent"
                            />
                        )}
                        <Icon aria-hidden="true" className="w-4 h-4 flex-shrink-0" />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );
}
