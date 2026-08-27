/*
 * NOTE: this file exists twice — pulse/src/gateway/oauth-redirect.ts and
 * dashboard/src/utils/oauth-redirect.ts — because the two packages share no
 * library and TypeScript's rootDir will not let either import the other. Both
 * ends of the OAuth flow need it: the dashboard decides whether to issue a
 * code, the gateway re-checks at the exchange. `oauth-redirect-copies.test.ts`
 * fails the build if the two ever differ, so this is duplication that cannot
 * silently rot — the same arrangement schema.ts already lives under.
 */
/**
 * OAuth redirect_uri validation.
 *
 * `oauth_clients.redirect_uris` has always been stored and never checked. That
 * makes the authorize endpoint an authorization-code delivery service for
 * whoever asks: a logged-in user who follows
 * `/oauth/authorize?client_id=<any registered client>&redirect_uri=https://attacker/`
 * and approves what looks like a normal connection prompt hands over a valid
 * code. The token endpoint only checks that the redirect_uri matches the one
 * STORED with the code — which is the attacker's own value, so it agrees.
 *
 * Registered patterns may wildcard the PORT only — a CLI binds whatever local
 * port happens to be free, so `127.0.0.1` with a star for the port and a fixed
 * callback path is the shape they register. Nothing else may be
 * wildcarded: a host wildcard would re-open exactly the hole this closes.
 *
 * Pure — no I/O — so it is cheap to test exhaustively.
 */

export function isAllowedRedirectUri(candidate: string, patterns: unknown): boolean {
    if (!candidate || !Array.isArray(patterns) || patterns.length === 0) return false;

    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        return false;
    }

    return patterns.some((raw) => {
        if (typeof raw !== "string" || !raw) return false;

        // The port is the only wildcard, so swap it for a parseable placeholder
        // rather than pattern-matching the string — string matching is how
        // `https://good.example.com.attacker.tld` gets accepted by a prefix test.
        const portWildcard = raw.includes(":*");
        let pattern: URL;
        try {
            pattern = new URL(portWildcard ? raw.replace(":*", ":1") : raw);
        } catch {
            return false;
        }

        if (url.protocol !== pattern.protocol) return false;
        if (url.hostname !== pattern.hostname) return false;
        if (!portWildcard && url.port !== pattern.port) return false;
        if (url.pathname !== pattern.pathname) return false;

        // A query or fragment the client did not register can carry the code
        // somewhere else once the client redirects onward.
        if (url.search || url.hash) return false;

        return true;
    });
}
