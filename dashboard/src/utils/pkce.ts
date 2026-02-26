/**
 * PKCE (Proof Key for Code Exchange) utilities using Web Crypto API.
 * Used for the OpenAI OAuth 2.0 + PKCE browser sign-in flow.
 *
 * Matches the Codex CLI implementation (codex-rs/login/src/pkce.rs):
 * - code_verifier: 64 random bytes → base64url-no-pad (86 chars)
 * - code_challenge: SHA-256 of verifier string → base64url-no-pad (43 chars)
 * - state: 32 random bytes → base64url-no-pad
 */

function base64url(bytes: Uint8Array): string {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generate a random code_verifier (64 bytes → 86 chars base64url). */
export function generateCodeVerifier(): string {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
}

/** SHA-256 hash the verifier and return base64url-encoded code_challenge. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
    return base64url(new Uint8Array(digest));
}

/** Generate a random state parameter (32 bytes → 43 chars base64url). */
export function generateState(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
}
