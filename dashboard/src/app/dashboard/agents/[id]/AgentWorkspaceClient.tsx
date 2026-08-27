"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    updateWorkspaceFileAction,
    updateAgentModelAction,
    updateAgentSmartRoutingAction,
    getRevisionsAction,
    restoreRevisionAction,
    deleteAgentAction,
    updateSelfConfigAction,
} from "./actions";
import { getLiveModelsAction } from "../actions";
import type { AgentDetailStats } from "../../../../utils/run-queries";
import { formatDuration, relativeTime } from "../../../../components/dashboard/run-ui";
import { PROVIDERS, getModelDisplayName, getProviderName } from "../../../../utils/models";
import ToolPolicyEditor from "./ToolPolicyEditor";
import SandboxConfigEditor from "./SandboxConfigEditor";
import HeartbeatEditor from "./HeartbeatEditor";
import StandingOrdersEditor from "./StandingOrdersEditor";
import SkillsEditor from "./SkillsEditor";
import EmailConfigEditor from "./EmailConfigEditor";
import TelegramConfigEditor from "./TelegramConfigEditor";
import AgentIdentityEditor from "./AgentIdentityEditor";
import { InfoTip, SelectMenu } from "../../../../components/dashboard/ui";
import AgentAvatar from "../../../../components/dashboard/AgentAvatar";

interface AgentData {
    id: string;
    name: string;
    title: string | null;
    avatar: string | null;
    reasoningEffort: string | null;
    progressVerbosity?: string | null;
    roiHourlyRate?: string | null;
    modelId: string;
    smartRouting?: boolean;
    fastModelId?: string | null;
    dockerSandboxEnabled: boolean;
    selfConfigEnabled: boolean;
    hasWorkspace: boolean;
    toolPolicy: any;
    sandboxConfig: any;
    heartbeatConfig: any;
    skillConfig: any;
    emailConfig: any;
}

interface Revision {
    id: string;
    fileName: string;
    changeSummary: string | null;
    revisionNumber: number;
    createdAt: string;
}

interface Props {
    agent: AgentData;
    soulContent: string;
    identityContent: string;
    memoryContent: string;
    heartbeatContent: string;
    toolsGuidanceContent: string;
    userPrefsContent: string;
    bootstrapContent: string;
    agentsContent: string;
    soulRevisionCount: number;
    identityRevisionCount: number;
    memoryRevisionCount: number;
    heartbeatRevisionCount: number;
    toolsGuidanceRevisionCount: number;
    userPrefsRevisionCount: number;
    bootstrapRevisionCount: number;
    agentsRevisionCount: number;
    activeProviders: string[];
    defaultSkills: string[];
    hasTenantEmail: boolean;
    telegramConnected: boolean;
    telegramBotUsername: string | null;
    stats: AgentDetailStats;
}

// Grouped left section-nav (Clerk/Stripe/Linear settings pattern). Section
// `id`s are unchanged from the old flat tab strip — only the nav presentation
// + layout changed, so every `activeTab === "..."` content block below still
// matches unmodified.
const NAV_GROUPS: { label: string; items: { id: string; label: string }[] }[] = [
    {
        label: "General",
        items: [{ id: "config", label: "Profile" }],
    },
    {
        label: "Persona & Memory",
        items: [
            { id: "soul", label: "Soul" },
            { id: "identity", label: "Identity" },
            { id: "memory", label: "Memory" },
            { id: "heartbeat", label: "Heartbeat" },
            { id: "user-prefs", label: "User" },
            { id: "bootstrap", label: "Bootstrap" },
            { id: "agents", label: "Agents" },
        ],
    },
    {
        label: "Capabilities",
        items: [
            { id: "tools-guidance", label: "Tools" },
            { id: "skills", label: "Skills" },
            { id: "tool-policy", label: "Tool Policy" },
            { id: "sandbox", label: "Sandbox" },
        ],
    },
    {
        label: "Automation",
        items: [
            { id: "standing-orders", label: "Standing Orders" },
        ],
    },
    {
        label: "Channels",
        items: [
            { id: "email", label: "Email" },
            { id: "telegram", label: "Telegram" },
        ],
    },
    {
        label: "History",
        items: [{ id: "revisions", label: "Revisions" }],
    },
];

export default function AgentWorkspaceClient({
    agent,
    soulContent,
    identityContent,
    memoryContent,
    heartbeatContent,
    toolsGuidanceContent,
    userPrefsContent,
    bootstrapContent,
    agentsContent,
    soulRevisionCount,
    identityRevisionCount,
    memoryRevisionCount,
    heartbeatRevisionCount,
    toolsGuidanceRevisionCount,
    userPrefsRevisionCount,
    bootstrapRevisionCount,
    agentsRevisionCount,
    activeProviders,
    defaultSkills,
    hasTenantEmail,
    telegramConnected,
    telegramBotUsername,
    stats,
}: Props) {
    const [activeTab, setActiveTab] = useState("config");
    const router = useRouter();

    const revisionsTotal =
        soulRevisionCount + identityRevisionCount + memoryRevisionCount + heartbeatRevisionCount +
        toolsGuidanceRevisionCount + userPrefsRevisionCount + bootstrapRevisionCount + agentsRevisionCount;

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-[1060px]">
            {/* Header */}
            <div className="mb-6">
                <Link
                    href="/dashboard/agents"
                    className="text-sm text-pulse-muted hover:text-pulse-text-soft transition-colors motion-reduce:transition-none mb-2 inline-block cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                >
                    &larr; Back to Agents
                </Link>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                        <AgentAvatar name={agent.name} avatar={agent.avatar} size="lg" />
                        <div className="min-w-0">
                            <h1 className="text-2xl font-bold text-pulse-text truncate">{agent.name}</h1>
                            {agent.title && (
                                <p className="text-sm text-pulse-muted truncate">{agent.title}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <span className="text-xs font-mono text-pulse-faint">ID: {agent.id.slice(0, 8)}...</span>
                                <span className="px-2 py-0.5 bg-pulse-tint text-pulse-accent-hi text-xs font-medium rounded-full">
                                    {getModelDisplayName(agent.modelId)}
                                </span>
                                {agent.dockerSandboxEnabled && (
                                    <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs font-semibold rounded-full">
                                        Sandbox
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Live employee status */}
                    <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                        {stats.running > 0 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-400">
                                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Working
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-pulse-panel-alt px-2.5 py-1 text-xs font-medium text-pulse-muted">
                                Idle
                            </span>
                        )}
                        {stats.lastActiveAt && (
                            <span className="text-xs text-pulse-faint">Last active {relativeTime(stats.lastActiveAt)}</span>
                        )}
                    </div>
                </div>

                {stats.running > 0 && stats.currentTask && (
                    <p className="mt-3 truncate text-sm text-pulse-soft">
                        <span className="text-pulse-faint">Current task:</span> {stats.currentTask}
                    </p>
                )}

                {/* Live workload stats from agent_runs */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <MiniStat label="Tasks today" value={String(stats.tasksToday)} />
                    <MiniStat label="Tasks (7d)" value={String(stats.tasks7d)} />
                    <MiniStat
                        label="Success (7d)"
                        value={stats.successRate7d == null ? "—" : `${Math.round(stats.successRate7d * 100)}%`}
                        tone={stats.successRate7d == null ? undefined : stats.successRate7d >= 0.9 ? "good" : stats.successRate7d >= 0.6 ? "warn" : "bad"}
                    />
                    <MiniStat label="Avg time" value={stats.avgDurationMs ? formatDuration(stats.avgDurationMs) : "—"} />
                    <MiniStat label="Tokens today" value={stats.tokensToday.toLocaleString()} />
                    <MiniStat label="Cost today" value={`$${stats.costTodayUsd.toFixed(2)}`} />
                </div>
            </div>

            {/* Mobile section picker — every section stays reachable without a
                horizontal-scroll trap; grouped to mirror the desktop rail. */}
            <div className="md:hidden mb-6">
                <SelectMenu
                    id="agent-section"
                    ariaLabel="Agent section"
                    value={activeTab}
                    onChange={setActiveTab}
                    groups={NAV_GROUPS.map((group) => ({
                        label: group.label,
                        options: group.items.map((item) => ({
                            value: item.id,
                            label: item.label,
                            badge: item.id === "revisions" && revisionsTotal > 0 ? String(revisionsTotal) : undefined,
                        })),
                    }))}
                />
            </div>

            <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* Desktop section-nav rail */}
                <nav
                    aria-label="Agent sections"
                    className="hidden md:block w-56 flex-shrink-0 md:sticky md:top-6 self-start space-y-5"
                >
                    {NAV_GROUPS.map((group) => (
                        <div key={group.label}>
                            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-pulse-faint">
                                {group.label}
                            </p>
                            <div className="space-y-0.5">
                                {group.items.map((item) => {
                                    const isActive = activeTab === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => setActiveTab(item.id)}
                                            aria-current={isActive ? "page" : undefined}
                                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isActive
                                                ? "bg-pulse-tint text-pulse-accent-hi"
                                                : "text-pulse-muted hover:text-pulse-text hover:bg-pulse-hover"
                                                }`}
                                        >
                                            <span className="truncate">{item.label}</span>
                                            {item.id === "revisions" && revisionsTotal > 0 && (
                                                <span className="text-xs text-pulse-faint flex-shrink-0">{revisionsTotal}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Section content */}
                <div className="flex-1 min-w-0">
                    {activeTab === "soul" && (
                        <FileEditor
                            agentId={agent.id}
                            fileName="SOUL.md"
                            initialContent={soulContent}
                            title="Soul"
                            description="Define your agent's personality, behaviors, and communication style. This is the core of who your agent is."
                        />
                    )}
                    {activeTab === "identity" && (
                        <FileEditor
                            agentId={agent.id}
                            fileName="IDENTITY.md"
                            initialContent={identityContent}
                            title="Identity"
                            description="Set your agent's name, role, and background context. This frames how the agent introduces itself."
                        />
                    )}
                    {activeTab === "memory" && (
                        <FileEditor
                            agentId={agent.id}
                            fileName="MEMORY.md"
                            initialContent={memoryContent}
                            title="Memory"
                            description="The agent stores important facts and recalls them in future conversations."
                            infoTip="Example: tell it your database server name once; it can recall it next week. Semantic recall needs an embedding key (Settings → Memory)."
                        />
                    )}
                    {activeTab === "heartbeat" && (
                        <div className="space-y-6">
                            <HeartbeatEditor agentId={agent.id} initialConfig={agent.heartbeatConfig} />
                            <FileEditor
                                agentId={agent.id}
                                fileName="HEARTBEAT.md"
                                initialContent={heartbeatContent}
                                title="Heartbeat Prompt"
                                description="Instructions dictating how the agent should behave when triggered by the automated pacemaker scheduler."
                            />
                        </div>
                    )}
                    {activeTab === "standing-orders" && (
                        <StandingOrdersEditor agentId={agent.id} />
                    )}
                    {activeTab === "tools-guidance" && (
                        <FileEditor
                            agentId={agent.id}
                            fileName="TOOLS.md"
                            initialContent={toolsGuidanceContent}
                            title="Tools Guidance"
                            description="User-written notes on how the agent should use specific tools and integrations. This does NOT control which tools are available — use the Tool Policy tab for that."
                        />
                    )}
                    {activeTab === "user-prefs" && (
                        <FileEditor
                            agentId={agent.id}
                            fileName="USER.md"
                            initialContent={userPrefsContent}
                            title="User Preferences"
                            description="Tell the agent about yourself — who you are, how to address you, preferred formats, language, timezone, or any other context the agent should know."
                        />
                    )}
                    {activeTab === "bootstrap" && (
                        <FileEditor
                            agentId={agent.id}
                            fileName="BOOTSTRAP.md"
                            initialContent={bootstrapContent}
                            title="Bootstrap"
                            description="First-run onboarding script. Guides the agent through its initial 'who am I?' conversation. The agent deletes this file after onboarding is complete."
                        />
                    )}
                    {activeTab === "agents" && (
                        <FileEditor
                            agentId={agent.id}
                            fileName="AGENTS.md"
                            initialContent={agentsContent}
                            title="Agents"
                            description="Workspace operating manual. Tells the agent how to use its files, manage memory, handle safety, and behave in different contexts."
                        />
                    )}
                    {activeTab === "skills" && (
                        <SkillsEditor agentId={agent.id} skillConfig={agent.skillConfig ?? {}} defaultSkills={defaultSkills} />
                    )}
                    {activeTab === "email" && (
                        <EmailConfigEditor agentId={agent.id} emailConfig={agent.emailConfig ?? {}} hasTenantEmail={hasTenantEmail} />
                    )}
                    {activeTab === "telegram" && (
                        <TelegramConfigEditor
                            agentId={agent.id}
                            agentName={agent.name}
                            connected={telegramConnected}
                            botUsername={telegramBotUsername}
                        />
                    )}
                    {activeTab === "tool-policy" && (
                        <ToolPolicyEditor agentId={agent.id} initialPolicy={agent.toolPolicy} />
                    )}
                    {activeTab === "sandbox" && (
                        <SandboxConfigEditor agentId={agent.id} initialConfig={agent.sandboxConfig} />
                    )}
                    {activeTab === "config" && (
                        <ConfigTab agent={agent} activeProviders={activeProviders} />
                    )}
                    {activeTab === "revisions" && (
                        <RevisionsTab agentId={agent.id} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── File Editor ─────────────────────────────────────────────────────────────

function FileEditor({
    agentId,
    fileName,
    initialContent,
    title,
    description,
    infoTip,
}: {
    agentId: string;
    fileName: string;
    initialContent: string;
    title: string;
    description: string;
    infoTip?: string;
}) {
    const [content, setContent] = useState(initialContent);
    const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });
    const router = useRouter();

    const handleSave = async () => {
        setStatus({ type: "saving", message: "" });
        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("fileName", fileName);
        fd.set("content", content);
        fd.set("summary", `Edited ${fileName} via dashboard`);

        const result = await updateWorkspaceFileAction(fd);
        setStatus({
            type: result.success ? "success" : "error",
            message: result.message ?? "",
        });
        if (result.success) {
            router.refresh();
        }
    };

    const isDirty = content !== initialContent;

    return (
        <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-pulse-border-subtle">
                <div className="flex items-center gap-1.5">
                    <h2 className="text-sm font-semibold text-pulse-text">{title}</h2>
                    {infoTip && <InfoTip text={infoTip} />}
                </div>
                <p className="text-xs text-pulse-faint mt-0.5">{description}</p>
            </div>
            <div className="p-6">
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={18}
                    className="w-full px-4 py-3 border border-pulse-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint resize-y leading-relaxed"
                    placeholder={`Write your ${title.toLowerCase()} content in Markdown...`}
                />

                <div className="mt-4 flex items-center justify-between">
                    <div>
                        {status.type !== "idle" && (
                            <p className={`text-sm ${status.type === "success" ? "text-green-400" : status.type === "error" ? "text-red-400" : "text-pulse-muted"}`}>
                                {status.type === "saving" ? "Saving..." : status.message}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || status.type === "saving"}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                        Save {fileName}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Config Tab ──────────────────────────────────────────────────────────────

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
    const toneClass = tone === "good" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : tone === "bad" ? "text-red-500" : "text-pulse-text";
    return (
        <div className="rounded-lg border border-pulse-border-subtle bg-pulse-panel px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-pulse-faint">{label}</p>
            <p className={`mt-0.5 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
        </div>
    );
}

function ConfigTab({ agent, activeProviders }: { agent: AgentData; activeProviders: string[] }) {
    const [modelId, setModelId] = useState(agent.modelId);
    const [smartRouting, setSmartRouting] = useState(agent.smartRouting === true);
    const [fastModelId, setFastModelId] = useState(agent.fastModelId ?? "");
    const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const router = useRouter();

    // Live model lists per provider (pulled from the provider's /models so new
    // releases appear without a code change); falls back to the static catalog.
    type LiveModel = { id: string; provider: string; displayName: string; category: string };
    const [liveModels, setLiveModels] = useState<Record<string, LiveModel[]>>({});
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const entries = await Promise.all(
                activeProviders.map(async (pid) => [pid, await getLiveModelsAction(pid)] as const)
            );
            if (!cancelled) setLiveModels(Object.fromEntries(entries));
        })();
        return () => { cancelled = true; };
    }, [activeProviders]);

    const handleModelSave = async () => {
        setStatus({ type: "saving", message: "" });
        const fd = new FormData();
        fd.set("agentId", agent.id);
        fd.set("modelId", modelId);

        const result = await updateAgentModelAction(fd);
        setStatus({
            type: result.success ? "success" : "error",
            message: result.message ?? "",
        });
        if (result.success) router.refresh();
    };

    const handleSmartRoutingSave = async () => {
        setStatus({ type: "saving", message: "" });
        const fd = new FormData();
        fd.set("agentId", agent.id);
        fd.set("smartRouting", smartRouting ? "1" : "0");
        fd.set("fastModelId", fastModelId);
        const result = await updateAgentSmartRoutingAction(fd);
        setStatus({ type: result.success ? "success" : "error", message: result.message ?? "" });
        if (result.success) router.refresh();
    };

    const handleDelete = async () => {
        const fd = new FormData();
        fd.set("agentId", agent.id);
        await deleteAgentAction(fd);
    };

    // Split providers into active (configured) and inactive
    const configuredProviders = PROVIDERS.filter(p => activeProviders.includes(p.id));
    const unconfiguredProviders = PROVIDERS.filter(p => !activeProviders.includes(p.id));

    return (
        <div className="space-y-6">
            {/* Profile (name, title, avatar) */}
            <AgentIdentityEditor
                agentId={agent.id}
                initialName={agent.name}
                initialTitle={agent.title}
                initialAvatar={agent.avatar}
                initialReasoningEffort={agent.reasoningEffort}
                initialProgressVerbosity={agent.progressVerbosity ?? null}
                initialRoiHourlyRate={agent.roiHourlyRate ?? null}
            />

            {/* Model Selection */}
            <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-pulse-border-subtle">
                    <h2 className="text-sm font-semibold text-pulse-text">Model</h2>
                    <p className="text-xs text-pulse-faint mt-0.5">Select which LLM model powers this agent. Only models from configured providers are available.</p>
                </div>
                <div className="px-6 py-5">
                    {configuredProviders.length === 0 && (
                        <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                            <p className="text-sm text-amber-400">
                                No AI providers configured. Go to{" "}
                                <a href="/dashboard/settings?tab=providers" className="font-medium underline cursor-pointer">Settings &gt; AI Providers</a>
                                {" "}to add an API key or connect your ChatGPT account.
                            </p>
                        </div>
                    )}

                    <select
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value)}
                        className="w-full max-w-md px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none text-pulse-text bg-pulse-panel"
                    >
                        {/* Active providers — selectable */}
                        {configuredProviders.map((provider) => (
                            <optgroup key={provider.id} label={provider.name}>
                                {(liveModels[provider.id] ?? provider.models).map((model) => (
                                    <option key={model.id} value={model.id}>
                                        {model.displayName} ({model.category})
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                        {/* Inactive providers — disabled */}
                        {unconfiguredProviders.map((provider) => (
                            <optgroup key={provider.id} label={`${provider.name} (not configured)`}>
                                {provider.models.map((model) => (
                                    <option key={model.id} value={model.id} disabled>
                                        {model.displayName} — not configured
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>

                    <div className="mt-4 flex items-center gap-3">
                        <button
                            onClick={handleModelSave}
                            disabled={modelId === agent.modelId || status.type === "saving"}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            Save Model
                        </button>
                        {status.type !== "idle" && (
                            <span className={`text-sm ${status.type === "success" ? "text-green-400" : "text-red-400"}`}>
                                {status.message}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Smart model routing */}
            <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-pulse-border-subtle">
                    <h2 className="text-sm font-semibold text-pulse-text">Smart model routing</h2>
                    <p className="text-xs text-pulse-faint mt-0.5">Route trivial, tool-free turns (e.g. &ldquo;hello&rdquo;) to a fast, cheap model and keep the model above for anything needing tools, attachments, or real work. The reply shows which model answered. Off by default.</p>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={smartRouting} onChange={(e) => setSmartRouting(e.target.checked)} className="h-4 w-4 rounded border-pulse-border text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm text-pulse-text-soft">Enable smart routing for this agent</span>
                    </label>
                    {smartRouting && (
                        <div>
                            <label className="block text-xs font-medium text-pulse-muted mb-1">Fast model (for trivial turns)</label>
                            <select
                                value={fastModelId}
                                onChange={(e) => setFastModelId(e.target.value)}
                                className="w-full max-w-md px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-pulse-text bg-pulse-panel"
                            >
                                <option value="">Select a fast model…</option>
                                {configuredProviders.map((provider) => (
                                    <optgroup key={provider.id} label={provider.name}>
                                        {(liveModels[provider.id] ?? provider.models).map((model) => (
                                            <option key={model.id} value={model.id}>{model.displayName} ({model.category})</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSmartRoutingSave}
                            disabled={status.type === "saving" || (smartRouting && !fastModelId)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            Save routing
                        </button>
                    </div>
                </div>
            </div>

            {/* Docker Sandbox Toggle (read-only display) */}
            <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-pulse-border-subtle">
                    <h2 className="text-sm font-semibold text-pulse-text">Docker Sandbox</h2>
                    <p className="text-xs text-pulse-faint mt-0.5">Code execution capability for this agent.</p>
                </div>
                <div className="px-6 py-5">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${agent.dockerSandboxEnabled ? "bg-red-500" : "bg-pulse-border-strong"}`} />
                        <span className="text-sm text-pulse-text-soft">
                            {agent.dockerSandboxEnabled ? "Enabled — agent can execute code" : "Disabled"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Self-Config Toggle */}
            <SelfConfigToggle agentId={agent.id} initialEnabled={agent.selfConfigEnabled} />

            {/* Danger Zone */}
            <div className="bg-pulse-panel border border-red-500/30 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-red-500/20">
                    <h2 className="text-sm font-semibold text-red-400">Danger Zone</h2>
                </div>
                <div className="px-6 py-5">
                    {!deleteConfirm ? (
                        <button
                            onClick={() => setDeleteConfirm(true)}
                            className="px-4 py-2 text-sm font-medium text-red-400 bg-pulse-panel border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        >
                            Delete Agent
                        </button>
                    ) : (
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm text-red-400">Are you sure? This cannot be undone.</span>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            >
                                Confirm Delete
                            </button>
                            <button
                                onClick={() => setDeleteConfirm(false)}
                                className="px-4 py-2 text-sm font-medium text-pulse-muted bg-pulse-panel border border-pulse-border rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Self-Config Toggle ──────────────────────────────────────────────────────

function SelfConfigToggle({ agentId, initialEnabled }: { agentId: string; initialEnabled: boolean }) {
    const [enabled, setEnabled] = useState(initialEnabled);
    const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });

    const handleToggle = async () => {
        const newValue = !enabled;
        setEnabled(newValue);
        setStatus({ type: "saving", message: "" });

        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("enabled", String(newValue));

        const result = await updateSelfConfigAction(fd);
        setStatus({
            type: result.success ? "success" : "error",
            message: result.message ?? "",
        });
        if (!result.success) setEnabled(!newValue); // revert on failure
    };

    return (
        <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-pulse-border-subtle">
                <div className="flex items-center gap-1.5">
                    <h2 className="text-sm font-semibold text-pulse-text">Agent Self-Config</h2>
                    <InfoTip text="Example: tell it 'be more concise' or 'remember our deploys run on Fridays' and it rewrites its own Soul/Memory. Off = only you edit these, via the tabs." />
                </div>
                <p className="text-xs text-pulse-faint mt-0.5">Let this agent edit its own profile files (Soul, Identity, Memory, etc.) when you chat with it.</p>
            </div>
            <div className="px-6 py-5">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-sm text-pulse-text-soft">
                            {enabled
                                ? "Enabled — agent can modify its SOUL.md, IDENTITY.md, TOOLS.md, USER.md, MEMORY.md, and HEARTBEAT.md files."
                                : "Disabled — workspace files can only be edited from this dashboard."}
                        </p>
                    </div>
                    <button
                        onClick={handleToggle}
                        disabled={status.type === "saving"}
                        aria-pressed={enabled}
                        aria-label="Toggle agent self-config"
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel flex-shrink-0 ${enabled ? "bg-indigo-600" : "bg-pulse-border-strong"} ${status.type === "saving" ? "opacity-50" : ""}`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform motion-reduce:transition-none ${enabled ? "translate-x-6" : "translate-x-1"}`}
                        />
                    </button>
                </div>
                {status.type !== "idle" && status.type !== "saving" && (
                    <p className={`text-xs mt-2 ${status.type === "success" ? "text-green-400" : "text-red-400"}`}>
                        {status.message}
                    </p>
                )}
            </div>
        </div>
    );
}

// ─── Revisions Tab ───────────────────────────────────────────────────────────

function RevisionsTab({ agentId }: { agentId: string }) {
    type WorkspaceFile = "SOUL.md" | "IDENTITY.md" | "MEMORY.md" | "HEARTBEAT.md" | "TOOLS.md" | "USER.md" | "BOOTSTRAP.md" | "AGENTS.md";
    const [selectedFile, setSelectedFile] = useState<WorkspaceFile>("SOUL.md");
    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [restoreStatus, setRestoreStatus] = useState<string>("");
    const router = useRouter();

    const loadRevisions = async (file: WorkspaceFile) => {
        setSelectedFile(file);
        setLoading(true);
        const result = await getRevisionsAction(agentId, file);
        setRevisions(result);
        setLoading(false);
        setLoaded(true);
    };

    const handleRestore = async (revisionId: string) => {
        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("revisionId", revisionId);
        const result = await restoreRevisionAction(fd);
        setRestoreStatus(result.message ?? "");
        if (result.success) {
            router.refresh();
            loadRevisions(selectedFile);
        }
    };

    return (
        <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-pulse-border-subtle flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold text-pulse-text">Revision History</h2>
                <div className="flex flex-wrap gap-2 ml-auto">
                    {(["SOUL.md", "IDENTITY.md", "MEMORY.md", "HEARTBEAT.md", "TOOLS.md", "USER.md", "BOOTSTRAP.md", "AGENTS.md"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => loadRevisions(f)}
                            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${selectedFile === f && loaded
                                ? "bg-pulse-tint text-pulse-accent-hi"
                                : "bg-pulse-panel-alt text-pulse-muted hover:bg-pulse-hover"
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>
            <div className="px-6 py-5">
                {!loaded && (
                    <p className="text-sm text-pulse-faint">Select a file above to view its revision history.</p>
                )}

                {loading && <p className="text-sm text-pulse-muted">Loading...</p>}

                {loaded && !loading && revisions.length === 0 && (
                    <p className="text-sm text-pulse-faint">No revisions found for {selectedFile}.</p>
                )}

                {restoreStatus && (
                    <p className="text-sm text-green-400 mb-3">{restoreStatus}</p>
                )}

                {loaded && !loading && revisions.length > 0 && (
                    <div className="space-y-2">
                        {revisions.map((rev) => (
                            <div
                                key={rev.id}
                                className="flex flex-wrap items-center justify-between gap-2 p-3 border border-pulse-border-subtle rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none"
                            >
                                <div>
                                    <span className="text-sm font-medium text-pulse-text-soft">
                                        #{rev.revisionNumber}
                                    </span>
                                    <span className="text-sm text-pulse-muted ml-3">
                                        {rev.changeSummary ?? "No summary"}
                                    </span>
                                    <span className="text-xs text-pulse-faint ml-3">
                                        {rev.createdAt ? new Date(rev.createdAt).toLocaleString() : ""}
                                    </span>
                                </div>
                                {rev.revisionNumber !== revisions[0]?.revisionNumber && (
                                    <button
                                        onClick={() => handleRestore(rev.id)}
                                        className="text-xs font-medium text-indigo-500 hover:text-indigo-400 px-3 py-1 rounded-lg hover:bg-pulse-tint transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    >
                                        Restore
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
