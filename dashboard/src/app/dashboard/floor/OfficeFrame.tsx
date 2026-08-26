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
        return () => window.clearTimeout(t);
    }, []);

    return (
        <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-pulse-bg">
            {!ready && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2">
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
                src="/office"
                title="The Floor — your AI workforce in 3D"
                onLoad={() => setReady(true)}
                className="h-full w-full border-0"
                // The office needs pointer lock for camera control; it is same-origin,
                // so it already runs with this document's privileges.
                allow="fullscreen; pointer-lock"
            />
        </div>
    );
}
