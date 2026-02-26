"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { PROVIDERS, DEFAULT_MODEL_ID } from "../../utils/models";
import {
    changePasswordOnboardingAction,
    validateProviderKeyOnboardingAction,
    saveProviderKeyOnboardingAction,
    saveTelegramOnboardingAction,
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
                            description="Connect a Telegram bot so your clients can talk to your agent. Create a bot via @BotFather, copy the token, paste it here."
                        />
                        {hasTelegram ? (
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
                                    Telegram bot connected!
                                </div>
                                <button
                                    type="button"
                                    onClick={goNext}
                                    className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                                >
                                    Continue
                                </button>
                            </div>
                        ) : (
                            <>
                                <form
                                    onSubmit={handleTelegramSubmit}
                                    className="px-8 py-6 space-y-4"
                                >
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
                                        label="Connect & Continue"
                                        loadingLabel="Validating..."
                                    />
                                </form>
                                <div className="px-8 pb-6">
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
