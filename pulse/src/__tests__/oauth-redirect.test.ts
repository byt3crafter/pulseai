import { describe, it, expect } from "vitest";
import { isAllowedRedirectUri } from "../gateway/oauth-redirect.js";

/*
 * redirect_uri validation, found missing 2026-08-27 while re-checking the July
 * audit. `oauth_clients.redirect_uris` was stored and never read, so approving
 * a connection delivered a working authorization code to whatever address the
 * link named. The token exchange did not catch it: it compares against the
 * redirect_uri stored WITH the code, which is the attacker's own value.
 *
 * These run the real matcher rather than restating the rule, because the
 * interesting cases are all near-misses — a host that merely starts with the
 * right characters, a path with a suffix, a query string bolted on.
 */
const CLI = ["http://127.0.0.1:*/oauth/callback", "http://localhost:*/oauth/callback"];

describe("redirect_uri must be one the client registered", () => {
    it("rejects an address the client never registered", () => {
        expect(isAllowedRedirectUri("https://attacker.example/", CLI)).toBe(false);
    });

    it("rejects a hostname that merely contains the registered one", () => {
        // The failure mode of any prefix or substring test.
        expect(isAllowedRedirectUri("http://127.0.0.1.attacker.example:8080/oauth/callback", CLI)).toBe(false);
        expect(isAllowedRedirectUri("http://localhost.attacker.example:80/oauth/callback", CLI)).toBe(false);
    });

    it("rejects a path that only starts the same way", () => {
        expect(isAllowedRedirectUri("http://127.0.0.1:8080/oauth/callbackX", CLI)).toBe(false);
        expect(isAllowedRedirectUri("http://127.0.0.1:8080/oauth/callback/evil", CLI)).toBe(false);
    });

    it("rejects an added query or fragment", () => {
        // A registered client that redirects onward using its own query params
        // would forward the code with it.
        expect(isAllowedRedirectUri("http://127.0.0.1:8080/oauth/callback?next=https://attacker/", CLI)).toBe(false);
        expect(isAllowedRedirectUri("http://127.0.0.1:8080/oauth/callback#x", CLI)).toBe(false);
    });

    it("rejects a scheme swap", () => {
        expect(isAllowedRedirectUri("https://127.0.0.1:8080/oauth/callback", CLI)).toBe(false);
    });

    it("rejects garbage and empty input rather than throwing", () => {
        expect(isAllowedRedirectUri("", CLI)).toBe(false);
        expect(isAllowedRedirectUri("not a url", CLI)).toBe(false);
        expect(isAllowedRedirectUri("http://127.0.0.1:8080/oauth/callback", [])).toBe(false);
        expect(isAllowedRedirectUri("http://127.0.0.1:8080/oauth/callback", null)).toBe(false);
    });

    it("still allows the real CLI flow on any local port", () => {
        // The reason the port is wildcarded at all: the CLI binds whatever is free.
        expect(isAllowedRedirectUri("http://127.0.0.1:8080/oauth/callback", CLI)).toBe(true);
        expect(isAllowedRedirectUri("http://127.0.0.1:53219/oauth/callback", CLI)).toBe(true);
        expect(isAllowedRedirectUri("http://localhost:9999/oauth/callback", CLI)).toBe(true);
    });

    it("honours an exact, non-wildcard registration", () => {
        expect(isAllowedRedirectUri("https://x/", ["https://x"])).toBe(true);
        expect(isAllowedRedirectUri("https://y/", ["https://x"])).toBe(false);
    });

    it("does not let a wildcard registration widen the host", () => {
        // Only the port may be starred. A pattern trying to star the host must
        // not match everything — it must match nothing.
        expect(isAllowedRedirectUri("http://anything.example:80/cb", ["http://*:80/cb"])).toBe(false);
    });
});
