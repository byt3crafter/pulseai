"use client";

import { useState } from "react";
import { approveOAuthAction, approveDirectAction, ensureDashboardClientAction } from "./actions";

interface Props {
    clientName: string;
    clientId: string;
    redirectUri: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    cliEnabled: boolean;
    userName: string;
    tenantName: string;
    isDashboardFlow: boolean;
}

export default function ConsentClient({
    clientName, clientId, redirectUri, state,
    codeChallenge, codeChallengeMethod,
    cliEnabled, userName, tenantName, isDashboardFlow,
}: Props) {
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleApprove = async () => {
        setProcessing(true);
        setError(null);

        if (isDashboardFlow) {
            // Dashboard-initiated: create client if needed, generate token directly
            let resolvedClientId = clientId;

            if (!resolvedClientId) {
                const clientResult = await ensureDashboardClientAction();
                if (clientResult.error || !clientResult.clientId) {
                    setError(clientResult.error ?? "Failed to create client.");
                    setProcessing(false);
                    return;
                }
                resolvedClientId = clientResult.clientId;
            }

            const result = await approveDirectAction(resolvedClientId);
            if (result.error) {
                setError(result.error);
                setProcessing(false);
                return;
            }

            setGeneratedToken(result.token!);
            setProcessing(false);
        } else {
            // External CLI flow: generate auth code and redirect
            const result = await approveOAuthAction({
                clientId,
                redirectUri,
                state,
                codeChallenge,
                codeChallengeMethod,
            });

            if (result.error) {
                setError(result.error);
                setProcessing(false);
                return;
            }

            if (result.redirectUrl) {
                window.location.href = result.redirectUrl;
            }
        }
    };

    const handleDeny = () => {
        if (redirectUri) {
            try {
                const url = new URL(redirectUri);
                url.searchParams.set("error", "access_denied");
                url.searchParams.set("error_description", "User denied the request");
                if (state) url.searchParams.set("state", state);
                window.location.href = url.toString();
                return;
            } catch {
                // Invalid redirect URI, fall through
            }
        }
        // Dashboard flow or no redirect: go back to settings
        window.location.href = "/dashboard/settings?tab=api";
    };

    const handleCopy = () => {
        if (generatedToken) {
            navigator.clipboard.writeText(generatedToken);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        }
    };

    // ── Token generated successfully ──
    if (generatedToken) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="bg-white border border-slate-200 rounded-2xl shadow-lg p-8 max-w-md w-full mx-4">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h1 className="text-xl font-bold text-slate-900">Connected!</h1>
                        <p className="text-sm text-slate-500 mt-1">Your API token has been generated.</p>
                    </div>

                    <div className="space-y-4">
                        {/* Token display */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">API Token</p>
                            <code className="block text-xs font-mono text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2.5 break-all select-all">
                                {generatedToken}
                            </code>
                            <button
                                onClick={handleCopy}
                                className="mt-2 w-full px-4 py-2 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors"
                            >
                                {copied ? "Copied!" : "Copy Token"}
                            </button>
                        </div>

                        {/* Warning */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <p className="text-xs text-amber-800 font-medium">
                                Copy this token now. It won&apos;t be shown again.
                            </p>
                        </div>

                        {/* Usage example */}
                        <div className="bg-slate-900 rounded-xl p-4">
                            <p className="text-xs text-slate-400 mb-2">Set as environment variable:</p>
                            <code className="block text-xs font-mono text-emerald-400 break-all">
                                export PULSE_API_TOKEN=&quot;{generatedToken}&quot;
                            </code>
                        </div>

                        {/* Back to settings */}
                        <a
                            href="/dashboard/settings?tab=api"
                            className="block text-center px-4 py-2.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                            Back to Settings
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // ── Consent form ──
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-lg p-8 max-w-md w-full mx-4">
                {/* Header */}
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-slate-900">Authorize Application</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Signed in as <span className="font-medium text-slate-700">{userName}</span>
                    </p>
                </div>

                {!cliEnabled ? (
                    /* CLI access is disabled */
                    <div className="space-y-4">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <p className="text-sm text-amber-800 font-medium">CLI Access is Disabled</p>
                            <p className="text-xs text-amber-700 mt-1">
                                Third-party CLI access is not enabled for your workspace. Enable it in{" "}
                                <a href="/dashboard/settings?tab=api" className="underline font-medium">Settings &rarr; API &amp; Developer</a>{" "}
                                first, then try again.
                            </p>
                        </div>
                        <button
                            onClick={handleDeny}
                            className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            Back to Settings
                        </button>
                    </div>
                ) : (
                    /* Consent form */
                    <div className="space-y-5">
                        {/* App info */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center">
                                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{clientName}</p>
                                    <p className="text-xs text-slate-500">wants to access <span className="font-medium">{tenantName}</span></p>
                                </div>
                            </div>
                        </div>

                        {/* Permissions */}
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">This will allow the application to:</p>
                            <ul className="space-y-2">
                                {[
                                    "Send messages to your AI agent",
                                    "Read AI responses",
                                    "Use your configured AI provider keys",
                                ].map((perm) => (
                                    <li key={perm} className="flex items-center gap-2 text-sm text-slate-700">
                                        <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        {perm}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* PKCE indicator */}
                        {codeChallenge && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Secured with PKCE (S256)
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleDeny}
                                disabled={processing}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Deny
                            </button>
                            <button
                                onClick={handleApprove}
                                disabled={processing}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                            >
                                {processing ? "Authorizing..." : "Approve"}
                            </button>
                        </div>

                        <p className="text-xs text-slate-400 text-center">
                            {isDashboardFlow
                                ? "Token expires in 90 days. You can revoke access anytime from Settings."
                                : "Token expires in 30 days. You can revoke access anytime from Settings."
                            }
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
