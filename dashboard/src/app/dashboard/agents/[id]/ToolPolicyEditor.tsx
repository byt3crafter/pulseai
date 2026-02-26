"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateToolPolicyAction } from "./actions";

interface ToolPolicy {
    allow?: string[];
    deny?: string[];
}

export default function ToolPolicyEditor({
    agentId,
    initialPolicy,
}: {
    agentId: string;
    initialPolicy: any;
}) {
    const policy = initialPolicy as ToolPolicy || {};
    const [allowStr, setAllowStr] = useState((policy.allow || []).join(", "));
    const [denyStr, setDenyStr] = useState((policy.deny || []).join(", "));
    const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });
    const router = useRouter();

    const handleSave = async () => {
        setStatus({ type: "saving", message: "" });
        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("allow", allowStr);
        fd.set("deny", denyStr);

        const result = await updateToolPolicyAction(fd);
        setStatus({
            type: result.success ? "success" : "error",
            message: result.message ?? "",
        });
        if (result.success) {
            router.refresh();
        }
    };

    const isDirty =
        allowStr !== (policy.allow || []).join(", ") ||
        denyStr !== (policy.deny || []).join(", ");

    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">Tool Policy</h2>
                <p className="text-xs text-slate-400 mt-0.5">Define which tools this agent can or cannot use. Use commas to separate multiple rules. Glob matching (e.g. * or mcp_*) is supported.</p>
            </div>

            <div className="px-6 py-5 space-y-5">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Deny List (Evaluated First)
                    </label>
                    <input
                        type="text"
                        value={denyStr}
                        onChange={(e) => setDenyStr(e.target.value)}
                        placeholder="e.g. drop_database, mcp_dangerous_*"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-slate-900 bg-white"
                    />
                    <p className="text-xs text-slate-400 mt-1">Tools matching these patterns will be explicitly blocked.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Allow List (Evaluated Second)
                    </label>
                    <input
                        type="text"
                        value={allowStr}
                        onChange={(e) => setAllowStr(e.target.value)}
                        placeholder="e.g. get_current_time, calculator"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-slate-900 bg-white"
                    />
                    <p className="text-xs text-slate-400 mt-1">Leave empty to permit all tools not denied. Otherwise, only tools matching these patterns are permitted.</p>
                </div>

                <div className="pt-2 flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || status.type === "saving"}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Save Policy
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
