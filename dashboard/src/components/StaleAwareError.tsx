"use client";

import { useEffect } from "react";

/**
 * Shared error UI that auto-recovers a "stale deployment" error.
 *
 * Next.js hashes Server Action IDs per build, so a tab opened before a deploy
 * calls an action id that no longer exists — surfacing as "Failed to find
 * Server Action". reset() re-runs the same dead call; only a full reload fetches
 * the new bundle. We reload once (loop-guarded) and relabel. Any other error
 * keeps normal "try again". Used by both the dashboard and admin boundaries so
 * they can't drift.
 */
function isStaleDeployment(error: Error): boolean {
    const m = `${error?.message ?? ""} ${(error as any)?.digest ?? ""}`;
    return (
        /Failed to find Server Action/i.test(m) ||
        /from an older or newer deployment/i.test(m) ||
        /Connection closed|Failed to fetch/i.test(m)
    );
}

const RELOAD_GUARD = "pulse:stale-deploy-reloaded";

export default function StaleAwareError({ error, reset }: { error: Error; reset: () => void }) {
    const stale = isStaleDeployment(error);

    useEffect(() => {
        if (!stale) {
            try { sessionStorage.removeItem(RELOAD_GUARD); } catch { /* ignore */ }
            return;
        }
        let already = false;
        try {
            already = sessionStorage.getItem(RELOAD_GUARD) === "1";
            if (!already) sessionStorage.setItem(RELOAD_GUARD, "1");
        } catch { /* storage blocked — show the button */ }
        if (!already) {
            const t = setTimeout(() => window.location.reload(), 400);
            return () => clearTimeout(t);
        }
    }, [stale]);

    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
                <h2 className="text-lg font-semibold text-pulse-text mb-2">
                    {stale ? "Updating to the latest version…" : "Something went wrong"}
                </h2>
                <p className="text-sm text-pulse-muted mb-4">
                    {stale ? "A new version was just deployed. Reloading to pick it up." : "An unexpected error occurred."}
                </p>
                <button
                    onClick={() => (stale ? window.location.reload() : reset())}
                    className="px-4 py-2 bg-pulse-accent text-white rounded-lg text-sm hover:bg-pulse-accent-hi transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50"
                >
                    {stale ? "Reload now" : "Try again"}
                </button>
            </div>
        </div>
    );
}
