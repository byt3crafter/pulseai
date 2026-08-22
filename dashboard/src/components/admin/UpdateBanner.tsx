"use client";

import { useEffect, useState } from "react";

/**
 * Slim admin banner shown when a newer Pulse version has been released. Dismissible
 * per released version (so it re-appears when the NEXT version ships, not after a
 * simple page reload). Purely informational — the operator updates via the fleet.
 */
export default function UpdateBanner({ current, latest }: { current: string; latest: string }) {
    const [show, setShow] = useState(false);
    useEffect(() => {
        try { setShow(localStorage.getItem("pulse-update-dismissed") !== latest); } catch { setShow(true); }
    }, [latest]);
    if (!show) return null;
    return (
        <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-500">
            <span aria-hidden="true">↑</span>
            <span className="text-pulse-text">
                <strong>Update available — {latest}.</strong> You&apos;re running {current}.
            </span>
            <a href="https://github.com/byt3crafter/pulseai/releases" target="_blank" rel="noopener noreferrer"
                className="font-medium underline decoration-amber-500/50 hover:decoration-amber-500">
                Release notes
            </a>
            <button
                onClick={() => { try { localStorage.setItem("pulse-update-dismissed", latest); } catch {} setShow(false); }}
                className="ml-auto rounded px-2 py-0.5 text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text"
                aria-label="Dismiss"
            >
                ✕
            </button>
        </div>
    );
}
