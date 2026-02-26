"use client";

import { signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";

interface SidebarUserMenuProps {
    name: string;
    email?: string;
    role: string;
    initials: string;
    callbackUrl?: string;
    variant?: "light" | "dark";
    settingsHref?: string;
}

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

    const isDark = variant === "dark";

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
            {/* Trigger — user row */}
            <button
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-3 w-full px-2 py-2 rounded-lg transition-colors ${
                    isDark
                        ? "hover:bg-slate-800"
                        : "hover:bg-slate-50"
                }`}
            >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isDark
                        ? "bg-indigo-500/20 text-indigo-400"
                        : "bg-indigo-100 text-indigo-700"
                }`}>
                    {initials}
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <p className={`text-xs font-semibold truncate ${isDark ? "text-slate-200" : "text-slate-900"}`}>{name}</p>
                    <p className={`text-xs truncate ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                        {email || role}
                    </p>
                </div>
                <svg
                    className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""} ${isDark ? "text-slate-600" : "text-slate-300"}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                </svg>
            </button>

            {/* Popover */}
            {open && (
                <div className={`absolute bottom-full left-0 right-0 mb-2 rounded-xl shadow-lg border overflow-hidden z-50 ${
                    isDark
                        ? "bg-slate-800 border-slate-700"
                        : "bg-white border-slate-200"
                }`}>
                    {/* User info header */}
                    <div className={`px-4 py-4 text-center border-b ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-2 ${
                            isDark
                                ? "bg-indigo-500/20 text-indigo-400"
                                : "bg-indigo-100 text-indigo-700"
                        }`}>
                            {initials}
                        </div>
                        <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{name}</p>
                        {email && (
                            <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>{email}</p>
                        )}
                        <p className={`text-xs mt-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{role}</p>
                    </div>

                    {/* Actions */}
                    <div className="p-1.5">
                        {settingsHref && (
                            <a
                                href={settingsHref}
                                onClick={() => setOpen(false)}
                                className={`flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                                    isDark
                                        ? "text-slate-300 hover:bg-slate-700"
                                        : "text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Account settings
                            </a>
                        )}

                        <div className={`my-1 border-t ${isDark ? "border-slate-700" : "border-slate-100"}`} />

                        <button
                            onClick={() => signOut({ callbackUrl })}
                            className={`flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                                isDark
                                    ? "text-red-400 hover:bg-red-500/10"
                                    : "text-red-600 hover:bg-red-50"
                            }`}
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
