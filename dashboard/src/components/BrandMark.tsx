/**
 * Pulse brand mark — the violet gradient rounded-square with three equalizer
 * bars from the marketing site's logo. Icon-only (no wordmark, no font dep), so
 * it can sit next to the workspace name in the dashboard/admin sidebar.
 */
export default function BrandMark({ size = 28 }: { size?: number }) {
    const bar = Math.max(2, Math.round(size * 0.1));
    const h = (f: number) => Math.round(size * f);
    return (
        <span
            aria-hidden="true"
            style={{
                width: size,
                height: size,
                borderRadius: Math.round(size * 0.3),
                background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: Math.max(2, Math.round(size * 0.075)),
                boxShadow: "0 0 16px rgba(139,92,246,0.4)",
                flex: "0 0 auto",
            }}
        >
            <span style={{ width: bar, height: h(0.3), borderRadius: 2, background: "#fff" }} />
            <span style={{ width: bar, height: h(0.55), borderRadius: 2, background: "#fff" }} />
            <span style={{ width: bar, height: h(0.4), borderRadius: 2, background: "#fff" }} />
        </span>
    );
}
