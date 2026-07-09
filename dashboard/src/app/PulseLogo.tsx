import styles from "./landing.module.css";

/**
 * Pulse AI brand lockup — the exact logo from the design: a violet gradient
 * rounded-square with three animated equalizer bars + the "Pulse AI" wordmark
 * (AI in violet), Sora font. Inline SVG-free markup so it's crisp at any size
 * and needs no image asset. `eq1/eq2/eq3` keyframes live in landing.module.css.
 */
export default function PulseLogo({
    size = 40,
    showText = true,
    textSize = 24,
}: {
    size?: number;
    showText?: boolean;
    textSize?: number;
}) {
    const bar = Math.max(3, Math.round(size * 0.1));
    const h = (f: number) => Math.round(size * f);
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
            <span
                aria-hidden="true"
                className={styles.logoMark}
                style={{
                    width: size,
                    height: size,
                    borderRadius: Math.round(size * 0.3),
                    background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    boxShadow: "0 0 24px rgba(139,92,246,0.45)",
                    flex: "0 0 auto",
                }}
            >
                <span className={styles.logoBar} style={{ width: bar, height: h(0.3), borderRadius: 2, background: "#fff" }} />
                <span className={styles.logoBar} style={{ width: bar, height: h(0.55), borderRadius: 2, background: "#fff", animationDelay: "0.2s" }} />
                <span className={styles.logoBar} style={{ width: bar, height: h(0.4), borderRadius: 2, background: "#fff", animationDelay: "0.4s" }} />
            </span>
            {showText && (
                <span style={{ fontFamily: "var(--font-sora), sans-serif", fontSize: textSize, fontWeight: 700, color: "#F4F1FB", letterSpacing: "-0.01em" }}>
                    Pulse <span style={{ color: "#A78BFA" }}>AI</span>
                </span>
            )}
        </span>
    );
}
