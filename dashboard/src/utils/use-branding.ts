"use client";

import { useEffect, useState } from "react";

export interface PublicBranding {
    productName: string;
    logoDataUrl: string | null;
    accent: string | null;
}

/**
 * Pre-login branding, fetched client-side (these pages are client components).
 *
 * Starts as null so the card renders immediately with a neutral mark rather
 * than blocking on the request; the brand fills in when it arrives. One hook,
 * so the tenant and admin logins can never drift in how they present a brand.
 */
export function useBranding(): PublicBranding | null {
    const [branding, setBranding] = useState<PublicBranding | null>(null);
    useEffect(() => {
        let cancelled = false;
        fetch("/api/branding")
            .then((r) => r.json())
            .then((b) => { if (!cancelled) setBranding(b); })
            .catch(() => { /* keep the neutral default */ });
        return () => { cancelled = true; };
    }, []);
    return branding;
}

/**
 * Inline style that repaints the accent to the tenant's colour.
 *
 * `bg-pulse-accent` resolves `var(--pulse-accent)`, so overriding the var on a
 * wrapper cascades to every accent element inside — the button, links, focus
 * rings — with no per-element work. `-hi` is a slightly darker hover; derived
 * with color-mix so a customer only has to pick one colour.
 */
export function accentStyle(accent: string | null | undefined): React.CSSProperties {
    if (!accent) return {};
    return {
        ["--pulse-accent" as any]: accent,
        ["--pulse-accent-hi" as any]: `color-mix(in srgb, ${accent} 82%, black)`,
    };
}
