/**
 * OpenAI OAuth 2.0 configuration and helpers for browser-based sign-in.
 * Uses the same public client ID as Codex CLI (no client secret needed).
 *
 * Reference: codex-rs/login/src/server.rs — build_authorize_url()
 * Scopes and redirect_uri must match the Codex CLI exactly.
 */

export const OPENAI_OAUTH_CONFIG = {
    authorizationEndpoint: "https://auth.openai.com/oauth/authorize",
    tokenEndpoint: "https://auth.openai.com/oauth/token",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    // Must match Codex CLI exactly — no extra API scopes allowed
    scopes: "openid profile email offline_access",
} as const;

/** Build the full authorization URL (same-tab redirect). */
export function buildOpenAIAuthUrl({
    codeChallenge,
    state,
    redirectUri,
}: {
    codeChallenge: string;
    state: string;
    redirectUri: string;
}): string {
    const params = new URLSearchParams({
        response_type: "code",
        client_id: OPENAI_OAUTH_CONFIG.clientId,
        redirect_uri: redirectUri,
        scope: OPENAI_OAUTH_CONFIG.scopes,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
        originator: "codex_cli_rs",
    });

    return `${OPENAI_OAUTH_CONFIG.authorizationEndpoint}?${params.toString()}`;
}

/**
 * Get the callback URL for the OAuth redirect.
 *
 * The Codex CLI client (app_EMoamEEZ73f0CkXaXp7hrann) only accepts
 * redirect URIs on localhost:1455 — the default Codex CLI callback port.
 * Our Pulse backend runs a tiny proxy on :1455 that redirects to the
 * dashboard on :3001 after catching the OAuth callback.
 *
 * Pattern: OpenClaw/pi-ai → localhost:1455 → proxy → dashboard:3001
 */
export function getCallbackUrl(): string {
    return "http://localhost:1455/auth/callback";
}
