"use client";

import { useEffect, useRef, useState } from "react";
import {
    SparklesIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
    QuestionMarkCircleIcon,
    PlusIcon,
} from "@heroicons/react/24/outline";
import { createAgentProfileAction, generateAgentConfigAction } from "./actions";
import { PROVIDERS, DEFAULT_MODEL_ID } from "../../../utils/models";
import Tooltip from "./Tooltip";

const HELP_DISMISSED_KEY = "pulse.createAgentModal.helpDismissed";

const EXAMPLE_DESCRIPTIONS = [
    "A friendly sales assistant for Runstate, a logistics firm. It answers product questions, drafts quotes, and checks order status.",
    "A support agent that triages incoming tickets, resolves common FAQs, and escalates urgent issues to a human.",
    "An HR assistant that answers policy questions and helps new hires get set up in their first week.",
    "A finance analyst that summarizes weekly expense reports and flags anything unusual for review.",
];

type GeneratedConfig = { name: string; soul: string; model: string; department: string; tone: string };

export default function CreateAgentModal({ connectedProviders }: { connectedProviders: string[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const reviewSectionRef = useRef<HTMLDivElement>(null);

    const hasProviders = connectedProviders.length > 0;
    const defaultModelId = PROVIDERS.filter((p) => connectedProviders.includes(p.id)).flatMap((p) => p.models)[0]?.id ?? DEFAULT_MODEL_ID;

    // Guided-help callout (dismissible, remembered per-browser)
    const [showHelp, setShowHelp] = useState(true);

    // Step 1 — Describe
    const [description, setDescription] = useState("");
    const [describing, setDescribing] = useState(false);
    const [describeError, setDescribeError] = useState<string | null>(null);
    const [generatedConfig, setGeneratedConfig] = useState<GeneratedConfig | null>(null);

    // Step 2 — Review & edit (controlled so AI results can populate them)
    const [name, setName] = useState("");
    const [modelId, setModelId] = useState(defaultModelId);
    const [soul, setSoul] = useState("");

    // Settings
    const [selfConfigEnabled, setSelfConfigEnabled] = useState(true);

    useEffect(() => {
        if (!isOpen) return;
        try {
            setShowHelp(localStorage.getItem(HELP_DISMISSED_KEY) !== "1");
        } catch {
            setShowHelp(true);
        }
    }, [isOpen]);

    const dismissHelp = () => {
        setShowHelp(false);
        try {
            localStorage.setItem(HELP_DISMISSED_KEY, "1");
        } catch {
            // ignore storage failures (private browsing, etc.)
        }
    };

    const resetForm = () => {
        setError(null);
        setDescription("");
        setDescribeError(null);
        setGeneratedConfig(null);
        setName("");
        setModelId(defaultModelId);
        setSoul("");
        setSelfConfigEnabled(true);
    };

    const handleClose = () => {
        setIsOpen(false);
        resetForm();
    };

    const handleBuildAgent = async () => {
        setDescribeError(null);
        if (description.trim().length < 8) {
            setDescribeError("Describe the agent in a sentence or two so there's enough to work with.");
            return;
        }
        setDescribing(true);
        setGeneratedConfig(null);
        const res = await generateAgentConfigAction({ description });
        setDescribing(false);

        if (!res.success || !res.config) {
            setDescribeError(res.message || "Couldn't build the agent right now — please try again.");
            return;
        }

        setGeneratedConfig(res.config);
        setName(res.config.name);
        setModelId(res.config.model);
        setSoul(res.config.soul);

        // Give React a tick to render the populated review section before scrolling to it.
        requestAnimationFrame(() => {
            reviewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const result = await createAgentProfileAction(formData);

        if (!result.success && result.message) {
            setError(result.message);
            setLoading(false);
        } else {
            setLoading(false);
            handleClose();
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const modal = modalRef.current;
        if (!modal) return;
        const focusable = modal.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        first?.focus();
        const trap = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        };
        modal.addEventListener("keydown", trap);
        return () => modal.removeEventListener("keydown", trap);
    }, [isOpen]);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors motion-reduce:transition-none cursor-pointer text-sm shadow-sm"
            >
                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                Create Persona
            </button>

            {isOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="create-agent-modal-title"
                >
                    <div ref={modalRef} className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden transform transition-all my-8">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 id="create-agent-modal-title" className="text-lg font-semibold text-slate-900">Define AI Persona</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Describe what you need, or fill in the details yourself.</p>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setShowHelp((v) => !v)}
                                    aria-label="How this works"
                                    aria-pressed={showHelp}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors motion-reduce:transition-none cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                                >
                                    <QuestionMarkCircleIcon className="w-5 h-5" aria-hidden="true" />
                                </button>
                                <button
                                    onClick={handleClose}
                                    aria-label="Close"
                                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors motion-reduce:transition-none cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                                >
                                    <XMarkIcon className="w-5 h-5" aria-hidden="true" />
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {error && (
                                <div role="alert" className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100 flex items-start gap-2">
                                    <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {showHelp && (
                                <div className="relative rounded-lg border border-indigo-100 bg-indigo-50/70 p-4 pr-9 text-sm text-indigo-900">
                                    <button
                                        type="button"
                                        onClick={dismissHelp}
                                        aria-label="Dismiss help"
                                        className="absolute top-3 right-3 text-indigo-400 hover:text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500 rounded outline-none"
                                    >
                                        <XMarkIcon className="w-4 h-4" aria-hidden="true" />
                                    </button>
                                    <p className="font-medium mb-2">How this works</p>
                                    <ol className="space-y-1.5">
                                        <li className="flex gap-2">
                                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">1</span>
                                            <span><strong>Describe</strong> what you want the agent to do, in plain English.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">2</span>
                                            <span><strong>Review &amp; edit</strong> the name, model, and instructions it drafts for you.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">3</span>
                                            <span><strong>Create</strong> the agent — you can keep refining it any time afterward.</span>
                                        </li>
                                    </ol>
                                </div>
                            )}

                            {/* Step 1 — Describe */}
                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">1</span>
                                    <h4 className="text-sm font-semibold text-slate-900">Describe your agent — we&apos;ll build it</h4>
                                </div>
                                <p className="text-xs text-slate-500 mb-3 ml-7">
                                    Tell us what it should do. We&apos;ll draft a name, pick a model, and write the starting instructions.
                                </p>

                                <textarea
                                    id="create-agent-description"
                                    aria-label="Describe your agent"
                                    rows={3}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    disabled={describing}
                                    placeholder="e.g. A friendly sales assistant for Runstate, a logistics firm. It answers product questions, drafts quotes, and checks order status."
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-slate-900 resize-y disabled:bg-slate-50 disabled:text-slate-400"
                                />

                                <div className="flex flex-wrap gap-1.5 mt-2.5">
                                    {EXAMPLE_DESCRIPTIONS.map((example) => (
                                        <button
                                            key={example}
                                            type="button"
                                            onClick={() => setDescription(example)}
                                            title={example}
                                            className="text-xs px-2.5 py-1 rounded-full border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 transition-colors motion-reduce:transition-none cursor-pointer max-w-[220px] truncate focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
                                        >
                                            {example.split(".")[0]}
                                        </button>
                                    ))}
                                </div>

                                {describeError && (
                                    <p role="alert" className="text-xs text-red-600 mt-2.5">{describeError}</p>
                                )}

                                {!hasProviders && (
                                    <p className="text-xs text-amber-700 mt-2.5">
                                        Connect an AI provider in Settings first to use AI build.
                                    </p>
                                )}

                                <div className="mt-3 flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleBuildAgent}
                                        disabled={describing || !hasProviders}
                                        className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer"
                                    >
                                        {describing ? (
                                            <>
                                                <svg className="animate-spin motion-reduce:animate-none h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                                </svg>
                                                Building your agent…
                                            </>
                                        ) : (
                                            <>
                                                <SparklesIcon className="w-4 h-4" aria-hidden="true" />
                                                Build my agent
                                            </>
                                        )}
                                    </button>
                                </div>

                                {generatedConfig && (
                                    <div className="mt-3 flex items-start gap-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg p-2.5">
                                        <CheckCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                        <div>
                                            <p>We drafted a starting point below — review and tweak it, then create your agent.</p>
                                            {generatedConfig.department && (
                                                <p className="mt-1 text-green-600">
                                                    Suggested department: <strong>{generatedConfig.department}</strong> — set this later under Departments.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3" aria-hidden="true">
                                <div className="flex-1 h-px bg-slate-200" />
                                <span className="text-xs text-slate-400 font-medium">or fill in manually</span>
                                <div className="flex-1 h-px bg-slate-200" />
                            </div>

                            {/* Step 2 — Review & edit */}
                            <div ref={reviewSectionRef} className="space-y-5 scroll-mt-4">
                                <div className="flex items-center gap-2">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-300 text-white text-[11px] font-bold flex items-center justify-center">2</span>
                                    <h4 className="text-sm font-semibold text-slate-900">Review &amp; edit</h4>
                                </div>

                                <div>
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <label htmlFor="create-agent-name" className="block text-sm font-medium text-slate-700">
                                            Agent Name <span className="text-red-500">*</span>
                                        </label>
                                        <Tooltip text="A friendly, internal name for this agent — shown across the dashboard and to your team." />
                                    </div>
                                    <input
                                        type="text"
                                        id="create-agent-name"
                                        name="name"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g. Acme IT Support Bot"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-slate-900"
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <label htmlFor="create-agent-modelId" className="block text-sm font-medium text-slate-700">
                                            Model
                                        </label>
                                        <Tooltip text="The AI model that powers this agent's replies. Only models from your connected providers are shown." />
                                    </div>
                                    {hasProviders ? (
                                        <select
                                            id="create-agent-modelId"
                                            name="modelId"
                                            value={modelId}
                                            onChange={(e) => setModelId(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-slate-900 bg-white"
                                        >
                                            {PROVIDERS.filter((p) => connectedProviders.includes(p.id)).map((provider) => (
                                                <optgroup key={provider.id} label={provider.name}>
                                                    {provider.models.map((model) => (
                                                        <option key={model.id} value={model.id}>
                                                            {model.displayName} ({model.category})
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="p-3 text-sm text-amber-700 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2">
                                            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                            <span>No AI providers configured. Add an API key in Settings first.</span>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <label htmlFor="create-agent-systemPrompt" className="block text-sm font-medium text-slate-700">
                                            Initial Soul (System Prompt)
                                        </label>
                                        <Tooltip text="Seeds SOUL.md in the agent's workspace — its personality and instructions. You can keep editing it later in the workspace editor." />
                                    </div>
                                    <textarea
                                        id="create-agent-systemPrompt"
                                        name="systemPrompt"
                                        rows={6}
                                        value={soul}
                                        onChange={(e) => setSoul(e.target.value)}
                                        placeholder={`You are a helpful IT support assistant for Acme Corp. You must always maintain a professional tone.\n\nWhen asked to troubleshoot, verify the employee's ID first...`}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-slate-900 resize-y"
                                    />
                                </div>
                            </div>

                            {/* Settings */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <div>
                                            <label htmlFor="create-agent-selfconfig-toggle" className="text-sm font-medium text-slate-900 block">
                                                Self-improvement
                                            </label>
                                            <p className="text-xs text-slate-500 mt-0.5">On by default — the agent can refine its own instructions as you chat with it.</p>
                                        </div>
                                        <Tooltip text="Lets this agent refine its own instructions and knowledge when you chat with it." />
                                    </div>
                                    <button
                                        id="create-agent-selfconfig-toggle"
                                        type="button"
                                        role="switch"
                                        aria-checked={selfConfigEnabled}
                                        onClick={() => setSelfConfigEnabled((v) => !v)}
                                        className={`relative inline-flex flex-shrink-0 h-6 w-11 items-center rounded-full transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${selfConfigEnabled ? "bg-indigo-600" : "bg-slate-300"}`}
                                    >
                                        <span className="sr-only">Toggle self-improvement</span>
                                        <span
                                            aria-hidden="true"
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${selfConfigEnabled ? "translate-x-6" : "translate-x-1"}`}
                                        />
                                    </button>
                                    <input type="hidden" name="selfConfigEnabled" value={selfConfigEnabled ? "true" : "false"} />
                                </div>

                                <div className="flex items-start bg-red-50/50 p-4 rounded-lg border border-red-100">
                                    <div className="flex items-center h-5">
                                        <input
                                            id="create-agent-dockerSandboxEnabled"
                                            name="dockerSandboxEnabled"
                                            type="checkbox"
                                            value="true"
                                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-2"
                                        />
                                    </div>
                                    <div className="ml-3 text-sm">
                                        <label htmlFor="create-agent-dockerSandboxEnabled" className="font-medium text-slate-900">
                                            Enable Raw Code Execution (Docker Sandbox)
                                        </label>
                                        <p className="text-slate-500 mt-1">
                                            <span className="font-semibold text-red-600">WARNING: </span>
                                            Allows this agent to write and execute python/bash logic on the fly in an isolated Alpine container. Use only if necessary.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Step 3 — Create */}
                            <div className="pt-4 flex gap-3 justify-end border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors motion-reduce:transition-none cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || !hasProviders}
                                    className="inline-flex items-center gap-1.5 px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none cursor-pointer"
                                >
                                    {loading && (
                                        <svg className="animate-spin motion-reduce:animate-none h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                        </svg>
                                    )}
                                    {loading ? "Creating…" : "Create Persona"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
