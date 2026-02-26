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
        <div className="p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                        MCP Servers
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Manage external tool servers and bind them to agents.
                    </p>
                </div>
                <CreateMcpServerModal />
            </div>

            {servers.length === 0 && (
                <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                    <p className="text-sm text-slate-400">
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
                            className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                        >
                            <div className="px-6 py-4 border-b border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className={`w-2.5 h-2.5 rounded-full ${
                                                server.status === "active"
                                                    ? "bg-green-500"
                                                    : "bg-slate-300"
                                            }`}
                                        />
                                        <h3 className="text-sm font-semibold text-slate-900">
                                            {server.name}
                                        </h3>
                                    </div>
                                    <button
                                        onClick={() =>
                                            setDeleteServerId(server.id)
                                        }
                                        className="text-xs font-medium text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                                    >
                                        Delete
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400 font-mono mt-1 truncate">
                                    {server.url}
                                </p>
                            </div>
                            <div className="px-6 py-4">
                                {/* Bound Agents */}
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                                    Bound Agents
                                </p>
                                {boundAgents.length === 0 && (
                                    <p className="text-xs text-slate-400 mb-2">
                                        No agents bound.
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {boundAgents.map((agent) => (
                                        <span
                                            key={agent.id}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700"
                                        >
                                            {agent.name}
                                            <button
                                                onClick={() =>
                                                    handleUnbind(
                                                        server.id,
                                                        agent.id
                                                    )
                                                }
                                                className="text-indigo-400 hover:text-indigo-700"
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
                                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
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
                onConfirm={handleDelete}
                onCancel={() => setDeleteServerId(null)}
            />
        </div>
    );
}
