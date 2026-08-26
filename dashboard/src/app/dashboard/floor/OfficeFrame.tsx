"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hosts the 3D office. Deliberately chrome-less — the office has its own
 * toolbars, and stacking ours on top of them just steals room from the scene.
 */
export default function OfficeFrame() {
    const [ready, setReady] = useState(false);
    const [slow, setSlow] = useState(false);
    const ref = useRef<HTMLIFrameElement>(null);

    // The scene is a few MB of 3D assets; say something if it is taking a while
    // rather than showing an empty rectangle.
    useEffect(() => {
        const t = window.setTimeout(() => setSlow(true), 6000);
        // The office paints and becomes usable long before every 3D asset has
        // landed, but `load` waits for all of them — so on a slow link this
        // overlay outlived the thing it was covering. Clear it on a deadline
        // too, not only on `load`.
        const giveUp = window.setTimeout(() => setReady(true), 20000);
        return () => {
            window.clearTimeout(t);
            window.clearTimeout(giveUp);
        };
    }, []);

    return (
        // dvh, not vh: on mobile the browser chrome shrinks the visual viewport,
        // and vh keeps counting the space behind it.
        <div className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden bg-pulse-bg">
            {!ready && (
                // pointer-events-none: this is a progress indicator, not a
                // modal. It used to sit over the office swallowing every tap.
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-pulse-border border-t-pulse-accent" />
                    <p className="text-sm text-pulse-muted">Opening the office…</p>
                    {slow && (
                        <p className="max-w-xs text-center text-xs text-pulse-faint">
                            Loading the 3D scene. The first visit is the slow one — it caches after that.
                        </p>
                    )}
                </div>
            )}
            <iframe
                ref={ref}
                src="/office/office"
                title="The Floor — your AI workforce in 3D"
                onLoad={() => setReady(true)}
                className="h-full w-full border-0"
                // Same-origin, so it already runs with this document's privileges.
                allow="fullscreen"
            />
        </div>
    );
}
