"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { PROVIDERS, DEFAULT_MODEL_ID } from "../../utils/models";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "../../utils/pkce";
import { buildOpenAIAuthUrl, getCallbackUrl } from "../../utils/openai-oauth";
import {
    changePasswordOnboardingAction,
    validateProviderKeyOnboardingAction,
    saveProviderKeyOnboardingAction,
    exchangeOpenAICodeOnboardingAction,
    saveTelegramOnboardingAction,
    saveTelegramConfigOnboardingAction,
    savePluginCredentialsOnboardingAction,
    createFirstAgentAction,
    completeOnboardingAction,
} from "./actions";

interface PluginInfo {
    pluginId: string;
    pluginName: string;
    credentialSchema: Array<{
        name: string;
        label: string;
        type: "url" | "text" | "secret";
        placeholder?: string;
        required?: boolean;
        helpText?: string;
    }>;
    configured: boolean;
}

interface Props {
    initialStep: number;
    needsPassword: boolean;
    connectedProviders: string[];
    hasTelegram: boolean;
    plugins: PluginInfo[];
    allPluginsConfigured: boolean;
    hasAgent: boolean;
}

const STEP_LABELS = ["Password", "AI Provider", "Telegram", "Integrations", "Create Agent", "Done"];

export default function OnboardingWizard({
    initialStep,
    needsPassword,
    connectedProviders: initialProviders,
    hasTelegram: initialTelegram,
    plugins,
    allPluginsConfigured: initialPluginsConfigured,
    hasAgent: initialHasAgent,
}: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [pending, startTransition] = useTransition();

    // Track step — start from server-calculated step
    const [step, setStep] = useState(initialStep);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Local state tracking for provider connections
    const [connectedProviders, setConnectedProviders] = useState<string[]>(initialProviders);
    const [hasTelegram, setHasTelegram] = useState(initialTelegram);
    const [hasAgent, setHasAgent] = useState(initialHasAgent);
    const [configuredPlugins, setConfiguredPlugins] = useState<Set<string>>(
        new Set(plugins.filter((p) => p.configured).map((p) => p.pluginId))
    );

    // Provider key input state
    const [selectedProvider, setSelectedProvider] = useState("anthropic");
    const [apiKeyInput, setApiKeyInput] = useState("");
    const [validating, setValidating] = useState(false);

    // OAuth state for OpenAI
    const [authMethod, setAuthMethod] = useState<"api_key" | "oauth">("api_key");
    const [oauthStatus, setOauthStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({ type: "idle", message: "" });
    const [manualUrl, setManualUrl] = useState("");

    const supportsOAuth = selectedProvider === "openai";
    const isOAuth = authMethod === "oauth" && supportsOAuth;

    // Telegram config state
    const [botMode, setBotMode] = useState<"private" | "group" | "both">("private");
    const [telegramUserId, setTelegramUserId] = useState("");
    const [telegramUserName, setTelegramUserName] = useState("");
    const [groupChatId, setGroupChatId] = useState("");
    const [groupName, setGroupName] = useState("");
    const [telegramConfigured, setTelegramConfigured] = useState(false);

    // Determine effective step (skip password if not needed)
    const effectiveStep = !needsPassword && step === 1 ? 2 : step;

    // Skip plugins step if no plugins need credentials
    const skipPlugins = plugins.length === 0;

    const clearMessages = () => {
        setError("");
        setSuccess("");
    };

    const goNext = () => {
        clearMessages();
        let next = effectiveStep + 1;
        // Skip plugins step if none need configuration
        if (next === 4 && skipPlugins) next = 5;
        setStep(next);
    };

    // ─── Step 1: Password ────────────────────────────────────────────────

    const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        clearMessages();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
            const result = await changePasswordOnboardingAction(fd);
            if (!result.success) {
                setError(result.message ?? "Failed to set password.");
                return;
            }
            // Re-authenticate to refresh JWT with mustChangePassword=false
            const newPassword = fd.get("newPassword") as string;
            const session = await signIn("credentials", {
                email: undefined, // Will use current session email
                redirect: false,
            });
            // Just refresh server state and advance
            router.refresh();
            setStep(2);
        });
    };

    // ─── Step 2: Provider Key ────────────────────────────────────────────

    const handleProviderSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        clearMessages();
        setValidating(true);

        const fd = new FormData();
        fd.set("provider", selectedProvider);
        fd.set("apiKey", apiKeyInput);

        // Validate first
        const validation = await validateProviderKeyOnboardingAction(fd);
        if (!validation.valid) {
            setError(validation.error ?? "Invalid API key.");
            setValidating(false);
            return;
        }

        // Save
        const result = await saveProviderKeyOnboardingAction(fd);
        setValidating(false);

        if (!result.success) {
            setError(result.message ?? "Failed to save key.");
            return;
        }

        setSuccess(result.message ?? "Key saved.");
        setConnectedProviders((prev) =>
            prev.includes(selectedProvider) ? prev : [...prev, selectedProvider]
        );
        setApiKeyInput("");
        router.refresh();
    };

    // ─── Step 2b: OpenAI OAuth Sign-in ─────────────────────────────────

    const exchangeOAuthCode = (code: string, verifier: string, redirectUri: string) => {
        setOauthStatus({ type: "saving", message: "Exchanging token..." });
        exchangeOpenAICodeOnboardingAction({ code, codeVerifier: verifier, redirectUri }).then((result) => {
            localStorage.removeItem("openai_pkce_verifier");
            localStorage.removeItem("openai_pkce_state");
            localStorage.removeItem("openai_redirect_uri");
            setOauthStatus({ type: result.success ? "success" : "error", message: result.message ?? "" });
            if (result.success) {
                setConnectedProviders((prev) => prev.includes("openai") ? prev : [...prev, "openai"]);
                router.refresh();
            }
        });
    };

    const handleOpenAISignIn = async () => {
        try {
            const verifier = generateCodeVerifier();
            const challenge = await generateCodeChallenge(verifier);
            const rawState = generateState();
            const state = `ob_${rawState}`; // Prefix so callback knows this is from onboarding
            const redirectUri = getCallbackUrl();

            // Use localStorage (shared across tabs/popups on same origin)
            localStorage.setItem("openai_pkce_verifier", verifier);
            localStorage.setItem("openai_pkce_state", state);
            localStorage.setItem("openai_redirect_uri", redirectUri);

            const authUrl = buildOpenAIAuthUrl({ codeChallenge: challenge, state, redirectUri });

            // Open in popup window
            const popup = window.open(authUrl, "openai_auth", "width=600,height=700,scrollbars=yes");

            if (!popup || popup.closed) {
                // Popup blocked — fall back to same-tab redirect
                window.location.href = authUrl;
            }
        } catch {
            setOauthStatus({ type: "error", message: "Failed to start OAuth flow." });
        }
    };

    const handleManualPaste = () => {
        if (!manualUrl.trim()) return;
        try {
            const url = new URL(manualUrl);
            const code = url.searchParams.get("code");
            const returnedState = url.searchParams.get("state");
            const urlError = url.searchParams.get("error");
            const errorDesc = url.searchParams.get("error_description");

            if (urlError) {
                setOauthStatus({ type: "error", message: errorDesc || "Authorization was denied." });
                return;
            }

            const savedState = localStorage.getItem("openai_pkce_state");
            if (returnedState !== savedState) {
                setOauthStatus({ type: "error", message: "Invalid response (state mismatch). Please try again." });
                return;
            }

            const savedVerifier = localStorage.getItem("openai_pkce_verifier");
            const savedRedirectUri = localStorage.getItem("openai_redirect_uri");

            if (!code || !savedVerifier || !savedRedirectUri) {
                setOauthStatus({ type: "error", message: "Missing OAuth data. Please try again." });
                return;
            }

            setManualUrl("");
            exchangeOAuthCode(code, savedVerifier, savedRedirectUri);
        } catch {
            setOauthStatus({ type: "error", message: "Invalid URL." });
        }
    };

    // Listen for postMessage from OAuth popup window
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type !== "openai_oauth_callback") return;

            const { code, state, error, errorDesc } = event.data;

            setStep(2);
            setSelectedProvider("openai");
            setAuthMethod("oauth");

            if (error) {
                setOauthStatus({ type: "error", message: errorDesc || "Authorization was denied." });
                return;
            }

            const savedState = localStorage.getItem("openai_pkce_state");
            if (state !== savedState) {
                setOauthStatus({ type: "error", message: "Invalid response (state mismatch). Please try again." });
                return;
            }

            const savedVerifier = localStorage.getItem("openai_pkce_verifier");
            const savedRedirectUri = localStorage.getItem("openai_redirect_uri");

            if (!code || !savedVerifier || !savedRedirectUri) {
                setOauthStatus({ type: "error", message: "Missing OAuth data. Please try again." });
                return;
            }

            exchangeOAuthCode(code, savedVerifier, savedRedirectUri);
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle same-tab fallback redirect (when popup was blocked)
    useEffect(() => {
        const code = searchParams.get("openai_code");
        const returnedState = searchParams.get("openai_state");
        const oauthError = searchParams.get("openai_error");
        const errorDesc = searchParams.get("openai_error_desc");

        if (!code && !oauthError) return;

        // Clean URL immediately
        const url = new URL(window.location.href);
        url.searchParams.delete("openai_code");
        url.searchParams.delete("openai_state");
        url.searchParams.delete("openai_error");
        url.searchParams.delete("openai_error_desc");
        window.history.replaceState({}, "", url.toString());

        setStep(2);
        setSelectedProvider("openai");
        setAuthMethod("oauth");

        if (oauthError) {
            setOauthStatus({ type: "error", message: errorDesc || "Authorization was denied." });
            return;
        }

        const savedState = localStorage.getItem("openai_pkce_state");
        if (returnedState !== savedState) {
            setOauthStatus({ type: "error", message: "Invalid response (state mismatch). Please try again." });
            return;
        }

        const savedVerifier = localStorage.getItem("openai_pkce_verifier");
        const savedRedirectUri = localStorage.getItem("openai_redirect_uri");

        if (!code || !savedVerifier || !savedRedirectUri) {
            setOauthStatus({ type: "error", message: "Missing OAuth data. Please try again." });
            return;
        }

        exchangeOAuthCode(code, savedVerifier, savedRedirectUri);
    }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Step 3: Telegram ────────────────────────────────────────────────

    const handleTelegramSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        clearMessages();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
            const result = await saveTelegramOnboardingAction(fd);
            if (!result.success) {
                setError(result.message ?? "Invalid token.");
                return;
            }
            setSuccess(result.message ?? "Connected.");
            setHasTelegram(true);
            router.refresh();
        });
    };

    const handleTelegramConfigAndContinue = async () => {
        clearMessages();

        // Validate required fields based on mode
        if ((botMode === "private" || botMode === "both") && !telegramUserId.trim()) {
            setError("Enter your Telegram User ID for private chat access.");
            return;
        }
        if ((botMode === "group" || botMode === "both") && !groupChatId.trim()) {
            setError("Enter the Group Chat ID for group access.");
            return;
        }

        startTransition(async () => {
            const result = await saveTelegramConfigOnboardingAction({
                botMode,
                userId: telegramUserId.trim() || undefined,
                userName: telegramUserName.trim() || undefined,
                groupChatId: groupChatId.trim() || undefined,
                groupName: groupName.trim() || undefined,
            });

            if (!result.success) {
                setError(result.message ?? "Failed to configure Telegram.");
                return;
            }

            setTelegramConfigured(true);
            router.refresh();
            goNext();
        });
    };

    // ─── Step 4: Plugin Credentials ──────────────────────────────────────

    const handlePluginCredentialSubmit = async (
        e: React.FormEvent<HTMLFormElement>,
        pluginId: string
    ) => {
        e.preventDefault();
        clearMessages();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
            const result = await savePluginCredentialsOnboardingAction(fd);
            if (!result.success) {
                setError(result.message ?? "Failed to save credential.");
                return;
            }
            setSuccess(result.message ?? "Saved.");
            setConfiguredPlugins((prev) => new Set([...prev, pluginId]));
            router.refresh();
        });
    };

    // ─── Step 5: Create Agent ────────────────────────────────────────────

    const handleAgentSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        clearMessages();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
            const result = await createFirstAgentAction(fd);
            if (!result.success) {
                setError(result.message ?? "Failed to create agent.");
                return;
            }
            setHasAgent(true);
            router.refresh();
            setStep(6);
        });
    };

    // ─── Step 6: Complete ────────────────────────────────────────────────

    const handleComplete = async () => {
        startTransition(async () => {
            await completeOnboardingAction();
            // Sign out and re-login for clean JWT with onboardingComplete=true
            await signOut({ callbackUrl: "/login" });
        });
    };

    // Filter models to only show connected providers
    const availableProviders = PROVIDERS.filter((p) =>
        connectedProviders.includes(p.id)
    );

    return (
        <div className="w-full max-w-xl px-4">
            {/* Logo */}
            <div className="flex items-center gap-2 justify-center mb-8">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-5 h-5 text-white"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                        />
                    </svg>
                </div>
                <span className="text-lg font-bold text-slate-900">Pulse</span>
            </div>

            {/* Step Progress */}
            <div className="flex items-center justify-center gap-1.5 mb-8">
                {STEP_LABELS.map((label, i) => {
                    const stepNum = i + 1;
                    // Skip password dot if not needed
                    if (stepNum === 1 && !needsPassword) return null;
                    // Skip plugins dot if no plugins
                    if (stepNum === 4 && skipPlugins) return null;

                    const isActive = stepNum === effectiveStep;
                    const isDone = stepNum < effectiveStep;
                    return (
                        <div key={label} className="flex flex-col items-center gap-1">
                            <div
                                className={`h-1.5 rounded-full transition-all ${
                                    isActive
                                        ? "w-8 bg-indigo-600"
                                        : isDone
                                        ? "w-4 bg-indigo-300"
                                        : "w-4 bg-slate-200"
                                }`}
                            />
                            <span
                                className={`text-[10px] ${
                                    isActive
                                        ? "text-indigo-600 font-medium"
                                        : isDone
                                        ? "text-indigo-400"
                                        : "text-slate-400"
                                }`}
                            >
                                {label}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* ── Step 1: Password ── */}
                {effectiveStep === 1 && needsPassword && (
                    <>
                        <StepHeader
                            stepLabel="Step 1"
                            title="Welcome! Set your password"
                            description="You've been given a temporary password. Create a permanent one to secure your account."
                        />
                        <form onSubmit={handlePasswordSubmit} className="px-8 py-6 space-y-4">
                            <InputField
                                label="New Password"
                                name="newPassword"
                                type="password"
                                placeholder="Min. 8 characters"
                                required
                                minLength={8}
                            />
                            <InputField
                                label="Confirm Password"
                                name="confirmPassword"
                                type="password"
                                placeholder="Repeat password"
                                required
                            />
                            <ErrorMessage message={error} />
                            <SubmitButton loading={pending} label="Set Password & Continue" />
                        </form>
                    </>
                )}

                {/* ── Step 2: AI Provider ── */}
                {effectiveStep === 2 && (
                    <>
                        <StepHeader
                            stepLabel="Step 2"
                            title="Connect an AI Provider"
                            description="Your agent needs a brain. Connect at least one AI provider to power it. Your API key is encrypted with AES-256 and never stored in plaintext."
                        />
                        <form onSubmit={handleProviderSubmit} className="px-8 py-6 space-y-4">
                            {/* Connected providers badges */}
                            {connectedProviders.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {connectedProviders.map((p) => (
                                        <span
                                            key={p}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200"
                                        >
                                            <svg
                                                className="w-3 h-3"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                strokeWidth={2.5}
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M4.5 12.75l6 6 9-13.5"
                                                />
                                            </svg>
                                            {PROVIDERS.find((pr) => pr.id === p)?.name ?? p}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Provider
                                </label>
                                <select
                                    value={selectedProvider}
                                    onChange={(e) => {
                                        setSelectedProvider(e.target.value);
                                        setAuthMethod("api_key");
                                        setOauthStatus({ type: "idle", message: "" });
                                        clearMessages();
                                    }}
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900 bg-white"
                                >
                                    {PROVIDERS.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}{" "}
                                            {connectedProviders.includes(p.id)
                                                ? "(connected)"
                                                : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Auth method toggle — only for OpenAI */}
                            {supportsOAuth && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Authentication Method</label>
                                    <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => { setAuthMethod("api_key"); setApiKeyInput(""); setOauthStatus({ type: "idle", message: "" }); clearMessages(); }}
                                            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${authMethod === "api_key"
                                                ? "bg-slate-900 text-white"
                                                : "bg-white text-slate-600 hover:bg-slate-50"
                                            }`}
                                        >
                                            API Key
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setAuthMethod("oauth"); setApiKeyInput(""); setOauthStatus({ type: "idle", message: "" }); clearMessages(); }}
                                            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${authMethod === "oauth"
                                                ? "bg-slate-900 text-white"
                                                : "bg-white text-slate-600 hover:bg-slate-50"
                                            }`}
                                        >
                                            ChatGPT Subscription
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* OAuth sign-in for OpenAI */}
                            {isOAuth && (
                                <div className="space-y-3">
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                                        <p className="text-xs text-emerald-800">
                                            <span className="font-semibold">Use your ChatGPT Plus/Pro/Team subscription.</span>{" "}
                                            Sign in with your OpenAI account to connect automatically — no API key needed.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleOpenAISignIn}
                                        disabled={oauthStatus.type === "saving"}
                                        className="w-full px-4 py-2.5 bg-[#10a37f] hover:bg-[#0e8c6b] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" /></svg>
                                        {oauthStatus.type === "saving" ? (oauthStatus.message || "Connecting...") : "Sign in with ChatGPT"}
                                    </button>

                                    {/* Remote access fallback */}
                                    <div className="border-t border-slate-100 pt-3">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Remote Access Fallback
                                        </label>
                                        <p className="text-[11px] text-slate-500 mb-2 leading-tight">
                                            If the sign-in redirect fails to load, copy the URL from the failed page and paste it below.
                                        </p>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={manualUrl}
                                                onChange={(e) => setManualUrl(e.target.value)}
                                                placeholder="http://localhost:1455/auth/callback?code=..."
                                                className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleManualPaste}
                                                disabled={!manualUrl.trim() || oauthStatus.type === "saving"}
                                                className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded hover:bg-slate-800 disabled:opacity-50"
                                            >
                                                Submit
                                            </button>
                                        </div>
                                    </div>

                                    {oauthStatus.type === "error" && (
                                        <p className="text-sm text-red-500">{oauthStatus.message}</p>
                                    )}
                                    {oauthStatus.type === "success" && (
                                        <p className="text-sm text-emerald-600">{oauthStatus.message}</p>
                                    )}
                                </div>
                            )}

                            {/* API Key input — hidden when OAuth is active */}
                            {!isOAuth && (
                                <>
                                    <InputField
                                        label="API Key"
                                        name="apiKey"
                                        type="password"
                                        placeholder={
                                            selectedProvider === "anthropic"
                                                ? "sk-ant-..."
                                                : selectedProvider === "openai"
                                                ? "sk-..."
                                                : "Enter your API key"
                                        }
                                        value={apiKeyInput}
                                        onChange={(e) => setApiKeyInput(e.target.value)}
                                        required
                                    />

                                    <ErrorMessage message={error} />
                                    <SuccessMessage message={success} />

                                    <SubmitButton
                                        loading={validating}
                                        label={
                                            connectedProviders.includes(selectedProvider)
                                                ? "Update Key"
                                                : "Validate & Save"
                                        }
                                        loadingLabel="Validating..."
                                    />
                                </>
                            )}
                        </form>

                        <div className="px-8 pb-6">
                            <button
                                type="button"
                                onClick={goNext}
                                disabled={connectedProviders.length === 0}
                                className={`w-full text-sm font-medium py-2.5 rounded-lg transition-colors ${
                                    connectedProviders.length > 0
                                        ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                                        : "bg-slate-100 text-slate-400 cursor-not-allowed"
                                }`}
                            >
                                Continue
                            </button>
                            {connectedProviders.length === 0 && (
                                <p className="text-xs text-slate-400 text-center mt-2">
                                    Connect at least one provider to continue
                                </p>
                            )}
                        </div>
                    </>
                )}

                {/* ── Step 3: Telegram ── */}
                {effectiveStep === 3 && (
                    <>
                        <StepHeader
                            stepLabel="Step 3"
                            title="Connect Telegram"
                            description="Connect a Telegram bot so your clients can talk to your agent. Create a bot via @BotFather, copy the token, then configure how it will be used."
                        />
                        <div className="px-8 py-6 space-y-5">
                            {/* Phase 1: Bot Token */}
                            {!hasTelegram ? (
                                <>
                                    <form onSubmit={handleTelegramSubmit} className="space-y-4">
                                        <InputField
                                            label="Bot API Token"
                                            name="botToken"
                                            type="password"
                                            placeholder="123456789:ABCdef..."
                                            required
                                            mono
                                        />
                                        <ErrorMessage message={error} />
                                        <SuccessMessage message={success} />
                                        <SubmitButton
                                            loading={pending}
                                            label="Connect Bot"
                                            loadingLabel="Validating..."
                                        />
                                    </form>
                                    <button
                                        type="button"
                                        onClick={goNext}
                                        className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        Skip for now
                                    </button>
                                </>
                            ) : (
                                <>
                                    {/* Bot connected badge */}
                                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Telegram bot connected!
                                    </div>

                                    {/* Phase 2: Bot Mode Configuration */}
                                    <div className="border-t border-slate-100 pt-5 space-y-4">
                                        <h3 className="text-sm font-semibold text-slate-900">How will this bot be used?</h3>

                                        {/* Mode selector */}
                                        <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                                            {(["private", "group", "both"] as const).map((mode) => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => { setBotMode(mode); clearMessages(); }}
                                                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                                                        botMode === mode
                                                            ? "bg-slate-900 text-white"
                                                            : "bg-white text-slate-600 hover:bg-slate-50"
                                                    }`}
                                                >
                                                    {mode === "private" ? "Private DM" : mode === "group" ? "Group Chat" : "Both"}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Private DM fields */}
                                        {(botMode === "private" || botMode === "both") && (
                                            <div className="space-y-3 bg-slate-50 rounded-lg p-4 border border-slate-200">
                                                <p className="text-xs font-semibold text-slate-700">Private Chat Access</p>
                                                <p className="text-[11px] text-slate-500 leading-tight">
                                                    Enter your Telegram User ID to pre-approve yourself. Send <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px] font-mono">/start</code> to <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px] font-mono">@userinfobot</code> on Telegram to find your ID.
                                                </p>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={telegramUserId}
                                                        onChange={(e) => setTelegramUserId(e.target.value)}
                                                        placeholder="e.g. 123456789"
                                                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900 placeholder:font-sans"
                                                    />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={telegramUserName}
                                                    onChange={(e) => setTelegramUserName(e.target.value)}
                                                    placeholder="Your name (optional)"
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900"
                                                />
                                            </div>
                                        )}

                                        {/* Group fields */}
                                        {(botMode === "group" || botMode === "both") && (
                                            <div className="space-y-3 bg-slate-50 rounded-lg p-4 border border-slate-200">
                                                <p className="text-xs font-semibold text-slate-700">Group Chat Access</p>
                                                <p className="text-[11px] text-slate-500 leading-tight">
                                                    Add the bot to your group first, then enter the Group Chat ID below. The bot will respond when @mentioned in the group.
                                                    To find the group ID, add <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px] font-mono">@RawDataBot</code> to the group — it will display the chat ID.
                                                </p>
                                                <input
                                                    type="text"
                                                    value={groupChatId}
                                                    onChange={(e) => setGroupChatId(e.target.value)}
                                                    placeholder="e.g. -1001234567890"
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900 placeholder:font-sans"
                                                />
                                                <input
                                                    type="text"
                                                    value={groupName}
                                                    onChange={(e) => setGroupName(e.target.value)}
                                                    placeholder="Group name (optional)"
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900"
                                                />
                                            </div>
                                        )}

                                        <ErrorMessage message={error} />
                                        <SuccessMessage message={success} />

                                        {/* Save config & continue */}
                                        <button
                                            type="button"
                                            onClick={handleTelegramConfigAndContinue}
                                            disabled={pending}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm disabled:opacity-60"
                                        >
                                            {pending ? "Saving..." : "Save & Continue"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                )}

                {/* ── Step 4: Plugin Credentials ── */}
                {effectiveStep === 4 && !skipPlugins && (
                    <>
                        <StepHeader
                            stepLabel="Step 4"
                            title="Configure Integrations"
                            description="Your administrator enabled these integrations for your workspace. Plugins let your agent interact with external systems. Enter your credentials below — all values are encrypted."
                        />
                        <div className="px-8 py-6 space-y-6">
                            {plugins.map((plugin) => (
                                <div
                                    key={plugin.pluginId}
                                    className="border border-slate-200 rounded-lg p-4"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-semibold text-slate-900">
                                            {plugin.pluginName}
                                        </h4>
                                        {configuredPlugins.has(plugin.pluginId) && (
                                            <span className="text-xs text-emerald-600 font-medium">
                                                Configured
                                            </span>
                                        )}
                                    </div>
                                    {plugin.credentialSchema.map((field) => (
                                        <form
                                            key={field.name}
                                            onSubmit={(e) =>
                                                handlePluginCredentialSubmit(e, plugin.pluginId)
                                            }
                                            className="space-y-3"
                                        >
                                            <input
                                                type="hidden"
                                                name="credentialName"
                                                value={field.name}
                                            />
                                            <div>
                                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                                    {field.label}
                                                </label>
                                                <input
                                                    type={
                                                        field.type === "secret"
                                                            ? "password"
                                                            : "text"
                                                    }
                                                    name="credentialValue"
                                                    placeholder={field.placeholder}
                                                    required={field.required !== false}
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900"
                                                />
                                                {field.helpText && (
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        {field.helpText}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={pending}
                                                className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                {pending ? "Saving..." : "Save"}
                                            </button>
                                        </form>
                                    ))}
                                </div>
                            ))}

                            <ErrorMessage message={error} />
                            <SuccessMessage message={success} />

                            <button
                                type="button"
                                onClick={goNext}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                            >
                                Continue
                            </button>
                            <button
                                type="button"
                                onClick={goNext}
                                className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                Skip for now
                            </button>
                        </div>
                    </>
                )}

                {/* ── Step 5: Create Agent ── */}
                {effectiveStep === 5 && (
                    <>
                        <StepHeader
                            stepLabel={skipPlugins ? "Step 4" : "Step 5"}
                            title="Create Your First Agent"
                            description="An agent is an AI persona for a specific role in your business. Give it a name, pick a model, and optionally describe its personality."
                        />
                        {hasAgent ? (
                            <div className="px-8 py-6">
                                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                                    <svg
                                        className="w-5 h-5 flex-shrink-0"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        strokeWidth={2}
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                    Agent already created!
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setStep(6)}
                                    className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                                >
                                    Continue
                                </button>
                            </div>
                        ) : (
                            <form
                                onSubmit={handleAgentSubmit}
                                className="px-8 py-6 space-y-4"
                            >
                                <InputField
                                    label="Agent Name"
                                    name="name"
                                    type="text"
                                    placeholder="e.g. Acme Support Bot"
                                    required
                                />

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                        Model
                                    </label>
                                    {availableProviders.length > 0 ? (
                                        <select
                                            name="modelId"
                                            defaultValue={
                                                availableProviders.flatMap((p) => p.models)[0]
                                                    ?.id ?? DEFAULT_MODEL_ID
                                            }
                                            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900 bg-white"
                                        >
                                            {availableProviders.map((provider) => (
                                                <optgroup
                                                    key={provider.id}
                                                    label={provider.name}
                                                >
                                                    {provider.models.map((model) => (
                                                        <option
                                                            key={model.id}
                                                            value={model.id}
                                                        >
                                                            {model.displayName} (
                                                            {model.category})
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                                            No providers connected. Go back to step 2 to add
                                            one.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                        System Prompt{" "}
                                        <span className="text-slate-400 font-normal">
                                            (optional)
                                        </span>
                                    </label>
                                    <textarea
                                        name="systemPrompt"
                                        rows={4}
                                        placeholder="Describe this agent's personality and role..."
                                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900 resize-y"
                                    />
                                </div>

                                <ErrorMessage message={error} />
                                <SubmitButton
                                    loading={pending}
                                    label="Create Agent"
                                    loadingLabel="Creating..."
                                    disabled={availableProviders.length === 0}
                                />
                            </form>
                        )}
                    </>
                )}

                {/* ── Step 6: Done ── */}
                {effectiveStep === 6 && (
                    <div className="px-8 py-10 text-center">
                        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                                stroke="currentColor"
                                className="w-7 h-7 text-emerald-600"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4.5 12.75l6 6 9-13.5"
                                />
                            </svg>
                        </div>
                        <h1 className="text-xl font-bold text-slate-900 mb-2">
                            You&apos;re all set!
                        </h1>
                        <p className="text-sm text-slate-500 mb-2">
                            Your workspace is configured and your first agent is ready.
                        </p>

                        <div className="text-left bg-slate-50 rounded-lg border border-slate-200 p-4 mb-6 space-y-2">
                            <SummaryItem
                                label="AI Providers"
                                value={`${connectedProviders.length} connected`}
                                done={connectedProviders.length > 0}
                            />
                            <SummaryItem
                                label="Telegram"
                                value={hasTelegram ? "Connected" : "Skipped"}
                                done={hasTelegram}
                            />
                            {!skipPlugins && (
                                <SummaryItem
                                    label="Integrations"
                                    value={`${configuredPlugins.size}/${plugins.length} configured`}
                                    done={configuredPlugins.size === plugins.length}
                                />
                            )}
                            <SummaryItem
                                label="Agent"
                                value={hasAgent ? "Created" : "Skipped"}
                                done={hasAgent}
                            />
                        </div>

                        <button
                            onClick={handleComplete}
                            disabled={pending}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm disabled:opacity-60"
                        >
                            {pending ? "Finishing..." : "Go to Dashboard"}
                        </button>
                        <p className="text-xs text-slate-400 mt-2">
                            You&apos;ll be signed out and back in for a fresh session.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Shared Sub-components ───────────────────────────────────────────────────

function StepHeader({
    stepLabel,
    title,
    description,
}: {
    stepLabel: string;
    title: string;
    description: string;
}) {
    return (
        <div className="px-8 pt-8 pb-6 border-b border-slate-100">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">
                {stepLabel}
            </p>
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-500 mt-1">{description}</p>
        </div>
    );
}

function InputField({
    label,
    name,
    type = "text",
    placeholder,
    required,
    minLength,
    mono,
    value,
    onChange,
}: {
    label: string;
    name: string;
    type?: string;
    placeholder?: string;
    required?: boolean;
    minLength?: number;
    mono?: boolean;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {label}
            </label>
            <input
                type={type}
                name={name}
                placeholder={placeholder}
                required={required}
                minLength={minLength}
                value={value}
                onChange={onChange}
                className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900 ${
                    mono ? "font-mono placeholder:font-sans" : ""
                }`}
            />
        </div>
    );
}

function SubmitButton({
    loading,
    label,
    loadingLabel,
    disabled,
}: {
    loading: boolean;
    label: string;
    loadingLabel?: string;
    disabled?: boolean;
}) {
    return (
        <button
            type="submit"
            disabled={loading || disabled}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm"
        >
            {loading ? (loadingLabel ?? "Saving...") : label}
        </button>
    );
}

function ErrorMessage({ message }: { message: string }) {
    if (!message) return null;
    return <p className="text-sm text-red-500">{message}</p>;
}

function SuccessMessage({ message }: { message: string }) {
    if (!message) return null;
    return <p className="text-sm text-emerald-600">{message}</p>;
}

function SummaryItem({
    label,
    value,
    done,
}: {
    label: string;
    value: string;
    done: boolean;
}) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{label}</span>
            <span
                className={`font-medium ${
                    done ? "text-emerald-600" : "text-slate-400"
                }`}
            >
                {value}
            </span>
        </div>
    );
}
