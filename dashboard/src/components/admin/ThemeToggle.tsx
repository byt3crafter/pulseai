"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";

const KEY = "pulse-admin-theme";

/**
 * Dark/light theme toggle for the admin console. Sets data-theme on <html>
 * (only the admin uses the pulse-* token layer, so this is scoped in effect)
 * and persists the choice. A blocking script in the layout applies the saved
 * theme before paint to avoid a flash.
 */
export default function ThemeToggle() {
    const [theme, setTheme] = useState<"dark" | "light">("dark");

    useEffect(() => {
        const current = (document.documentElement.dataset.theme as "dark" | "light") || "dark";
        setTheme(current);
    }, []);

    const toggle = () => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem(KEY, next);
        } catch {
            /* ignore */
        }
        setTheme(next);
    };

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-pulse-border text-pulse-muted hover:text-pulse-text hover:bg-pulse-hover transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pulse-accent"
        >
            {theme === "dark" ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
        </button>
    );
}
