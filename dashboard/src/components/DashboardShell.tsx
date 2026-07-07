"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon, CpuChipIcon, XMarkIcon } from "@heroicons/react/24/outline";
import ThemeToggle from "./ThemeToggle";

interface DashboardShellProps {
    workspaceName: string;
    nav: React.ReactNode;
    userMenu: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Responsive app shell for the tenant dashboard.
 * - md and up: fixed 240px sidebar, always visible.
 * - below md: top bar with hamburger + off-canvas drawer sidebar.
 * `nav` and `userMenu` are rendered by the caller (server layout.tsx) and
 * passed in so they can stay client components without this file owning
 * their data-fetching.
 */
export default function DashboardShell({ workspaceName, nav, userMenu, children }: DashboardShellProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const pathname = usePathname();
    const hamburgerRef = useRef<HTMLButtonElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const isFirstRender = useRef(true);

    // Close the drawer whenever the route changes (covers nav-link clicks).
    useEffect(() => {
        setDrawerOpen(false);
    }, [pathname]);

    // Escape closes the drawer.
    useEffect(() => {
        if (!drawerOpen) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setDrawerOpen(false);
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [drawerOpen]);

    // Lock body scroll while the drawer is open, and manage focus. Skips
    // stealing focus on first mount — only moves focus on actual open/close
    // transitions triggered by the user.
    useEffect(() => {
        if (drawerOpen) {
            const prevOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            closeButtonRef.current?.focus();
            isFirstRender.current = false;
            return () => {
                document.body.style.overflow = prevOverflow;
            };
        }
        if (!isFirstRender.current) {
            hamburgerRef.current?.focus();
        }
        isFirstRender.current = false;
    }, [drawerOpen]);

    return (
        <div className="flex h-dvh bg-pulse-bg w-full font-sans overflow-hidden">
            {/* Desktop sidebar */}
            <aside className="hidden md:flex w-60 bg-pulse-panel flex-shrink-0 flex-col border-r border-pulse-border-subtle h-dvh">
                <div className="h-14 px-5 flex items-center border-b border-pulse-border-subtle flex-shrink-0">
                    <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <CpuChipIcon className="w-4 h-4 text-white" aria-hidden="true" />
                        </div>
                        <span className="text-sm font-bold text-pulse-text tracking-tight truncate">{workspaceName}</span>
                    </Link>
                </div>

                {nav}

                <div className="p-3 border-t border-pulse-border-subtle flex-shrink-0 space-y-2">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-pulse-faint">Theme</span>
                        <ThemeToggle />
                    </div>
                    {userMenu}
                </div>
            </aside>

            {/* Mobile / tablet off-canvas drawer */}
            <div className={`md:hidden fixed inset-0 z-50 ${drawerOpen ? "" : "pointer-events-none"}`}>
                {/* Backdrop */}
                <div
                    onClick={() => setDrawerOpen(false)}
                    aria-hidden="true"
                    className={`absolute inset-0 bg-black/50 transition-opacity motion-reduce:transition-none ${drawerOpen ? "opacity-100" : "opacity-0"}`}
                />
                {/* Drawer panel */}
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Sidebar navigation"
                    aria-hidden={!drawerOpen}
                    // `inert` (not just aria-hidden) removes off-screen content from the
                    // tab order while closed — without it, keyboard users could tab into
                    // links sitting just off-screen. Kept separate from `hidden` because
                    // `hidden` forces display:none, which would kill the slide transition.
                    inert={!drawerOpen}
                    className={`absolute inset-y-0 left-0 w-72 max-w-[85%] bg-pulse-panel border-r border-pulse-border-subtle flex flex-col h-full shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
                >
                    <div className="h-14 px-4 flex items-center justify-between border-b border-pulse-border-subtle flex-shrink-0">
                        <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0" onClick={() => setDrawerOpen(false)}>
                            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                <CpuChipIcon className="w-4 h-4 text-white" aria-hidden="true" />
                            </div>
                            <span className="text-sm font-bold text-pulse-text tracking-tight truncate">{workspaceName}</span>
                        </Link>
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={() => setDrawerOpen(false)}
                            aria-label="Close menu"
                            className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            <XMarkIcon className="w-5 h-5" aria-hidden="true" />
                        </button>
                    </div>

                    {nav}

                    <div className="p-3 border-t border-pulse-border-subtle flex-shrink-0 space-y-2">
                        <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-pulse-faint">Theme</span>
                            <ThemeToggle />
                        </div>
                        {userMenu}
                    </div>
                </div>
            </div>

            {/* Main column */}
            <div className="flex-1 flex flex-col min-w-0 h-dvh overflow-hidden">
                {/* Mobile top bar */}
                <header className="md:hidden h-14 flex-shrink-0 flex items-center gap-2 px-3 border-b border-pulse-border-subtle bg-pulse-panel">
                    <button
                        ref={hamburgerRef}
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        aria-label="Open menu"
                        aria-expanded={drawerOpen}
                        className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                        <Bars3Icon className="w-5 h-5" aria-hidden="true" />
                    </button>
                    <span className="text-sm font-bold text-pulse-text tracking-tight truncate flex-1">{workspaceName}</span>
                    <ThemeToggle />
                </header>

                <main className="flex-1 overflow-auto bg-pulse-bg">
                    {children}
                </main>
            </div>
        </div>
    );
}
