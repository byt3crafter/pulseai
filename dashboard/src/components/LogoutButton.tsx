"use client";

import { signOut } from "next-auth/react";
import { ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline";

interface LogoutButtonProps {
    callbackUrl?: string;
    variant?: "light" | "dark";
}

export default function LogoutButton({ callbackUrl = "/login", variant = "light" }: LogoutButtonProps) {
    const isDark = variant === "dark";

    return (
        <button
            onClick={() => signOut({ callbackUrl })}
            className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                isDark
                    ? "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            }`}
        >
            <ArrowRightStartOnRectangleIcon className="w-3.5 h-3.5" />
            <span>Sign out</span>
        </button>
    );
}
