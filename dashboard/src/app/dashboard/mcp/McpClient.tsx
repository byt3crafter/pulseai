"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon, ServerStackIcon } from "@heroicons/react/24/outline";
import {
    deleteMcpServerAction,
    bindAgentToMcpAction,
    unbindAgentFromMcpAction,
} from "./actions";
import CreateMcpServerModal from "./CreateMcpServerModal";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { PageHeader, Card, EmptyState } from "../../../components/dashboard/ui";

interface McpServer {
    id: string;
    name: string;
    url: string;
    authHeaders: Record<string, string>;
    status: string | null;
    createdAt: string;
}

interface Agent {
    id: string;
    name: string;
}

interface Binding {
    id: string;
    agentProfileId: string;
    mcpServerId: string;
}

interface Props {
    servers: McpServer[];
    agents: Agent[];
    bindings: Binding[];
}

export default function McpClient({ servers, agents, bindings }: Props) {
    const router = useRouter();
    const [deleteServerId, setDeleteServerId] = useState<string | null>(null);

    const handleDelete = async () => {
        if (!deleteServerId) return;
        const result = await deleteMcpServerAction(deleteServerId);
        setDeleteServerId(null);
        if (result.success) {
            router.refresh();
        }
    };

    const handleBind = async (serverId: string, agentId: string) => {
        await bindAgentToMcpAction(agentId, serverId);
        router.refresh();
    };

    const handleUnbind = async (serverId: string, agentId: string) => {
        await unbindAgentFromMcpAction(agentId, serverId);
        router.refresh();
    };

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-page mx-auto">
            <PageHeader
                title="MCP Servers"
                description="Manage external tool servers and bind them to agents."
                action={<CreateMcpServerModal />}
            />

            {servers.length === 0 && (
                <Card>
                    <EmptyState
                        icon={ServerStackIcon}
                        title="No MCP servers configured"
                        description="Add one to give your agents external tool access."
                    />
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {servers.map((server) => {
                    const boundAgentIds = bindings
                        .filter((b) => b.mcpServerId === server.id)
                        .map((b) => b.agentProfileId);
                    const boundAgents = agents.filter((a) =>
                        boundAgentIds.includes(a.id)
                    );
                    const unboundAgents = agents.filter(
                        (a) => !boundAgentIds.includes(a.id)
                    );

                    return (
                        <Card key={server.id}>
                            <div className="px-5 py-4 border-b border-pulse-border-subtle flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span
                                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                            server.status === "active"
                                                ? "bg-green-400"
                                                : "bg-pulse-border-strong"
                                        }`}
                                        aria-hidden="true"
                                    />
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold text-pulse-text truncate">
                                            {server.name}
                                        </h3>
                                        <p className="text-xs text-pulse-faint font-mono truncate">
                                            {server.url}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setDeleteServerId(server.id)
                                    }
                                    aria-label={`Delete ${server.name}`}
                                    className="p-1.5 rounded-lg text-pulse-faint hover:text-red-500 hover:bg-red-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500 flex-shrink-0"
                                >
                                    <TrashIcon className="w-4 h-4" aria-hidden="true" />
                                </button>
                            </div>
                            <div className="p-5">
                                {/* Bound Agents */}
                                <p className="text-xs font-medium text-pulse-muted uppercase tracking-wide mb-2">
                                    Bound Agents
                                </p>
                                {boundAgents.length === 0 && (
                                    <p className="text-xs text-pulse-faint mb-2">
                                        No agents bound.
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {boundAgents.map((agent) => (
                                        <span
                                            key={agent.id}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-pulse-tint text-pulse-accent-hi"
                                        >
                                            {agent.name}
                                            <button
                                                onClick={() =>
                                                    handleUnbind(
                                                        server.id,
                                                        agent.id
                                                    )
                                                }
                                                className="text-pulse-accent-hi/70 hover:text-pulse-accent-hi cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-full"
                                            >
                                                &times;
                                            </button>
                                        </span>
                                    ))}
                                </div>

                                {/* Add Agent Binding */}
                                {unboundAgents.length > 0 && (
                                    <select
                                        defaultValue=""
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                handleBind(
                                                    server.id,
                                                    e.target.value
                                                );
                                                e.target.value = "";
                                            }
                                        }}
                                        className="w-full px-3 py-1.5 border border-pulse-border rounded-lg text-xs text-pulse-text-soft bg-pulse-panel focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none cursor-pointer"
                                    >
                                        <option value="" disabled>
                                            Bind an agent...
                                        </option>
                                        {unboundAgents.map((agent) => (
                                            <option
                                                key={agent.id}
                                                value={agent.id}
                                            >
                                                {agent.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </Card>
                    );
                })}
            </div>

            <ConfirmDialog
                open={!!deleteServerId}
                title="Delete MCP Server"
                message="This will permanently remove this MCP server and unbind it from all agents. This action cannot be undone."
                confirmLabel="Delete Server"
                variant="danger"
                theme="pulse"
                onConfirm={handleDelete}
                onCancel={() => setDeleteServerId(null)}
            />
        </div>
    );
}
