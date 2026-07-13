/**
 * SSRF guard shared by every code path that fetches a URL the model or a tenant
 * can influence (custom HTTP tools, MCP client, plugins).
 *
 * A hostname string check alone is not enough: an attacker can point a public
 * DNS name at a private IP, encode the address (`http://2130706433/`), or send a
 * 302 redirect to `http://169.254.169.254/…` that a naive `fetch` follows. So
 * `safeFetch` (a) pattern-checks the hostname, (b) resolves it and rejects if any
 * resolved address is private, and (c) follows redirects manually, re-running
 * both checks on every hop.
 */

import { lookup } from "node:dns/promises";

export function isPrivateIp(ip: string): boolean {
    if (
        ip === "0.0.0.0" ||
        /^127\./.test(ip) ||
        /^10\./.test(ip) ||
        /^192\.168\./.test(ip) ||
        /^169\.254\./.test(ip) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
    ) {
        return true;
    }
    const lower = ip.toLowerCase();
    // Strip an IPv4-mapped IPv6 prefix (::ffff:169.254.169.254) and re-check.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

/**
 * Protocol + hostname-pattern check. Fast, synchronous, catches the obvious
 * literals. NOT sufficient on its own — always pair with the DNS re-check in
 * `safeFetch` for anything the request actually reaches.
 */
export function assertSafeUrl(raw: string): URL {
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        throw new Error("Invalid URL");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("Only http(s) URLs are allowed");
    }
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const blocked =
        host === "localhost" ||
        host === "0.0.0.0" ||
        host === "::1" ||
        host.endsWith(".localhost") ||
        host.endsWith(".internal") ||
        host === "metadata.google.internal" ||
        host === "169.254.169.254" ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^169\.254\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
        /^fe80:/i.test(host) ||
        /^fc00:/i.test(host) ||
        /^fd/i.test(host) ||
        isPrivateIp(host);
    if (blocked) throw new Error("Requests to internal/private hosts are not allowed");
    return u;
}

/** Resolve the host and reject if ANY resolved address is private/loopback. */
export async function assertResolvedHostSafe(hostname: string): Promise<void> {
    let addresses: { address: string }[];
    try {
        addresses = await lookup(hostname, { all: true });
    } catch {
        throw new Error(`Could not resolve host "${hostname}"`);
    }
    for (const { address } of addresses) {
        if (isPrivateIp(address)) {
            throw new Error("Requests to internal/private hosts are not allowed");
        }
    }
}

const MAX_REDIRECTS = 5;

/**
 * `fetch` with an SSRF guard applied to the initial URL AND every redirect hop.
 * Redirects are followed manually (`redirect: "manual"`) so the guard runs
 * again before each new request — the default `redirect: "follow"` would chase
 * a 302 into a private address with no re-check.
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
    let current = assertSafeUrl(rawUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertResolvedHostSafe(current.hostname);
        const res = await fetch(current.toString(), { ...init, redirect: "manual" });
        // 3xx with a Location → validate the target and continue.
        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            if (!loc) return res;
            const next = new URL(loc, current);
            current = assertSafeUrl(next.toString());
            continue;
        }
        return res;
    }
    throw new Error("Too many redirects");
}
