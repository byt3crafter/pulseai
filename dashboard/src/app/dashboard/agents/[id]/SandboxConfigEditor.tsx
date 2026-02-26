"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSandboxConfigAction } from "./actions";

interface SandboxConfig {
    mode: "off" | "non-main" | "all";
    scope: "session" | "agent" | "shared";
    workspaceAccess: "none" | "ro" | "rw";
    docker?: {
        image?: string;
        memoryLimit?: string;
        cpuLimit?: string;
        setupCommand?: string;
    };
}

export default function SandboxConfigEditor({
    agentId,
    initialConfig,
}: {
    agentId: string;
    initialConfig: any;
}) {
    const defaultCfg: SandboxConfig = { mode: "off", scope: "session", workspaceAccess: "none" };
    const config = (initialConfig as SandboxConfig) || defaultCfg;

    const [mode, setMode] = useState(config.mode || "off");
    const [scope, setScope] = useState(config.scope || "session");
    const [workspaceAccess, setWorkspaceAccess] = useState(config.workspaceAccess || "none");
    const [image, setImage] = useState(config.docker?.image || "");
    const [memoryLimit, setMemoryLimit] = useState(config.docker?.memoryLimit || "");
    const [cpuLimit, setCpuLimit] = useState(config.docker?.cpuLimit || "");
    const [setupCommand, setSetupCommand] = useState(config.docker?.setupCommand || "");

    const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });
    const router = useRouter();

    const handleSave = async () => {
        setStatus({ type: "saving", message: "" });
        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("mode", mode);
        fd.set("scope", scope);
        fd.set("workspaceAccess", workspaceAccess);
        if (image) fd.set("image", image);
        if (memoryLimit) fd.set("memoryLimit", memoryLimit);
        if (cpuLimit) fd.set("cpuLimit", cpuLimit);
        if (setupCommand) fd.set("setupCommand", setupCommand);

        const result = await updateSandboxConfigAction(fd);
        setStatus({
            type: result.success ? "success" : "error",
            message: result.message ?? "",
        });
        if (result.success) {
            router.refresh();
        }
    };

    const isDirty =
        mode !== (config.mode || "off") ||
        scope !== (config.scope || "session") ||
        workspaceAccess !== (config.workspaceAccess || "none") ||
        image !== (config.docker?.image || "") ||
        memoryLimit !== (config.docker?.memoryLimit || "") ||
        cpuLimit !== (config.docker?.cpuLimit || "") ||
        setupCommand !== (config.docker?.setupCommand || "");

    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">Sandbox Configuration</h2>
                <p className="text-xs text-slate-400 mt-0.5">Configure execution boundaries, Docker container overrides, and workspace mount access.</p>
            </div>

            <div className="px-6 py-5 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Mode</label>
                        <select
                            value={mode}
                            onChange={(e) => setMode(e.target.value as any)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none text-slate-900 bg-white"
                        >
                            <option value="off">Off (Disabled)</option>
                            <option value="non-main">Non-Main (Isolated)</option>
                            <option value="all">All (Full Access)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Scope</label>
                        <select
                            value={scope}
                            onChange={(e) => setScope(e.target.value as any)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none text-slate-900 bg-white"
                        >
                            <option value="session">Session (Per thread)</option>
                            <option value="agent">Agent (Shared across threads)</option>
                            <option value="shared">Shared (Global pool)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Workspace Access</label>
                        <select
                            value={workspaceAccess}
                            onChange={(e) => setWorkspaceAccess(e.target.value as any)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none text-slate-900 bg-white"
                        >
                            <option value="none">None (No Mount)</option>
                            <option value="ro">Read-Only Mount</option>
                            <option value="rw">Read-Write Mount</option>
                        </select>
                    </div>
                </div>

                <div className="border-t border-slate-200 pt-5 space-y-4">
                    <h3 className="text-sm font-medium text-slate-800">Docker Overrides</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Docker Image</label>
                            <input
                                type="text"
                                value={image}
                                onChange={(e) => setImage(e.target.value)}
                                placeholder="alpine (default)"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none text-slate-900 bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Setup Command</label>
                            <input
                                type="text"
                                value={setupCommand}
                                onChange={(e) => setSetupCommand(e.target.value)}
                                placeholder="e.g. apk add python3"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none text-slate-900 bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Memory Limit</label>
                            <input
                                type="text"
                                value={memoryLimit}
                                onChange={(e) => setMemoryLimit(e.target.value)}
                                placeholder="128m (default)"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none text-slate-900 bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">CPU Limit</label>
                            <input
                                type="text"
                                value={cpuLimit}
                                onChange={(e) => setCpuLimit(e.target.value)}
                                placeholder="0.5 (default)"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none text-slate-900 bg-white"
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || status.type === "saving"}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Save Sandbox Config
                    </button>
                    {status.type !== "idle" && (
                        <span className={`text-sm ${status.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
                            {status.type === "saving" ? "Saving..." : status.message}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
