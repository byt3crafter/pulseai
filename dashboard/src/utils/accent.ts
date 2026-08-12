/**
 * Per-tenant accent color. The base accent lives in globals.css; when a tenant
 * sets a custom accent (Settings → Appearance), the dashboard layout injects a
 * <style> that overrides the accent CSS variables at runtime — both the semantic
 * --pulse-accent tokens and the Tailwind indigo scale that most buttons/toggles/
 * rings use directly. Derived shades are computed with CSS color-mix so a single
 * picked color rebrands the whole dashboard.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isValidAccent(hex: unknown): hex is string {
    return typeof hex === "string" && HEX.test(hex.trim());
}

/**
 * Build the CSS override for a tenant accent, or null if the color is missing/
 * invalid (so the base globals.css accent stays in effect).
 */
export function accentOverrideCss(hex: unknown): string | null {
    if (!isValidAccent(hex)) return null;
    const c = (hex as string).trim();
    const mix = (pct: number, other: "white" | "black") => `color-mix(in srgb, ${c} ${pct}%, ${other})`;
    return [
        ":root{",
        `--pulse-accent:${c};`,
        `--pulse-accent-hi:${mix(82, "black")};`,
        `--color-indigo-400:${mix(66, "white")};`,
        `--color-indigo-500:${mix(84, "white")};`,
        `--color-indigo-600:${c};`,
        `--color-indigo-700:${mix(82, "black")};`,
        "}",
        // Dark theme keeps a lighter accent (matches the base palette pattern).
        `:root[data-theme="dark"]{--pulse-accent:${mix(72, "white")};--pulse-accent-hi:${mix(55, "white")};}`,
    ].join("");
}
