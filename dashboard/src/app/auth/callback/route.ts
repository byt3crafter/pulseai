import { NextRequest, NextResponse } from "next/server";

/**
 * OpenAI OAuth callback handler at /auth/callback.
 *
 * This path matches the redirect_uri registered for the Codex public
 * OAuth client (app_EMoamEEZ73f0CkXaXp7hrann).
 *
 * Flow: OpenAI redirects here after auth → we redirect to the settings
 * page with the code/state as query params → SettingsClient picks them
 * up on mount and exchanges the code for tokens via server action.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const code = searchParams.get("code") || "";
    const state = searchParams.get("state") || "";
    const error = searchParams.get("error") || "";
    const errorDescription = searchParams.get("error_description") || "";

    // Redirect back to the settings providers tab with the OAuth result
    const redirectUrl = new URL("/dashboard/settings", req.nextUrl.origin);
    redirectUrl.searchParams.set("tab", "providers");

    if (code) redirectUrl.searchParams.set("openai_code", code);
    if (state) redirectUrl.searchParams.set("openai_state", state);
    if (error) redirectUrl.searchParams.set("openai_error", error);
    if (errorDescription) redirectUrl.searchParams.set("openai_error_desc", errorDescription);

    return NextResponse.redirect(redirectUrl);
}
