"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * OAuth bridge page — handles popup ↔ parent communication.
 *
 * If opened as a popup (window.opener exists):
 *   → sends code/state back to the parent via postMessage, then closes
 *
 * If opened in the same tab (no opener):
 *   → redirects to onboarding or settings based on state prefix
 *     - state starting with "ob_" → came from onboarding
 *     - anything else → came from settings
 */
export default function OAuthCompletePage() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const code = searchParams.get("openai_code") || "";
        const state = searchParams.get("openai_state") || "";
        const error = searchParams.get("openai_error") || "";
        const errorDesc = searchParams.get("openai_error_desc") || "";

        const data = { type: "openai_oauth_callback", code, state, error, errorDesc };

        // Popup mode: send data to parent window and close
        if (window.opener) {
            window.opener.postMessage(data, window.location.origin);
            window.close();
            return;
        }

        // Same-tab fallback: redirect based on state prefix
        const isOnboarding = state.startsWith("ob_");
        const params = new URLSearchParams();
        if (code) params.set("openai_code", code);
        if (state) params.set("openai_state", state);
        if (error) params.set("openai_error", error);
        if (errorDesc) params.set("openai_error_desc", errorDesc);

        if (isOnboarding) {
            window.location.href = `/onboarding?${params.toString()}`;
        } else {
            params.set("tab", "providers");
            window.location.href = `/dashboard/settings?${params.toString()}`;
        }
    }, [searchParams]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-600">Completing sign-in...</p>
            </div>
        </div>
    );
}
