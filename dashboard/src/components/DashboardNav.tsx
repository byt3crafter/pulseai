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
    ServerIcon,
    SparklesIcon,
    UsersIcon,
    UserGroupIcon,
    BookOpenIcon,
} from "@heroicons/react/24/outline";
import CommandPalette from "./dashboard/CommandPalette";

type NavItem = {
    href: string;
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    exact?: boolean;
    exclude?: string;
    feature?: "billing" | "chatgptConnect";
};

// Grouped nav (labels + hrefs + active logic unchanged — only presentation).
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
    {
        label: "Workspace",
        items: [{ href: "/dashboard", label: "Overview", icon: HomeIcon, exact: true }],
    },
    {
        label: "Agents",
        items: [
            { href: "/dashboard/agents", label: "Agent Profiles", icon: CpuChipIcon, exclude: "/dashboard/agents/routing" },
            { href: "/dashboard/agents/routing", label: "Routing", icon: ArrowsRightLeftIcon },
            { href: "/dashboard/departments", label: "Departments", icon: BuildingOffice2Icon },
            { href: "/dashboard/people", label: "People", icon: UsersIcon },
        ],
    },
    {
        label: "Tools & Infra",
        items: [
            { href: "/dashboard/tools", label: "Custom Tools", icon: WrenchScrewdriverIcon },
            { href: "/dashboard/servers", label: "Servers", icon: ServerIcon },
            { href: "/dashboard/mcp", label: "MCP Servers", icon: ServerStackIcon },
        ],
    },
    {
        label: "Activity",
        items: [
            { href: "/dashboard/conversations", label: "Conversations", icon: ChatBubbleLeftRightIcon },
            { href: "/dashboard/usage", label: "Usage & Billing", icon: ChartBarSquareIcon, feature: "billing" },
            { href: "/dashboard/chatgpt", label: "ChatGPT Connect", icon: SparklesIcon, feature: "chatgptConnect" },
        ],
    },
    {
        label: "Account",
        items: [
            { href: "/dashboard/team", label: "Team", icon: UserGroupIcon },
            { href: "/dashboard/settings", label: "Settings", icon: Cog6ToothIcon },
            { href: "/docs", label: "Documentation", icon: BookOpenIcon },
        ],
    },
];

export default function DashboardNav({ isAdmin, chatgptConnect, showBilling = true }: { isAdmin?: boolean; chatgptConnect?: boolean; showBilling?: boolean }) {
    const pathname = usePathname();

    const isVisible = (item: NavItem) => {
        if (item.feature === "chatgptConnect") return !!chatgptConnect;
        if (item.feature === "billing") return showBilling;
        return true;
    };

    const renderLink = (item: NavItem) => {
        const { href, label, icon: Icon, exact, exclude } = item;
        let isActive = exact ? pathname === href : pathname.startsWith(href);
        if (isActive && exclude && pathname.startsWith(exclude)) isActive = false;
        return (
            <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex items-center gap-3 pl-3.5 pr-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isActive
                    ? "bg-pulse-tint text-pulse-accent-hi"
                    : "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text"
                    }`}
            >
                {/* Active left accent bar */}
                <span
                    aria-hidden="true"
                    className={`absolute left-0 top-1/2 -translate-y-1/2 h-4.5 w-[3px] rounded-full bg-pulse-accent transition-opacity motion-reduce:transition-none ${isActive ? "opacity-100" : "opacity-0"}`}
                    style={{ height: 18 }}
                />
                <Icon
                    aria-hidden="true"
                    className={`flex-shrink-0 transition-colors motion-reduce:transition-none ${isActive ? "text-pulse-accent-hi" : "text-pulse-faint group-hover:text-pulse-text-soft"}`}
                    style={{ width: 18, height: 18 }}
                />
                {label}
            </Link>
        );
    };

    return (
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
            <div className="mb-4 px-0.5">
                <CommandPalette isAdmin={isAdmin} chatgptConnect={chatgptConnect} showBilling={showBilling} />
            </div>

            <div className="space-y-5">
                {NAV_GROUPS.map((group) => {
                    const items = group.items.filter(isVisible);
                    if (items.length === 0) return null;
                    return (
                        <div key={group.label} className="space-y-0.5">
                            <div className="px-3.5 pb-1.5">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-pulse-faint">{group.label}</span>
                            </div>
                            {items.map(renderLink)}
                        </div>
                    );
                })}

                {isAdmin && (
                    <div className="space-y-0.5">
                        <div className="px-3.5 pb-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-pulse-faint">Administration</span>
                        </div>
                        <Link
                            href="/admin"
                            className="group relative flex items-center gap-3 pl-3.5 pr-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text"
                        >
                            <ShieldCheckIcon aria-hidden="true" className="flex-shrink-0 text-pulse-faint group-hover:text-pulse-text-soft transition-colors motion-reduce:transition-none" style={{ width: 18, height: 18 }} />
                            Admin Panel
                        </Link>
                    </div>
                )}
            </div>
        </nav>
    );
}
