"use client";

import { signOut } from "next-auth/react";
import { ArrowLeftOnRectangleIcon } from "@heroicons/react/24/outline";

export default function LogoutButton() {
    return (
        <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100/50"
        >
            <ArrowLeftOnRectangleIcon className="w-5 h-5" />
            <span>Sign Out</span>
        </button>
    );
}
