"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CpuChipIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { PageHeader, Card, EmptyState, Toggle } from "../../../components/dashboard/ui";
import AgentAvatar from "../../../components/dashboard/AgentAvatar";
import { getLiveModelsAction, toggleAgentEnabledAction } from "./actions";
import { updateAgentModelAction, deleteAgentAction } from "./[id]/actions";
import { PROVIDERS, DEFAULT_MODEL_ID, getModelDisplayName } from "../../../utils/models";

interface AgentRow {
    id: string;
    name: string;
    title: string | null;
    avatar: string | null;
    modelId: string | null;
    enabled: boolean;
    dockerSandboxEnabled: boolean | null;
    workspacePath: string | null;
}

interface DeptInfo {
    name: string;
    kind: string;
    role: string;
}

interface LiveModel {
    id: string;
    provider: string;
    displayName: string;
    category: string;
}

type RowStatus = { type: "idle" | "saving" | "success" | "error"; message?: string };

export default function AgentsTableClient({
    agents,
    deptsByAgent,
    connectedProviders,
}: {
    agents: AgentRow[];
    deptsByAgent: Record<string, DeptInfo[]>;
    connectedProviders: string[];
}) {
    const router = useRouter();
    const [, startTransition] = useTransition();

    const [liveModels, setLiveModels] = useState<Record<string, LiveModel[]>>({});
    const [modelStatus, setModelStatus] = useState<Record<string, RowStatus>>({});
    const [modelSelection, setModelSelection] = useState<Record<string, string>>({});
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Live model lists per connected provider (falls back to the static catalog);
    // mirrors the pattern used in agents/[id]/AgentWorkspaceClient.tsx ConfigTab.
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

    const configuredProviders = PROVIDERS.filter((p) => connectedProviders.includes(p.id));

    function setBusy(id: string, busy: boolean) {
        setBusyRows((prev) => ({ ...prev, [id]: busy }));
    }

    function handleModelChange(agent: AgentRow, modelId: string) {
        setModelSelection((s) => ({ ...s, [agent.id]: modelId }));
        setModelStatus((s) => ({ ...s, [agent.id]: { type: "saving" } }));
        const fd = new FormData();
        fd.set("agentId", agent.id);
        fd.set("modelId", modelId);
        startTransition(async () => {
            const res = await updateAgentModelAction(fd);
            setModelStatus((s) => ({ ...s, [agent.id]: { type: res.success ? "success" : "error", message: res.message } }));
            if (res.success) router.refresh();
        });
    }

    function handleToggle(agent: AgentRow, next: boolean) {
        setBusy(agent.id, true);
        startTransition(async () => {
            const res = await toggleAgentEnabledAction(agent.id, next);
            setBusy(agent.id, false);
            setMessage({ type: res.success ? "success" : "error", text: res.message });
            if (res.success) router.refresh();
        });
    }

    function handleDelete(agent: AgentRow) {
        if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
        setBusy(agent.id, true);
        const fd = new FormData();
        fd.set("agentId", agent.id);
        startTransition(async () => {
            const res: any = await deleteAgentAction(fd);
            // On success, deleteAgentAction redirects (throws) before returning — we
            // only ever get here with a real value on failure.
            if (res && res.success === false) {
                setBusy(agent.id, false);
                setMessage({ type: "error", text: res.message });
            }
        });
    }

    function renderModelOptions(agent: AgentRow): ReactNode {
        const currentModelId = agent.modelId ?? DEFAULT_MODEL_ID;
        const hasCurrentOption = configuredProviders.some((p) =>
            (liveModels[p.id] ?? p.models).some((m) => m.id === currentModelId)
        );
        return (
            <>
                {!hasCurrentOption && (
                    <option value={currentModelId}>{getModelDisplayName(currentModelId)} (current)</option>
                )}
                {configuredProviders.map((provider) => (
                    <optgroup key={provider.id} label={provider.name}>
                        {(liveModels[provider.id] ?? provider.models).map((model) => (
                            <option key={model.id} value={model.id}>{model.displayName}</option>
                        ))}
                    </optgroup>
                ))}
            </>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
            <PageHeader
                title="Agent Profiles"
                description="Manage your AI workforce — models, departments, and status."
                action={
                    <Link
                        href="/dashboard/agents/new"
                        className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap self-start sm:self-auto"
                    >
                        <PlusIcon className="w-4 h-4" aria-hidden="true" />
                        Create agent
                    </Link>
                }
            />

            {message && (
                <div
                    role="status"
                    className={`mb-4 px-4 py-3 rounded-lg text-sm border ${message.type === "success"
                        ? "bg-green-500/10 text-green-500 border-green-500/30"
                        : "bg-red-500/10 text-red-500 border-red-500/30"
                        }`}
                >
                    {message.text}
                </div>
            )}

            {agents.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={CpuChipIcon}
                        title="No agent profiles yet"
                        description="Create your first AI persona to start tailoring system prompts and connecting specialized tools."
                        action={
                            <Link
                                href="/dashboard/agents/new"
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            >
                                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                                Create agent
                            </Link>
                        }
                    />
                </Card>
            ) : (
                <Card>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-xs uppercase tracking-wide text-pulse-faint border-b border-pulse-border-subtle">
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Agent</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Model</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Departments</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agents.map((agent) => {
                                    const depts = deptsByAgent[agent.id] ?? [];
                                    const status = modelStatus[agent.id] ?? { type: "idle" as const };
                                    const busy = !!busyRows[agent.id];
                                    const selectedModel = modelSelection[agent.id] ?? agent.modelId ?? DEFAULT_MODEL_ID;

                                    return (
                                        <tr key={agent.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                            {/* Agent */}
                                            <td className="px-4 py-3 align-top">
                                                <div className={`flex items-center gap-3 ${!agent.enabled ? "opacity-60" : ""}`}>
                                                    <AgentAvatar name={agent.name} avatar={agent.avatar} size="sm" />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <Link
                                                                href={`/dashboard/agents/${agent.id}`}
                                                                className="font-medium text-pulse-text hover:text-indigo-500 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                                            >
                                                                {agent.name}
                                                            </Link>
                                                            {agent.dockerSandboxEnabled && (
                                                                <span className="px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-[10px] font-semibold uppercase tracking-wide">
                                                                    Sandbox
                                                                </span>
                                                            )}
                                                        </div>
                                                        {agent.title ? (
                                                            <p className="text-xs text-pulse-muted truncate">{agent.title}</p>
                                                        ) : (
                                                            <p className="text-xs text-pulse-faint font-mono">{agent.id.slice(0, 8)}…</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Model */}
                                            <td className="px-4 py-3 align-top">
                                                <select
                                                    value={selectedModel}
                                                    onChange={(e) => handleModelChange(agent, e.target.value)}
                                                    aria-label={`Model for ${agent.name}`}
                                                    className="w-full max-w-[220px] px-2.5 py-1.5 border border-pulse-border rounded-lg text-xs bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors motion-reduce:transition-none cursor-pointer"
                                                >
                                                    {renderModelOptions(agent)}
                                                </select>
                                                <div className="h-4 mt-1">
                                                    {status.type === "saving" && (
                                                        <span className="text-[11px] text-pulse-muted">Saving…</span>
                                                    )}
                                                    {status.type === "success" && (
                                                        <span className="text-[11px] text-green-500">Saved</span>
                                                    )}
                                                    {status.type === "error" && (
                                                        <span className="text-[11px] text-red-500">{status.message}</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Departments */}
                                            <td className="px-4 py-3 align-top">
                                                {depts.length === 0 ? (
                                                    <span className="text-sm text-pulse-muted">—</span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1.5 max-w-xs">
                                                        {depts.map((d, i) => (
                                                            <span
                                                                key={`${d.name}-${i}`}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pulse-panel-alt text-pulse-muted text-xs whitespace-nowrap"
                                                            >
                                                                {d.role === "lead" && <span aria-hidden="true">★</span>}
                                                                {d.role === "lead" ? `lead · ${d.name}` : d.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Status */}
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex items-center gap-2">
                                                    <Toggle
                                                        checked={agent.enabled}
                                                        onChange={(next) => handleToggle(agent, next)}
                                                        label={`${agent.enabled ? "Disable" : "Enable"} ${agent.name}`}
                                                        disabled={busy}
                                                    />
                                                    <span className={`text-xs font-medium ${agent.enabled ? "text-green-500" : "text-pulse-muted"}`}>
                                                        {agent.enabled ? "Active" : "Disabled"}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-4 py-3 align-top text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <Link
                                                        href={`/dashboard/agents/${agent.id}`}
                                                        className="text-xs font-medium text-indigo-500 hover:text-indigo-400 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                                    >
                                                        Edit
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(agent)}
                                                        disabled={busy}
                                                        aria-label={`Delete ${agent.name}`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-red-500 hover:bg-red-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <TrashIcon className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}
