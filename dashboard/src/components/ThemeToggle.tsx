"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";

/**
 * Sun/moon toggle that flips `data-theme` on <html> between 'light' and
 * 'dark', persisting the choice to localStorage. The blocking script in the
 * root layout already sets the initial theme before paint — this component
 * just reads it back on mount and lets the user flip it.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
    // Default matches the CSS default (dark) so server/client first render agree;
    // corrected immediately on mount from the already-applied data-theme attribute.
    const [theme, setTheme] = useState<"light" | "dark">("dark");

    useEffect(() => {
        const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
        setTheme(current);
    }, []);

    function toggle() {
        const next = theme === "light" ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        try {
            window.localStorage.setItem("pulse-theme", next);
        } catch {
            // localStorage may be unavailable (privacy mode) — theme still
            // applies for the session via the DOM attribute.
        }
        setTheme(next);
    }

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel ${className}`}
        >
            {theme === "light" ? (
                <MoonIcon aria-hidden="true" className="w-5 h-5" />
            ) : (
                <SunIcon aria-hidden="true" className="w-5 h-5" />
            )}
        </button>
    );
}
