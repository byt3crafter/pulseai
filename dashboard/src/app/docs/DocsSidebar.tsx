"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { DOCS_NAV, docHref } from "./nav";

export default function DocsSidebar() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    const nav = (
        <nav className="flex flex-col gap-7">
            {DOCS_NAV.map((section) => (
                <div key={section.title}>
                    <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-pulse-faint">
                        {section.title}
                    </p>
                    <ul className="flex flex-col gap-0.5">
                        {section.pages.map((page) => {
                            const href = docHref(page.slug);
                            const active = pathname === href;
                            return (
                                <li key={page.slug}>
                                    <Link
                                        href={href}
                                        onClick={() => setOpen(false)}
                                        className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                                            active
                                                ? "bg-pulse-tint font-medium text-pulse-accent"
                                                : "text-pulse-soft hover:bg-pulse-hover hover:text-pulse-text"
                                        }`}
                                    >
                                        {page.title}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </nav>
    );

    return (
        <>
            {/* Mobile trigger */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-pulse-border bg-pulse-panel px-4 py-2.5 text-sm font-medium text-pulse-text shadow-lg lg:hidden"
            >
                <Bars3Icon className="h-4 w-4" /> Docs menu
            </button>

            {/* Mobile drawer */}
            {open && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
                    <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-pulse-border bg-pulse-panel p-5">
                        <div className="mb-6 flex items-center justify-between">
                            <span className="text-sm font-semibold text-pulse-text">Documentation</span>
                            <button type="button" onClick={() => setOpen(false)} className="text-pulse-muted hover:text-pulse-text">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                        {nav}
                    </div>
                </div>
            )}

            {/* Desktop rail */}
            <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto py-8 pr-4 lg:block">
                {nav}
            </aside>
        </>
    );
}
