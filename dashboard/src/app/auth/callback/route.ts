import { NextRequest, NextResponse } from "next/server";

/**
 * OpenAI OAuth callback handler at /auth/callback.
 *
 * Receives the authorization code from OpenAI, then redirects to the
 * bridge page which handles popup → parent communication or same-tab fallback.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const code = searchParams.get("code") || "";
    const state = searchParams.get("state") || "";
    const error = searchParams.get("error") || "";
    const errorDescription = searchParams.get("error_description") || "";

    // Forward everything to the bridge page
    const bridgeUrl = new URL("/auth/callback/complete", req.nextUrl.origin);
    if (code) bridgeUrl.searchParams.set("openai_code", code);
    if (state) bridgeUrl.searchParams.set("openai_state", state);
    if (error) bridgeUrl.searchParams.set("openai_error", error);
    if (errorDescription) bridgeUrl.searchParams.set("openai_error_desc", errorDescription);

    return NextResponse.redirect(bridgeUrl);
}
