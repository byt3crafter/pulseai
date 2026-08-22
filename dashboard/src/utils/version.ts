/**
 * App version + "update available" check for the admin update banner.
 *
 * Current version is baked into the image at build time (BUILD_VERSION → APP_VERSION,
 * see the Dockerfiles + release.yml). The latest released version is read from the
 * GitHub Releases API, cached for an hour. The repo is private, so a read-only token
 * (UPDATE_CHECK_TOKEN) is required — without it the check is silently disabled and no
 * banner shows (fail-safe: an update check must never break the dashboard).
 */

// Preferred: a runstate-hosted manifest so client boxes check runstate, not GitHub,
// and need no GitHub token. The manifest is a tiny public JSON: {"version":"0.19.0"}.
const MANIFEST_URL = process.env.UPDATE_CHECK_URL || "https://pulse.runstate.mu/pulse-version.json";
// Fallback: GitHub Releases (private repo → needs a token; usually left unset on boxes).
const REPO = process.env.UPDATE_CHECK_REPO || "byt3crafter/pulseai";
const TOKEN = process.env.UPDATE_CHECK_TOKEN || "";
const TTL_MS = 60 * 60 * 1000; // 1h

export function getAppVersion(): string {
    const v = (process.env.APP_VERSION || "").trim();
    return v && v !== "dev" ? v : "dev";
}

/** Parse "v1.2.3" / "1.2.3" → [1,2,3]; returns null if not semver-ish. */
function parse(v: string): number[] | null {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec((v || "").trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** a > b ? */
function isNewer(a: string, b: string): boolean {
    const pa = parse(a), pb = parse(b);
    if (!pa || !pb) return false;
    for (let i = 0; i < 3; i++) { if (pa[i] !== pb[i]) return pa[i] > pb[i]; }
    return false;
}

let cache: { at: number; latest: string } | null = null;

async function fetchFromManifest(): Promise<string> {
    if (!MANIFEST_URL) return "";
    try {
        const res = await fetch(MANIFEST_URL, { cache: "no-store", signal: AbortSignal.timeout(6000) });
        if (!res.ok) return "";
        const data = await res.json().catch(() => ({}));
        return String(data?.version || data?.latest || "").trim();
    } catch { return ""; }
}

async function fetchLatest(): Promise<string> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.latest;
    // Prefer the runstate manifest; fall back to GitHub only if a token is set.
    const fromManifest = await fetchFromManifest();
    if (fromManifest) { cache = { at: Date.now(), latest: fromManifest }; return fromManifest; }
    if (!TOKEN) { cache = { at: Date.now(), latest: cache?.latest || "" }; return cache.latest; }
    try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
            headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "pulse-update-check" },
            // Next: don't let this block or cache at the framework layer.
            cache: "no-store",
            signal: AbortSignal.timeout(6000),
        });
        let latest = "";
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            latest = String(data?.tag_name || "").trim();
        }
        if (!latest) {
            // Fall back to the newest tag if there are no GitHub "releases".
            const t = await fetch(`https://api.github.com/repos/${REPO}/tags?per_page=1`, {
                headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "pulse-update-check" },
                cache: "no-store", signal: AbortSignal.timeout(6000),
            });
            if (t.ok) { const arr = await t.json().catch(() => []); latest = String(arr?.[0]?.name || "").trim(); }
        }
        cache = { at: Date.now(), latest };
        return latest;
    } catch {
        return cache?.latest || "";
    }
}

export interface UpdateStatus { current: string; latest: string; updateAvailable: boolean }

export async function checkForUpdate(): Promise<UpdateStatus> {
    const current = getAppVersion();
    const latest = await fetchLatest();
    return { current, latest, updateAvailable: !!latest && isNewer(latest, current) };
}
