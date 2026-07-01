"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    MagnifyingGlassIcon,
    Squares2X2Icon,
    BuildingOffice2Icon,
    BoltIcon,
    ChartBarIcon,
    UsersIcon,
    UserGroupIcon,
    ChatBubbleLeftRightIcon,
    PresentationChartBarIcon,
    Cog6ToothIcon,
} from "@heroicons/react/24/outline";

interface CommandPaletteProps {
    tenants: { id: string; name: string }[];
}

type Group = "Navigate" | "Tenants" | "Actions";

interface PaletteItem {
    key: string;
    label: string;
    sublabel?: string;
    href: string;
    group: Group;
    icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: PaletteItem[] = [
    { key: "nav-overview", label: "Platform Overview", href: "/admin", group: "Navigate", icon: ChartBarIcon },
    { key: "nav-tenants", label: "Tenant Management", href: "/admin/tenants", group: "Navigate", icon: UsersIcon },
    { key: "nav-users", label: "User Management", href: "/admin/users", group: "Navigate", icon: UserGroupIcon },
    { key: "nav-conversations", label: "Conversations", href: "/admin/conversations", group: "Navigate", icon: ChatBubbleLeftRightIcon },
    { key: "nav-usage", label: "Usage Analytics", href: "/admin/usage", group: "Navigate", icon: PresentationChartBarIcon },
    { key: "nav-settings", label: "Global Settings", href: "/admin/settings", group: "Navigate", icon: Cog6ToothIcon },
];

const ACTION_ITEMS: PaletteItem[] = [
    { key: "action-create-workspace", label: "Create workspace", href: "/admin/tenants", group: "Actions", icon: BoltIcon },
    { key: "action-email-settings", label: "Email settings", href: "/admin/settings?tab=email", group: "Actions", icon: BoltIcon },
    { key: "action-ai-providers", label: "AI providers", href: "/admin/settings?tab=providers", group: "Actions", icon: BoltIcon },
];

const GROUP_ICONS: Record<Group, React.ComponentType<{ className?: string }>> = {
    Navigate: Squares2X2Icon,
    Tenants: BuildingOffice2Icon,
    Actions: BoltIcon,
};

export default function CommandPalette({ tenants }: CommandPaletteProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const tenantItems: PaletteItem[] = useMemo(
        () =>
            tenants.map((t) => ({
                key: `tenant-${t.id}`,
                label: t.name,
                sublabel: "Workspace",
                href: "/admin/tenants",
                group: "Tenants" as Group,
                icon: BuildingOffice2Icon,
            })),
        [tenants]
    );

    const allItems = useMemo(() => [...NAV_ITEMS, ...tenantItems, ...ACTION_ITEMS], [tenantItems]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return allItems;
        return allItems.filter(
            (item) =>
                item.label.toLowerCase().includes(q) ||
                (item.sublabel ? item.sublabel.toLowerCase().includes(q) : false)
        );
    }, [allItems, query]);

    const groups: { group: Group; items: PaletteItem[] }[] = useMemo(() => {
        const order: Group[] = ["Navigate", "Tenants", "Actions"];
        return order
            .map((group) => ({ group, items: filtered.filter((i) => i.group === group) }))
            .filter((g) => g.items.length > 0);
    }, [filtered]);

    const closePalette = () => {
        setOpen(false);
        setQuery("");
        setActiveIndex(0);
    };

    const openPalette = () => {
        setOpen(true);
        setActiveIndex(0);
    };

    // Global ⌘K / Ctrl+K shortcut
    useEffect(() => {
        const handleGlobalKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen((prev) => {
                    if (!prev) setActiveIndex(0);
                    return !prev;
                });
            }
        };
        document.addEventListener("keydown", handleGlobalKey);
        return () => document.removeEventListener("keydown", handleGlobalKey);
    }, []);

    // Focus input on open
    useEffect(() => {
        if (open) {
            const id = requestAnimationFrame(() => inputRef.current?.focus());
            return () => cancelAnimationFrame(id);
        }
    }, [open]);

    // Focus trap
    useEffect(() => {
        if (!open) return;
        const modal = modalRef.current;
        if (!modal) return;
        const trap = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            const focusable = modal.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        modal.addEventListener("keydown", trap);
        return () => modal.removeEventListener("keydown", trap);
    }, [open]);

    const handleSelect = (item: PaletteItem) => {
        router.push(item.href);
        closePalette();
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            closePalette();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const item = filtered[activeIndex];
            if (item) handleSelect(item);
        }
    };

    // Keep the active option in view
    useEffect(() => {
        if (!open) return;
        const list = listRef.current;
        if (!list) return;
        const activeEl = list.querySelector<HTMLElement>('[data-active="true"]');
        activeEl?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, open]);

    // Flat index → item lookup for rendering group-by-group while keeping a single active index
    let runningIndex = -1;

    return (
        <>
            <button
                type="button"
                onClick={openPalette}
                className="flex items-center gap-2 border border-pulse-border bg-pulse-panel-alt rounded px-3 py-1.5 text-[11px] text-pulse-muted hover:border-pulse-border-strong transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pulse-accent"
                aria-haspopup="dialog"
            >
                <MagnifyingGlassIcon className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline uppercase tracking-[0.08em]">Search or jump to&hellip;</span>
                <kbd className="ml-2 border border-pulse-border rounded px-1 text-[10px] text-pulse-faint">&#8984;K</kbd>
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
                    role="presentation"
                >
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={closePalette}
                        aria-hidden="true"
                    />

                    <div
                        ref={modalRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Command palette"
                        className="relative w-full max-w-xl rounded-lg border border-pulse-border-strong bg-pulse-panel shadow-2xl overflow-hidden font-sans"
                    >
                        <div className="flex items-center gap-3 border-b border-pulse-border px-4 py-3.5">
                            <MagnifyingGlassIcon className="w-4 h-4 text-pulse-faint flex-shrink-0" aria-hidden="true" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    setActiveIndex(0);
                                }}
                                onKeyDown={handleInputKeyDown}
                                placeholder="Search pages, workspaces, actions…"
                                className="w-full bg-transparent text-[13px] text-pulse-text placeholder:text-pulse-faint outline-none"
                                role="combobox"
                                aria-expanded="true"
                                aria-controls="command-palette-listbox"
                                aria-autocomplete="list"
                            />
                            <kbd className="hidden sm:inline text-[10px] text-pulse-faint border border-pulse-border rounded px-1.5 py-0.5">
                                ESC
                            </kbd>
                        </div>

                        <div
                            ref={listRef}
                            id="command-palette-listbox"
                            role="listbox"
                            aria-label="Command results"
                            className="max-h-80 overflow-y-auto p-2"
                        >
                            {groups.length === 0 && (
                                <p className="px-3 py-8 text-center text-[13px] text-pulse-faint">
                                    No results for &ldquo;{query}&rdquo;.
                                </p>
                            )}
                            {groups.map(({ group, items }) => {
                                const GroupIcon = GROUP_ICONS[group];
                                return (
                                    <div key={group} className="mb-2 last:mb-0">
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-pulse-faint">
                                            <GroupIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                            {group}
                                        </div>
                                        {items.map((item) => {
                                            runningIndex += 1;
                                            const isActive = runningIndex === activeIndex;
                                            const Icon = item.icon;
                                            return (
                                                <button
                                                    key={item.key}
                                                    id={`command-item-${runningIndex}`}
                                                    role="option"
                                                    aria-selected={isActive}
                                                    data-active={isActive}
                                                    type="button"
                                                    onMouseEnter={() => setActiveIndex(runningIndex)}
                                                    onClick={() => handleSelect(item)}
                                                    className={`relative flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-[13px] transition-colors motion-reduce:transition-none focus-visible:outline-none ${
                                                        isActive ? "bg-pulse-tint text-pulse-accent" : "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text"
                                                    }`}
                                                >
                                                    {isActive && (
                                                        <span
                                                            aria-hidden="true"
                                                            className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[2px] rounded-r bg-pulse-accent"
                                                        />
                                                    )}
                                                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-pulse-accent" : "text-pulse-faint"}`} aria-hidden="true" />
                                                    <span className="flex-1 truncate">{item.label}</span>
                                                    {item.sublabel && (
                                                        <span className="text-[11px] uppercase tracking-[0.08em] text-pulse-faint flex-shrink-0">{item.sublabel}</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-4 border-t border-pulse-border px-4 py-2.5 text-[10px] uppercase tracking-[0.08em] text-pulse-faint">
                            <span className="flex items-center gap-1">
                                <kbd className="border border-pulse-border rounded px-1 py-0.5 text-pulse-muted">&uarr;&darr;</kbd> navigate
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="border border-pulse-border rounded px-1 py-0.5 text-pulse-muted">&crarr;</kbd> open
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="border border-pulse-border rounded px-1 py-0.5 text-pulse-muted">esc</kbd> close
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
