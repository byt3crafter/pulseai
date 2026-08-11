"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    SparklesIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ArrowLeftIcon,
} from "@heroicons/react/24/outline";
import { createAgentProfileAction, generateAgentConfigAction, getLiveModelsAction } from "../actions";
import { PROVIDERS, DEFAULT_MODEL_ID } from "../../../../utils/models";
import { PageHeader, Card, CardHeader, SettingRow, Toggle, InfoTip, SelectMenu } from "../../../../components/dashboard/ui";

const EXAMPLE_DESCRIPTIONS = [
    "A friendly sales assistant for Runstate, a logistics firm. It answers product questions, drafts quotes, and checks order status.",
    "A support agent that triages incoming tickets, resolves common FAQs, and escalates urgent issues to a human.",
    "An HR assistant that answers policy questions and helps new hires get set up in their first week.",
    "A finance analyst that summarizes weekly expense reports and flags anything unusual for review.",
];

type GeneratedConfig = { name: string; soul: string; model: string; department: string; tone: string };

/** Shared inline spinner for the two async buttons on this page. */
function Spinner() {
    return (
        <svg className="animate-spin motion-reduce:animate-none h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
    );
}

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

    // Live model lists pulled from each connected provider (so new releases
    // appear automatically); falls back to the static catalog per provider.
    type LiveModel = { id: string; provider: string; displayName: string; category: string };
    const [liveModels, setLiveModels] = useState<Record<string, LiveModel[]>>({});
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const entries = await Promise.all(
                connectedProviders.map(async (pid) => [pid, await getLiveModelsAction(pid)] as const)
            );
            if (!cancelled) setLiveModels(Object.fromEntries(entries));
        })();
        return () => { cancelled = true; };
    }, [connectedProviders]);

    // Settings
    const [selfConfigEnabled, setSelfConfigEnabled] = useState(true);

    const modelGroups = PROVIDERS.filter((p) => connectedProviders.includes(p.id)).map((provider) => ({
        label: provider.name,
        options: (liveModels[provider.id] ?? provider.models).map((m) => ({
            value: m.id,
            label: m.displayName,
            badge: m.category,
        })),
    }));

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
        <div className="p-4 sm:p-5 lg:p-6 max-w-3xl mx-auto">
            <Link href="/dashboard/agents" className="inline-flex items-center gap-1.5 text-sm text-pulse-muted hover:text-pulse-text transition-colors motion-reduce:transition-none mb-4">
                <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" /> Agents
            </Link>

            <PageHeader
                title="Create an agent"
                description="Describe what you need and we'll draft it — or fill in the details yourself. You can refine everything later."
            />

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                    <div role="alert" className="p-3 text-sm text-red-400 bg-red-500/10 rounded-lg border border-red-500/30 flex items-start gap-2">
                        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Step 1 — Describe */}
                <Card tint className="p-5 sm:p-6">
                    <div className="flex items-center gap-2.5">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                        <h2 className="text-sm font-semibold text-pulse-text">Describe your agent — we&apos;ll build it</h2>
                    </div>
                    <p className="text-xs text-pulse-muted mt-1 ml-8">Tell us what it should do. We&apos;ll draft a name, pick a model, and write the starting instructions.</p>

                    <textarea
                        aria-label="Describe your agent"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={describing}
                        placeholder="e.g. A friendly sales assistant for Runstate, a logistics firm. It answers product questions, drafts quotes, and checks order status."
                        className="mt-4 w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint resize-y disabled:bg-pulse-panel-alt disabled:text-pulse-faint"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-3.5">
                        {EXAMPLE_DESCRIPTIONS.map((ex) => (
                            <button key={ex} type="button" onClick={() => setDescription(ex)} title={ex}
                                className="text-xs px-3 py-1.5 rounded-full border border-pulse-border bg-pulse-panel/70 text-pulse-text-soft hover:border-indigo-500/50 hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors motion-reduce:transition-none cursor-pointer max-w-[240px] truncate outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                {ex.split(".")[0]}
                            </button>
                        ))}
                    </div>
                    {describeError && <p role="alert" className="text-xs text-red-400 mt-3">{describeError}</p>}
                    {!hasProviders && <p className="text-xs text-amber-400 mt-3">Connect an AI provider in Settings first to use AI build.</p>}
                    <button type="button" onClick={handleBuild} disabled={describing || !hasProviders}
                        className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel">
                        {describing ? (
                            <><Spinner />Building your agent…</>
                        ) : (
                            <><SparklesIcon className="w-4 h-4" aria-hidden="true" />Build my agent</>
                        )}
                    </button>
                    {generatedConfig && (
                        <div className="mt-4 flex items-start gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                            <CheckCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                            <div>
                                <p>We drafted a starting point below — review and tweak it, then create your agent.</p>
                                {generatedConfig.department && <p className="mt-1 text-green-400/90">Suggested department: <strong>{generatedConfig.department}</strong> — set this later under Departments.</p>}
                            </div>
                        </div>
                    )}
                </Card>

                {/* Step 2 — Review & edit */}
                <div ref={reviewRef} className="scroll-mt-4">
                    <Card className="p-5 sm:p-6 space-y-5">
                        <div className="flex items-center gap-2.5">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-pulse-border-strong text-white text-xs font-bold flex items-center justify-center">2</span>
                            <h2 className="text-sm font-semibold text-pulse-text">Review &amp; edit</h2>
                        </div>

                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <label htmlFor="agent-name" className="block text-sm font-medium text-pulse-text-soft">Agent name <span className="text-red-400">*</span></label>
                                <InfoTip text="A friendly, internal name for this agent — shown across the dashboard and to your team." />
                            </div>
                            <input id="agent-name" name="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme IT Support Bot"
                                className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint" />
                        </div>

                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <label htmlFor="agent-model" className="block text-sm font-medium text-pulse-text-soft">Model</label>
                                <InfoTip text="The AI model that powers this agent's replies. Only models from your connected providers are shown." />
                            </div>
                            {hasProviders ? (
                                <SelectMenu
                                    id="agent-model"
                                    name="modelId"
                                    ariaLabel="Model"
                                    value={modelId}
                                    onChange={setModelId}
                                    groups={modelGroups}
                                />
                            ) : (
                                <div className="p-3 text-sm text-amber-400 bg-amber-500/10 rounded-lg border border-amber-500/30 flex items-start gap-2">
                                    <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                    <span>No AI providers configured. <Link href="/dashboard/settings?tab=providers" className="underline font-medium">Add one in Settings</Link>.</span>
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <label htmlFor="agent-soul" className="block text-sm font-medium text-pulse-text-soft">Initial soul (system prompt)</label>
                                <InfoTip text="Seeds SOUL.md in the agent's workspace — its personality and instructions. You can keep editing it later in the workspace editor." />
                            </div>
                            <textarea id="agent-soul" name="systemPrompt" rows={8} value={soul} onChange={(e) => setSoul(e.target.value)}
                                placeholder={`You are a helpful IT support assistant for Acme Corp. You must always maintain a professional tone.\n\nWhen asked to troubleshoot, verify the employee's ID first...`}
                                className="w-full px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint resize-y" />
                        </div>
                    </Card>
                </div>

                {/* Settings */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader title="Agent settings" description="Optional capabilities you can enable now or refine later." />
                        <div className="divide-y divide-pulse-border-subtle">
                            <SettingRow
                                title="Self-improvement"
                                description="Let this agent edit its own profile files (Soul, Identity, Memory, etc.) when you chat with it."
                                control={
                                    <div className="flex items-center gap-2">
                                        <InfoTip text="Example: tell it 'be more concise' or 'remember our deploys run on Fridays' and it rewrites its own Soul/Memory. Off = only you edit these, via the tabs." />
                                        <Toggle checked={selfConfigEnabled} onChange={setSelfConfigEnabled} label="Toggle self-improvement" />
                                    </div>
                                }
                            />
                        </div>
                        <input type="hidden" name="selfConfigEnabled" value={selfConfigEnabled ? "true" : "false"} />
                    </Card>

                    <div className="flex items-start gap-3 bg-red-500/10 p-4 rounded-lg border border-red-500/30">
                        <input id="agent-sandbox" name="dockerSandboxEnabled" type="checkbox" value="true"
                            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-pulse-border text-indigo-600 focus:ring-indigo-600 focus:ring-offset-2 focus:ring-offset-pulse-panel cursor-pointer" />
                        <div className="text-sm">
                            <label htmlFor="agent-sandbox" className="font-medium text-pulse-text cursor-pointer">Enable raw code execution (Docker sandbox)</label>
                            <p className="text-pulse-muted mt-1"><span className="font-semibold text-red-400">Warning: </span>Allows this agent to write and execute Python/Bash logic on the fly in an isolated Alpine container. Use only if necessary.</p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end border-t border-pulse-border-subtle pt-5">
                    <Link href="/dashboard/agents" className="px-4 py-2 text-sm font-medium text-pulse-text-soft bg-pulse-panel border border-pulse-border rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none text-center cursor-pointer">Cancel</Link>
                    <button type="submit" disabled={loading || !hasProviders}
                        className="inline-flex items-center justify-center gap-1.5 px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors motion-reduce:transition-none">
                        {loading && <Spinner />}
                        {loading ? "Creating…" : "Create agent"}
                    </button>
                </div>
            </form>
        </div>
    );
}
