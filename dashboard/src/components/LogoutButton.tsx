"use client";

import { signOut } from "next-auth/react";
import { ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline";

interface LogoutButtonProps {
    callbackUrl?: string;
    variant?: "light" | "dark" | "pulse";
}

const VARIANT_CLASSES = {
    light: "text-slate-400 hover:text-slate-600 hover:bg-slate-100",
    dark: "text-slate-500 hover:text-slate-300 hover:bg-slate-800",
    pulse: "text-pulse-faint hover:text-pulse-text-soft hover:bg-pulse-hover",
} as const;

export default function LogoutButton({ callbackUrl = "/login", variant = "light" }: LogoutButtonProps) {
    return (
        <button
            onClick={() => signOut({ callbackUrl })}
            className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs font-medium rounded-md transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${VARIANT_CLASSES[variant]}`}
        >
            <ArrowRightStartOnRectangleIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign out</span>
        </button>
    );
}
