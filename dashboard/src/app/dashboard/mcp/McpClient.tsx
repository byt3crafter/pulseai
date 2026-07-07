"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    deleteMcpServerAction,
    bindAgentToMcpAction,
    unbindAgentFromMcpAction,
} from "./actions";
import CreateMcpServerModal from "./CreateMcpServerModal";
import ConfirmDialog from "../../../components/ConfirmDialog";

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
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-pulse-text tracking-tight">
                        MCP Servers
                    </h1>
                    <p className="text-sm text-pulse-muted mt-1">
                        Manage external tool servers and bind them to agents.
                    </p>
                </div>
                <CreateMcpServerModal />
            </div>

            {servers.length === 0 && (
                <div className="text-center py-16 bg-pulse-panel rounded-xl border border-pulse-border-subtle">
                    <p className="text-sm text-pulse-faint">
                        No MCP servers configured. Add one to give your agents
                        external tool access.
                    </p>
                </div>
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
                        <div
                            key={server.id}
                            className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden"
                        >
                            <div className="px-6 py-4 border-b border-pulse-border-subtle">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className={`w-2.5 h-2.5 rounded-full ${
                                                server.status === "active"
                                                    ? "bg-green-400"
                                                    : "bg-pulse-faint"
                                            }`}
                                        />
                                        <h3 className="text-sm font-semibold text-pulse-text">
                                            {server.name}
                                        </h3>
                                    </div>
                                    <button
                                        onClick={() =>
                                            setDeleteServerId(server.id)
                                        }
                                        className="text-xs font-medium text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 cursor-pointer transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    >
                                        Delete
                                    </button>
                                </div>
                                <p className="text-xs text-pulse-faint font-mono mt-1 truncate">
                                    {server.url}
                                </p>
                            </div>
                            <div className="px-6 py-4">
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
                        </div>
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
