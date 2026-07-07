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
    ArrowsRightLeftIcon,
    BuildingOffice2Icon,
    WrenchScrewdriverIcon,
    SparklesIcon,
} from "@heroicons/react/24/outline";
import CommandPalette from "./dashboard/CommandPalette";

const links = [
    { href: "/dashboard", label: "Overview", icon: HomeIcon, exact: true },
    { href: "/dashboard/agents", label: "Agent Profiles", icon: CpuChipIcon, exact: false, exclude: "/dashboard/agents/routing" },
    { href: "/dashboard/agents/routing", label: "Routing", icon: ArrowsRightLeftIcon, exact: false },
    { href: "/dashboard/departments", label: "Departments", icon: BuildingOffice2Icon, exact: false },
    { href: "/dashboard/tools", label: "Custom Tools", icon: WrenchScrewdriverIcon, exact: false },
    { href: "/dashboard/conversations", label: "Conversations", icon: ChatBubbleLeftRightIcon, exact: false },
    { href: "/dashboard/mcp", label: "MCP Servers", icon: ServerStackIcon, exact: false },
    { href: "/dashboard/usage", label: "Usage & Billing", icon: ChartBarSquareIcon, exact: false, feature: "billing" },
    { href: "/dashboard/chatgpt", label: "ChatGPT Connect", icon: SparklesIcon, exact: false, feature: "chatgptConnect" },
    { href: "/dashboard/settings", label: "Settings", icon: Cog6ToothIcon, exact: false },
];

export default function DashboardNav({ isAdmin, chatgptConnect, showBilling = true }: { isAdmin?: boolean; chatgptConnect?: boolean; showBilling?: boolean }) {
    const pathname = usePathname();
    const visible = links.filter((l) => {
        if (l.feature === "chatgptConnect") return !!chatgptConnect;
        if (l.feature === "billing") return showBilling;
        return true;
    });

    return (
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            <div className="mb-3">
                <CommandPalette isAdmin={isAdmin} chatgptConnect={chatgptConnect} showBilling={showBilling} />
            </div>
            {visible.map(({ href, label, icon: Icon, exact, exclude }) => {
                let isActive = exact ? pathname === href : pathname.startsWith(href);
                if (isActive && exclude && pathname.startsWith(exclude)) isActive = false;
                return (
                    <Link
                        key={href}
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isActive
                                ? "bg-pulse-tint text-pulse-accent-hi"
                                : "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text"
                            }`}
                    >
                        <Icon aria-hidden="true" className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? "text-pulse-accent-hi" : "text-pulse-faint"}`} style={{ width: 18, height: 18 }} />
                        {label}
                    </Link>
                );
            })}

            {isAdmin && (
                <>
                    <div className="pt-3 pb-1 px-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-pulse-faint">Administration</span>
                    </div>
                    <Link
                        href="/admin"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text"
                    >
                        <ShieldCheckIcon className="w-4.5 h-4.5 flex-shrink-0 text-pulse-faint" style={{ width: 18, height: 18 }} />
                        Admin Panel
                    </Link>
                </>
            )}
        </nav>
    );
}
