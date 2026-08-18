"use client";

import { signOut } from "next-auth/react";
import { useState, useRef, useEffect, useContext } from "react";
import { SidebarCollapseContext } from "./DashboardShell";

type Variant = "light" | "dark" | "pulse";

interface SidebarUserMenuProps {
    name: string;
    email?: string;
    role: string;
    initials: string;
    callbackUrl?: string;
    variant?: Variant;
    settingsHref?: string;
}

// Per-variant class sets. "pulse" uses the theme-aware admin token layer so it
// flips with dark/light; "light"/"dark" keep the tenant-side slate palette.
const V = {
    triggerHover: { light: "hover:bg-slate-50", dark: "hover:bg-slate-800", pulse: "hover:bg-pulse-hover" },
    avatar: {
        light: "bg-indigo-100 text-indigo-700",
        dark: "bg-indigo-500/20 text-indigo-400",
        pulse: "bg-pulse-accent/15 text-pulse-accent",
    },
    name: { light: "text-slate-900", dark: "text-slate-200", pulse: "text-pulse-text" },
    sub: { light: "text-slate-400", dark: "text-slate-500", pulse: "text-pulse-faint" },
    chevron: { light: "text-slate-300", dark: "text-slate-600", pulse: "text-pulse-faint" },
    popover: {
        light: "bg-white border-slate-200",
        dark: "bg-slate-800 border-slate-700",
        pulse: "bg-pulse-panel border-pulse-border",
    },
    divider: { light: "border-slate-100", dark: "border-slate-700", pulse: "border-pulse-border" },
    popName: { light: "text-slate-900", dark: "text-white", pulse: "text-pulse-text" },
    popEmail: { light: "text-slate-500", dark: "text-slate-400", pulse: "text-pulse-muted" },
    popRole: { light: "text-slate-400", dark: "text-slate-500", pulse: "text-pulse-faint" },
    action: {
        light: "text-slate-700 hover:bg-slate-50",
        dark: "text-slate-300 hover:bg-slate-700",
        pulse: "text-pulse-text-soft hover:bg-pulse-hover",
    },
    signout: {
        light: "text-red-600 hover:bg-red-50",
        dark: "text-red-400 hover:bg-red-500/10",
        pulse: "text-pulse-loss hover:bg-pulse-loss/10",
    },
} as const;

export default function SidebarUserMenu({
    name,
    email,
    role,
    initials,
    callbackUrl = "/login",
    variant = "light",
    settingsHref,
}: SidebarUserMenuProps) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const collapsed = useContext(SidebarCollapseContext);
    const v = <K extends keyof typeof V>(k: K) => V[k][variant];

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [open]);

    return (
        <div className="relative" ref={menuRef}>
            {/* Trigger — full user row, or just the avatar in the slim rail */}
            <button
                onClick={() => setOpen(!open)}
                title={collapsed ? name : undefined}
                aria-label={collapsed ? `Account: ${name}` : undefined}
                className={`flex items-center rounded-lg transition-colors ${v("triggerHover")} ${collapsed ? "justify-center w-9 h-9 mx-auto" : "gap-3 w-full px-2 py-2"}`}
            >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${v("avatar")}`}>
                    {initials}
                </div>
                {!collapsed && (
                    <>
                        <div className="flex-1 min-w-0 text-left">
                            <p className={`text-xs font-semibold truncate ${v("name")}`}>{name}</p>
                            <p className={`text-xs truncate ${v("sub")}`}>{email || role}</p>
                        </div>
                        <svg
                            className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""} ${v("chevron")}`}
                            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                        </svg>
                    </>
                )}
            </button>

            {/* Popover — anchored above; widened in the slim rail so it stays readable */}
            {open && (
                <div className={`absolute bottom-full mb-2 rounded-xl shadow-lg border overflow-hidden z-50 ${v("popover")} ${collapsed ? "left-0 w-60" : "left-0 right-0"}`}>
                    {/* User info header */}
                    <div className={`px-4 py-4 text-center border-b ${v("divider")}`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-2 ${v("avatar")}`}>
                            {initials}
                        </div>
                        <p className={`text-sm font-semibold ${v("popName")}`}>{name}</p>
                        {email && <p className={`text-xs mt-0.5 ${v("popEmail")}`}>{email}</p>}
                        <p className={`text-xs mt-1 ${v("popRole")}`}>{role}</p>
                    </div>

                    {/* Actions */}
                    <div className="p-1.5">
                        {settingsHref && (
                            <a
                                href={settingsHref}
                                onClick={() => setOpen(false)}
                                className={`flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium rounded-lg transition-colors ${v("action")}`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Account settings
                            </a>
                        )}

                        <div className={`my-1 border-t ${v("divider")}`} />

                        <button
                            onClick={() => signOut({ callbackUrl })}
                            className={`flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium rounded-lg transition-colors ${v("signout")}`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                            </svg>
                            Sign out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
