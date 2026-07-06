"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    SparklesIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ArrowLeftIcon,
} from "@heroicons/react/24/outline";
import { createAgentProfileAction, generateAgentConfigAction } from "../actions";
import { PROVIDERS, DEFAULT_MODEL_ID } from "../../../../utils/models";
import Tooltip from "../Tooltip";

const EXAMPLE_DESCRIPTIONS = [
    "A friendly sales assistant for Runstate, a logistics firm. It answers product questions, drafts quotes, and checks order status.",
    "A support agent that triages incoming tickets, resolves common FAQs, and escalates urgent issues to a human.",
    "An HR assistant that answers policy questions and helps new hires get set up in their first week.",
    "A finance analyst that summarizes weekly expense reports and flags anything unusual for review.",
];

type GeneratedConfig = { name: string; soul: string; model: string; department: string; tone: string };

export default function NewAgentClient({ connectedProviders }: { connectedProviders: string[] }) {
    const router = useRouter();
    const hasProviders = connectedProviders.length > 0;
    const defaultModelId = PROVIDERS.filter((p) => connectedProviders.includes(p.id)).flatMap((p) => p.models)[0]?.id ?? DEFAULT_MODEL_ID;
    const reviewRef = useRef<HTMLDivElement>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Step 1 — Describe
    const [description, setDescription] = useState("");
    const [describing, setDescribing] = useState(false);
    const [describeError, setDescribeError] = useState<string | null>(null);
    const [generatedConfig, setGeneratedConfig] = useState<GeneratedConfig | null>(null);

    // Step 2 — Review & edit (controlled)
    const [name, setName] = useState("");
    const [modelId, setModelId] = useState(defaultModelId);
    const [soul, setSoul] = useState("");

    // Settings
    const [selfConfigEnabled, setSelfConfigEnabled] = useState(true);

    const handleBuild = async () => {
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
        requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const result = await createAgentProfileAction(new FormData(e.currentTarget));
        if (!result.success && result.message) {
            setError(result.message);
            setLoading(false);
        } else {
            router.push("/dashboard/agents");
            router.refresh();
        }
    };

    return (
        <div className="p-8 max-w-3xl mx-auto">
            <Link href="/dashboard/agents" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4">
                <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" /> Agents
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">Create an agent</h1>
            <p className="text-sm text-slate-500 mt-1">Describe what you need and we&apos;ll draft it — or fill in the details yourself. You can refine everything later.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-8">
                {error && (
                    <div role="alert" className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100 flex items-start gap-2">
                        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Step 1 — Describe */}
                <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-6">
                    <div className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                        <h2 className="text-base font-semibold text-slate-900">Describe your agent — we&apos;ll build it</h2>
                    </div>
                    <p className="text-sm text-slate-500 mt-1 ml-8">Tell us what it should do. We&apos;ll draft a name, pick a model, and write the starting instructions.</p>

                    <textarea
                        aria-label="Describe your agent"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={describing}
                        placeholder="e.g. A friendly sales assistant for Runstate, a logistics firm. It answers product questions, drafts quotes, and checks order status."
                        className="mt-4 w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-slate-900 resize-y disabled:bg-slate-50 disabled:text-slate-400"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {EXAMPLE_DESCRIPTIONS.map((ex) => (
                            <button key={ex} type="button" onClick={() => setDescription(ex)} title={ex}
                                className="text-xs px-2.5 py-1 rounded-full border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 transition-colors motion-reduce:transition-none cursor-pointer max-w-[240px] truncate focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none">
                                {ex.split(".")[0]}
                            </button>
                        ))}
                    </div>
                    {describeError && <p role="alert" className="text-xs text-red-600 mt-3">{describeError}</p>}
                    {!hasProviders && <p className="text-xs text-amber-700 mt-3">Connect an AI provider in Settings first to use AI build.</p>}
                    <button type="button" onClick={handleBuild} disabled={describing || !hasProviders}
                        className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none">
                        {describing ? (
                            <><svg className="animate-spin motion-reduce:animate-none h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>Building your agent…</>
                        ) : (
                            <><SparklesIcon className="w-4 h-4" aria-hidden="true" />Build my agent</>
                        )}
                    </button>
                    {generatedConfig && (
                        <div className="mt-4 flex items-start gap-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg p-3">
                            <CheckCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                            <div>
                                <p>We drafted a starting point below — review and tweak it, then create your agent.</p>
                                {generatedConfig.department && <p className="mt-1 text-green-600">Suggested department: <strong>{generatedConfig.department}</strong> — set this later under Departments.</p>}
                            </div>
                        </div>
                    )}
                </section>

                {/* Step 2 — Review & edit */}
                <section ref={reviewRef} className="space-y-5 scroll-mt-4">
                    <div className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-300 text-white text-xs font-bold flex items-center justify-center">2</span>
                        <h2 className="text-base font-semibold text-slate-900">Review &amp; edit</h2>
                    </div>

                    <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <label htmlFor="agent-name" className="block text-sm font-medium text-slate-700">Agent Name <span className="text-red-500">*</span></label>
                            <Tooltip text="A friendly, internal name for this agent — shown across the dashboard and to your team." />
                        </div>
                        <input id="agent-name" name="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme IT Support Bot"
                            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-slate-900" />
                    </div>

                    <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <label htmlFor="agent-model" className="block text-sm font-medium text-slate-700">Model</label>
                            <Tooltip text="The AI model that powers this agent's replies. Only models from your connected providers are shown." />
                        </div>
                        {hasProviders ? (
                            <select id="agent-model" name="modelId" value={modelId} onChange={(e) => setModelId(e.target.value)}
                                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-slate-900 bg-white">
                                {PROVIDERS.filter((p) => connectedProviders.includes(p.id)).map((provider) => (
                                    <optgroup key={provider.id} label={provider.name}>
                                        {provider.models.map((m) => <option key={m.id} value={m.id}>{m.displayName} ({m.category})</option>)}
                                    </optgroup>
                                ))}
                            </select>
                        ) : (
                            <div className="p-3 text-sm text-amber-700 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2">
                                <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                <span>No AI providers configured. <Link href="/dashboard/settings?tab=providers" className="underline font-medium">Add one in Settings</Link>.</span>
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <label htmlFor="agent-soul" className="block text-sm font-medium text-slate-700">Initial Soul (System Prompt)</label>
                            <Tooltip text="Seeds SOUL.md in the agent's workspace — its personality and instructions. You can keep editing it later in the workspace editor." />
                        </div>
                        <textarea id="agent-soul" name="systemPrompt" rows={8} value={soul} onChange={(e) => setSoul(e.target.value)}
                            placeholder={`You are a helpful IT support assistant for Acme Corp. You must always maintain a professional tone.\n\nWhen asked to troubleshoot, verify the employee's ID first...`}
                            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-slate-900 resize-y" />
                    </div>
                </section>

                {/* Settings */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <div>
                                <label htmlFor="agent-selfconfig" className="text-sm font-medium text-slate-900 block">Self-improvement</label>
                                <p className="text-xs text-slate-500 mt-0.5">On by default — the agent can refine its own instructions as you chat with it.</p>
                            </div>
                            <Tooltip text="Lets this agent refine its own instructions and knowledge when you chat with it." />
                        </div>
                        <button id="agent-selfconfig" type="button" role="switch" aria-checked={selfConfigEnabled} onClick={() => setSelfConfigEnabled((v) => !v)}
                            className={`relative inline-flex flex-shrink-0 h-6 w-11 items-center rounded-full transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${selfConfigEnabled ? "bg-indigo-600" : "bg-slate-300"}`}>
                            <span className="sr-only">Toggle self-improvement</span>
                            <span aria-hidden="true" className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${selfConfigEnabled ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                        <input type="hidden" name="selfConfigEnabled" value={selfConfigEnabled ? "true" : "false"} />
                    </div>

                    <div className="flex items-start bg-red-50/50 p-4 rounded-lg border border-red-100">
                        <div className="flex items-center h-5">
                            <input id="agent-sandbox" name="dockerSandboxEnabled" type="checkbox" value="true" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-2 cursor-pointer" />
                        </div>
                        <div className="ml-3 text-sm">
                            <label htmlFor="agent-sandbox" className="font-medium text-slate-900 cursor-pointer">Enable Raw Code Execution (Docker Sandbox)</label>
                            <p className="text-slate-500 mt-1"><span className="font-semibold text-red-600">WARNING: </span>Allows this agent to write and execute python/bash logic on the fly in an isolated Alpine container. Use only if necessary.</p>
                        </div>
                    </div>
                </section>

                {/* Actions */}
                <div className="flex gap-3 justify-end border-t border-slate-100 pt-5">
                    <Link href="/dashboard/agents" className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors motion-reduce:transition-none">Cancel</Link>
                    <button type="submit" disabled={loading || !hasProviders}
                        className="inline-flex items-center gap-1.5 px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors motion-reduce:transition-none">
                        {loading && <svg className="animate-spin motion-reduce:animate-none h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>}
                        {loading ? "Creating…" : "Create Agent"}
                    </button>
                </div>
            </form>
        </div>
    );
}
