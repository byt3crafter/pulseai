import { NextRequest, NextResponse } from "next/server";

/**
 * OpenAI OAuth callback handler at /auth/callback.
 *
 * This path matches the redirect_uri registered for the Codex public
 * OAuth client (app_EMoamEEZ73f0CkXaXp7hrann).
 *
 * Flow: OpenAI redirects here after auth → we check the origin cookie
 * to decide where to forward:
 *   - "onboarding" → /onboarding?openai_code=...
 *   - otherwise    → /dashboard/settings?tab=providers&openai_code=...
 */
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const code = searchParams.get("code") || "";
    const state = searchParams.get("state") || "";
    const error = searchParams.get("error") || "";
    const errorDescription = searchParams.get("error_description") || "";

    // Read the origin cookie to decide redirect target
    const origin = req.cookies.get("openai_oauth_from")?.value;

    let redirectUrl: URL;
    if (origin === "onboarding") {
        redirectUrl = new URL("/onboarding", req.nextUrl.origin);
    } else {
        redirectUrl = new URL("/dashboard/settings", req.nextUrl.origin);
        redirectUrl.searchParams.set("tab", "providers");
    }

    if (code) redirectUrl.searchParams.set("openai_code", code);
    if (state) redirectUrl.searchParams.set("openai_state", state);
    if (error) redirectUrl.searchParams.set("openai_error", error);
    if (errorDescription) redirectUrl.searchParams.set("openai_error_desc", errorDescription);

    const response = NextResponse.redirect(redirectUrl);

    // Delete the origin cookie
    response.cookies.set("openai_oauth_from", "", { path: "/", maxAge: 0 });

    return response;
}
