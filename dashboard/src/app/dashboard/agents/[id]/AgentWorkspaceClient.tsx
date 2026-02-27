"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    updateWorkspaceFileAction,
    updateAgentModelAction,
    getRevisionsAction,
    restoreRevisionAction,
    deleteAgentAction,
    updateSelfConfigAction,
} from "./actions";
import { PROVIDERS, getModelDisplayName, getProviderName } from "../../../../utils/models";
import ToolPolicyEditor from "./ToolPolicyEditor";
import SandboxConfigEditor from "./SandboxConfigEditor";
import HeartbeatEditor from "./HeartbeatEditor";

interface AgentData {
    id: string;
    name: string;
    modelId: string;
    dockerSandboxEnabled: boolean;
    selfConfigEnabled: boolean;
    hasWorkspace: boolean;
    toolPolicy: any;
    sandboxConfig: any;
    heartbeatConfig: any;
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
}

const TABS = [
    { id: "soul", label: "Soul" },
    { id: "identity", label: "Identity" },
    { id: "memory", label: "Memory" },
    { id: "heartbeat", label: "Heartbeat" },
    { id: "tools-guidance", label: "Tools" },
    { id: "user-prefs", label: "User" },
    { id: "bootstrap", label: "Bootstrap" },
    { id: "agents", label: "Agents" },
    { id: "tool-policy", label: "Tool Policy" },
    { id: "sandbox", label: "Sandbox" },
    { id: "config", label: "Config" },
    { id: "revisions", label: "Revisions" },
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
}: Props) {
    const [activeTab, setActiveTab] = useState("soul");
    const router = useRouter();

    return (
        <div className="p-8 max-w-5xl">
            {/* Header */}
            <div className="mb-6">
                <Link
                    href="/dashboard/agents"
                    className="text-sm text-slate-500 hover:text-slate-700 transition-colors mb-2 inline-block"
                >
                    &larr; Back to Agents
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{agent.name}</h1>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs font-mono text-slate-400">ID: {agent.id.slice(0, 8)}...</span>
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full">
                                {getModelDisplayName(agent.modelId)}
                            </span>
                            {agent.dockerSandboxEnabled && (
                                <span className="px-2 py-0.5 bg-red-50 text-red-700 text-xs font-semibold rounded-full">
                                    Sandbox
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab nav */}
            <div className="border-b border-slate-200 mb-6">
                <nav className="flex gap-0">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id
                                ? "border-indigo-600 text-indigo-600"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            {t.label}
                            {t.id === "revisions" && (soulRevisionCount + identityRevisionCount + memoryRevisionCount + heartbeatRevisionCount + toolsGuidanceRevisionCount + userPrefsRevisionCount + bootstrapRevisionCount + agentsRevisionCount) > 0 && (
                                <span className="ml-1.5 text-xs text-slate-400">
                                    ({soulRevisionCount + identityRevisionCount + memoryRevisionCount + heartbeatRevisionCount + toolsGuidanceRevisionCount + userPrefsRevisionCount + bootstrapRevisionCount + agentsRevisionCount})
                                </span>
                            )}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab content */}
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
                    description="Persistent memory for your agent. Information stored here persists across conversations and helps the agent learn over time."
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
    );
}

// ─── File Editor ─────────────────────────────────────────────────────────────

function FileEditor({
    agentId,
    fileName,
    initialContent,
    title,
    description,
}: {
    agentId: string;
    fileName: string;
    initialContent: string;
    title: string;
    description: string;
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{description}</p>
            </div>
            <div className="p-6">
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={18}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-800 resize-y leading-relaxed"
                    placeholder={`Write your ${title.toLowerCase()} content in Markdown...`}
                />

                <div className="mt-4 flex items-center justify-between">
                    <div>
                        {status.type !== "idle" && (
                            <p className={`text-sm ${status.type === "success" ? "text-emerald-600" : status.type === "error" ? "text-red-500" : "text-slate-500"}`}>
                                {status.type === "saving" ? "Saving..." : status.message}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || status.type === "saving"}
                        className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Save {fileName}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Config Tab ──────────────────────────────────────────────────────────────

function ConfigTab({ agent, activeProviders }: { agent: AgentData; activeProviders: string[] }) {
    const [modelId, setModelId] = useState(agent.modelId);
    const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const router = useRouter();

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
            {/* Model Selection */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-900">Model</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Select which LLM model powers this agent. Only models from configured providers are available.</p>
                </div>
                <div className="px-6 py-5">
                    {configuredProviders.length === 0 && (
                        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-sm text-amber-800">
                                No AI providers configured. Go to{" "}
                                <a href="/dashboard/settings?tab=providers" className="font-medium underline">Settings &gt; AI Providers</a>
                                {" "}to add an API key or connect your ChatGPT account.
                            </p>
                        </div>
                    )}

                    <select
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value)}
                        className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 bg-white"
                    >
                        {/* Active providers — selectable */}
                        {configuredProviders.map((provider) => (
                            <optgroup key={provider.id} label={provider.name}>
                                {provider.models.map((model) => (
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
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Save Model
                        </button>
                        {status.type !== "idle" && (
                            <span className={`text-sm ${status.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
                                {status.message}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Docker Sandbox Toggle (read-only display) */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-900">Docker Sandbox</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Code execution capability for this agent.</p>
                </div>
                <div className="px-6 py-5">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${agent.dockerSandboxEnabled ? "bg-red-500" : "bg-slate-300"}`} />
                        <span className="text-sm text-slate-700">
                            {agent.dockerSandboxEnabled ? "Enabled — agent can execute code" : "Disabled"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Self-Config Toggle */}
            <SelfConfigToggle agentId={agent.id} initialEnabled={agent.selfConfigEnabled} />

            {/* Danger Zone */}
            <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-red-100">
                    <h2 className="text-sm font-semibold text-red-700">Danger Zone</h2>
                </div>
                <div className="px-6 py-5">
                    {!deleteConfirm ? (
                        <button
                            onClick={() => setDeleteConfirm(true)}
                            className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                        >
                            Delete Agent
                        </button>
                    ) : (
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-red-600">Are you sure? This cannot be undone.</span>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Confirm Delete
                            </button>
                            <button
                                onClick={() => setDeleteConfirm(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">Agent Self-Config</h2>
                <p className="text-xs text-slate-400 mt-0.5">Allow the agent to edit its own workspace files via a tool.</p>
            </div>
            <div className="px-6 py-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-slate-700">
                            {enabled
                                ? "Enabled — agent can modify its SOUL.md, IDENTITY.md, TOOLS.md, USER.md, MEMORY.md, and HEARTBEAT.md files."
                                : "Disabled — workspace files can only be edited from this dashboard."}
                        </p>
                    </div>
                    <button
                        onClick={handleToggle}
                        disabled={status.type === "saving"}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-indigo-600" : "bg-slate-300"} ${status.type === "saving" ? "opacity-50" : ""}`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
                        />
                    </button>
                </div>
                {status.type !== "idle" && status.type !== "saving" && (
                    <p className={`text-xs mt-2 ${status.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-900">Revision History</h2>
                <div className="flex gap-2 ml-auto">
                    {(["SOUL.md", "IDENTITY.md", "MEMORY.md", "HEARTBEAT.md", "TOOLS.md", "USER.md", "BOOTSTRAP.md", "AGENTS.md"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => loadRevisions(f)}
                            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${selectedFile === f && loaded
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>
            <div className="px-6 py-5">
                {!loaded && (
                    <p className="text-sm text-slate-400">Select a file above to view its revision history.</p>
                )}

                {loading && <p className="text-sm text-slate-500">Loading...</p>}

                {loaded && !loading && revisions.length === 0 && (
                    <p className="text-sm text-slate-400">No revisions found for {selectedFile}.</p>
                )}

                {restoreStatus && (
                    <p className="text-sm text-emerald-600 mb-3">{restoreStatus}</p>
                )}

                {loaded && !loading && revisions.length > 0 && (
                    <div className="space-y-2">
                        {revisions.map((rev) => (
                            <div
                                key={rev.id}
                                className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                <div>
                                    <span className="text-sm font-medium text-slate-700">
                                        #{rev.revisionNumber}
                                    </span>
                                    <span className="text-sm text-slate-500 ml-3">
                                        {rev.changeSummary ?? "No summary"}
                                    </span>
                                    <span className="text-xs text-slate-400 ml-3">
                                        {rev.createdAt ? new Date(rev.createdAt).toLocaleString() : ""}
                                    </span>
                                </div>
                                {rev.revisionNumber !== revisions[0]?.revisionNumber && (
                                    <button
                                        onClick={() => handleRestore(rev.id)}
                                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-3 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
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
