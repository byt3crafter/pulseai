import type { MetadataRoute } from "next";
import { getBranding } from "../utils/branding";

// Read branding at request time (not build) so the install name follows the
// deployment's white-label instead of being frozen at prerender.
export const dynamic = "force-dynamic";

// PWA manifest — served by Next.js at /manifest.webmanifest. Lets a standalone
// deployment be "installed" (Add to Home Screen / desktop PWA) so it opens
// straight into the app chrome. Name follows the workspace branding so a
// white-labelled install shows the customer's name, not "Pulse".
// Icon: only /icon (app/icon.tsx, a generated PNG) exists in this repo — no
// static favicon.ico or PNG icons in public/, so nothing else is referenced.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
    const brand = await getBranding().catch(() => ({ productName: "Pulse" } as { productName: string }));
    const name = brand.productName || "Pulse";
    return {
        name,
        short_name: name.split(/\s+/)[0] || name,
        description: `${name} — your own agentic AI workforce.`,
        start_url: "/dashboard/assistant",
        display: "standalone",
        background_color: "#0A0A0C",
        theme_color: "#0A0A0C",
        icons: [
            { src: "/icon", sizes: "32x32", type: "image/png" },
        ],
    };
}
