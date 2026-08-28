"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext, useState, useEffect } from "react";
import {
    Squares2X2Icon,
    CpuChipIcon,
    ChatBubbleLeftRightIcon,
    ServerStackIcon,
    PresentationChartLineIcon,
    CreditCardIcon,
    Cog6ToothIcon,
    ShieldCheckIcon,
    ChevronRightIcon,
    PlusIcon,
    ClockIcon,
    ArrowsRightLeftIcon,
    BuildingOffice2Icon,
    WrenchScrewdriverIcon,
    ServerIcon,
    PuzzlePieceIcon,
    LockClosedIcon,
    SparklesIcon,
    UsersIcon,
    UserGroupIcon,
    BookOpenIcon,
    InformationCircleIcon,
    QueueListIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    ClipboardDocumentListIcon,
    IdentificationIcon,
    CalendarDaysIcon,
    DocumentTextIcon,
    CheckCircleIcon,
    BookmarkIcon,
    BanknotesIcon,
    AcademicCapIcon,
    RectangleStackIcon,
    FolderIcon,
} from "@heroicons/react/24/outline";
import { SidebarCollapseContext } from "./DashboardShell";

type NavItem = {
    href: string;
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    exact?: boolean;
    exclude?: string;
    feature?: "billing" | "chatgptConnect";
};

// Grouped nav. `advanced` groups are hidden in the Simple view (for non-technical
// users) — Workspace + Account always show; agent/infra/activity config is opt-in.
const NAV_GROUPS: { label: string; items: NavItem[]; advanced?: boolean }[] = [
    {
        // v4 leads with the assistant: starting work and finding past work are the
        // two things you do most, so they sit above the workspace rather than
        // inside it as one "Assistant" entry.
        label: "Assistant",
        items: [
            { href: "/dashboard/assistant", label: "New chat", icon: PlusIcon, exact: true },
            { href: "/dashboard/assistant/history", label: "History", icon: ClockIcon },
        ],
    },
    {
        label: "Workspace",
        items: [
            { href: "/dashboard", label: "Overview", icon: Squares2X2Icon, exact: true },
            { href: "/dashboard/contacts", label: "Contacts", icon: IdentificationIcon },
            { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDaysIcon },
            { href: "/dashboard/notes", label: "Notepad", icon: DocumentTextIcon },
            { href: "/dashboard/todos", label: "To-dos", icon: CheckCircleIcon },
            { href: "/dashboard/work", label: "Work", icon: RectangleStackIcon },
            { href: "/dashboard/expenses", label: "Expenses", icon: BanknotesIcon },
            { href: "/dashboard/documents", label: "Documents", icon: FolderIcon },
            { href: "/dashboard/bookmarks", label: "Bookmarks", icon: BookmarkIcon },
        ],
    },
    {
        label: "Agents",
        advanced: true,
        items: [
            { href: "/dashboard/agents", label: "Agent Profiles", icon: CpuChipIcon, exclude: "/dashboard/agents/routing" },
            { href: "/dashboard/agents/routing", label: "Routing", icon: ArrowsRightLeftIcon },
            { href: "/dashboard/skills", label: "Skills", icon: AcademicCapIcon },
            { href: "/dashboard/departments", label: "Departments", icon: BuildingOffice2Icon },
            { href: "/dashboard/people", label: "People", icon: UsersIcon },
        ],
    },
    {
        label: "Tools & Infra",
        advanced: true,
        items: [
            { href: "/dashboard/tools", label: "Custom Tools", icon: WrenchScrewdriverIcon },
            { href: "/dashboard/servers", label: "Servers", icon: ServerIcon },
            { href: "/dashboard/mcp", label: "MCP Servers", icon: ServerStackIcon },
            { href: "/dashboard/plugins", label: "Plugins", icon: PuzzlePieceIcon },
            { href: "/dashboard/logins", label: "Passwords", icon: LockClosedIcon },
        ],
    },
    {
        label: "Activity",
        advanced: true,
        items: [
            { href: "/dashboard/tasks", label: "Task Queue", icon: QueueListIcon },
            { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheckIcon },
            { href: "/dashboard/analytics", label: "Analytics", icon: PresentationChartLineIcon },
            { href: "/dashboard/conversations", label: "Conversations", icon: ChatBubbleLeftRightIcon },
            { href: "/dashboard/audit", label: "Audit Log", icon: ClipboardDocumentListIcon },
            { href: "/dashboard/usage", label: "Usage & Billing", icon: CreditCardIcon, feature: "billing" },
            { href: "/dashboard/chatgpt", label: "ChatGPT Connect", icon: SparklesIcon, feature: "chatgptConnect" },
        ],
    },
    {
        label: "Account",
        items: [
            { href: "/dashboard/team", label: "Team", icon: UserGroupIcon },
            { href: "/dashboard/settings", label: "Settings", icon: Cog6ToothIcon },
            { href: "/dashboard/docs", label: "Documentation", icon: BookOpenIcon },
            { href: "/dashboard/about", label: "About", icon: InformationCircleIcon },
        ],
    },
];

/** Compact labels for the slim (collapsed) rail — a couple of long names get a
 *  shorter form so they fit under the icon on one line. */
const SHORT_LABELS: Record<string, string> = {
    "Agent Profiles": "Agents",
    "Departments": "Depts",
    "Custom Tools": "Tools",
    "MCP Servers": "MCP",
    "Task Queue": "Tasks",
    "Conversations": "Chats",
    "Usage & Billing": "Billing",
    "ChatGPT Connect": "ChatGPT",
    "Documentation": "Docs",
    "Administration": "Admin",
    "Admin Panel": "Admin",
};
function shortLabel(label: string): string {
    return SHORT_LABELS[label] ?? label;
}

export default function DashboardNav({ isAdmin, chatgptConnect, showBilling = true }: { isAdmin?: boolean; chatgptConnect?: boolean; showBilling?: boolean }) {
    const pathname = usePathname();
    const collapsed = useContext(SidebarCollapseContext);

    /*
     * Collapsible groups, remembered per device.
     *
     * This replaces the old "Simple view", which HID the advanced sections
     * outright — with ~28 destinations that meant half the product was
     * unreachable until you found a toggle. Collapsing keeps everything one
     * click away while leaving the sidebar short by default.
     *
     * Advanced groups start closed so a first load looks like the design; the
     * group holding the current page is always forced open, so you can never
     * be on a page whose section appears collapsed.
     */
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
    useEffect(() => {
        try {
            const raw = localStorage.getItem("pulse_nav_groups");
            if (raw) setOpenGroups(JSON.parse(raw));
        } catch { /* a corrupt value just means defaults */ }
    }, []);
    const toggleGroup = (label: string, isOpen: boolean) =>
        setOpenGroups((prev) => {
            const next = { ...prev, [label]: !isOpen };
            try { localStorage.setItem("pulse_nav_groups", JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });

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
                // v4 Studio: 7.5/9 padding on a 9px radius, and an active state
                // that lifts the surface rather than tinting it with the accent.
                // The accent is reserved for links and state in this design; a
                // coloured nav row would be the loudest thing on a quiet screen.
                className={`group relative flex items-center transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50 ${collapsed
                    ? "flex-col justify-center gap-[5px] rounded-xl w-[60px] h-[52px] mx-auto text-[9.5px] font-medium"
                    : "gap-2.5 px-[9px] py-[7.5px] rounded-[9px] text-[13px] leading-[17px]"} ${isActive
                    ? "bg-pulse-panel-alt text-pulse-text font-medium"
                    : "text-pulse-muted font-normal hover:bg-pulse-hover hover:text-pulse-text"
                    }`}
            >
                {/* No active accent bar: v4 marks the current item by lifting its
                    surface, and a coloured rule would put the loudest element on
                    screen in the quietest part of the layout. */}
                <Icon
                    aria-hidden="true"
                    className={`flex-shrink-0 opacity-80 transition-colors motion-reduce:transition-none ${isActive ? "text-pulse-text" : "text-pulse-faint group-hover:text-pulse-text-soft"}`}
                    style={{ width: collapsed ? 20 : 15, height: collapsed ? 20 : 15 }}
                />
                {collapsed
                    ? <span className="leading-none text-center tracking-tight">{shortLabel(label)}</span>
                    : label}
            </Link>
        );
    };

    return (
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden ${collapsed ? "px-2 py-3" : "px-3 py-4"}`}>
            {/* No space-y here: the group label's own pt-4 is the rhythm.
                Stacking space-y-5 on top of it doubled every gap. */}
            <div className={collapsed ? "space-y-1" : ""}>
                {NAV_GROUPS.map((group, gi) => {
                    const items = group.items.filter(isVisible);
                    if (items.length === 0) return null;
                    // The section you are standing in is never collapsed.
                    const holdsCurrentPage = items.some((i) =>
                        i.exact ? pathname === i.href : pathname.startsWith(i.href));
                    const isOpen = openGroups[group.label] ?? true;
                    return (
                        <div key={group.label} className={collapsed ? "space-y-1" : "space-y-0.5"}>
                            {collapsed
                                ? (gi > 0 && <div className="mx-2 my-1 border-t border-pulse-border-subtle" aria-hidden="true" />)
                                : (
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.label, isOpen)}
                                        aria-expanded={isOpen}
                                        className="group/hdr flex w-full items-center gap-1.5 px-2 pt-4 pb-[7px] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50 rounded"
                                    >
                                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-pulse-dim group-hover/hdr:text-pulse-faint transition-colors motion-reduce:transition-none">
                                            {group.label}
                                        </span>
                                        <ChevronRightIcon
                                            aria-hidden="true"
                                            className={`w-3 h-3 text-pulse-dim transition-transform motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`}
                                        />
                                    </button>
                                )}
                            {(collapsed || isOpen) && items.map(renderLink)}
                        </div>
                    );
                })}

                {isAdmin && (
                    <div className={collapsed ? "space-y-1" : "space-y-0.5"}>
                        {collapsed
                            ? <div className="mx-2 my-1 border-t border-pulse-border-subtle" aria-hidden="true" />
                            : (
                                <div className="px-2 pt-4 pb-[7px]">
                                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-pulse-dim">Administration</span>
                                </div>
                            )}
                        <Link
                            href="/admin"
                            className={`group relative flex items-center transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50 text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text ${collapsed ? "flex-col justify-center gap-[5px] rounded-xl w-[60px] h-[52px] mx-auto text-[9.5px] font-medium" : "gap-2.5 px-[9px] py-[7.5px] rounded-[9px] text-[13px] leading-[17px]"}`}
                        >
                            <ShieldCheckIcon aria-hidden="true" className="flex-shrink-0 text-pulse-faint group-hover:text-pulse-text-soft transition-colors motion-reduce:transition-none" style={{ width: collapsed ? 20 : 15, height: collapsed ? 20 : 15 }} />
                            {collapsed ? <span className="leading-none">Admin</span> : "Admin Panel"}
                        </Link>
                    </div>
                )}

            </div>
        </nav>
    );
}
