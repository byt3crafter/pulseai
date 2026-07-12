"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateToolPolicyAction } from "./actions";

interface ToolPolicy {
    allow?: string[];
    deny?: string[];
    ask?: string[];
    alwaysAllow?: string[];
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
    const [askStr, setAskStr] = useState((policy.ask || []).join(", "));
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
        fd.set("ask", askStr);

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
        denyStr !== (policy.deny || []).join(", ") ||
        askStr !== (policy.ask || []).join(", ");

    return (
        <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-pulse-border-subtle">
                <h2 className="text-sm font-semibold text-pulse-text">Tool Policy</h2>
                <p className="text-xs text-pulse-faint mt-0.5">Define which tools this agent can or cannot use. Use commas to separate multiple rules. Glob matching (e.g. * or mcp_*) is supported.</p>
            </div>

            <div className="px-6 py-5 space-y-5">
                <div>
                    <label className="block text-sm font-medium text-pulse-text-soft mb-1">
                        Deny List (Evaluated First)
                    </label>
                    <input
                        type="text"
                        value={denyStr}
                        onChange={(e) => setDenyStr(e.target.value)}
                        placeholder="e.g. drop_database, mcp_dangerous_*"
                        className="w-full px-4 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-pulse-text bg-pulse-panel placeholder:text-pulse-faint"
                    />
                    <p className="text-xs text-pulse-faint mt-1">Tools matching these patterns will be explicitly blocked.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-pulse-text-soft mb-1">
                        Allow List (Evaluated Second)
                    </label>
                    <input
                        type="text"
                        value={allowStr}
                        onChange={(e) => setAllowStr(e.target.value)}
                        placeholder="e.g. get_current_time, calculator"
                        className="w-full px-4 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-pulse-text bg-pulse-panel placeholder:text-pulse-faint"
                    />
                    <p className="text-xs text-pulse-faint mt-1">Leave empty to permit all tools not denied. Otherwise, only tools matching these patterns are permitted.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-pulse-text-soft mb-1">
                        Ask First — Require Approval
                    </label>
                    <input
                        type="text"
                        value={askStr}
                        onChange={(e) => setAskStr(e.target.value)}
                        placeholder="e.g. email_send, server_exec, erpnext_*"
                        className="w-full px-4 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-pulse-text bg-pulse-panel placeholder:text-pulse-faint"
                    />
                    <p className="text-xs text-pulse-faint mt-1">
                        Before running a tool matching these patterns, the agent pauses and asks a designated approver to
                        Allow / Deny / Allow-always (in their Telegram DM). Set approvers &amp; view standing allowances under{" "}
                        <a href="/dashboard/people" className="text-pulse-accent hover:underline">People</a>.
                    </p>
                </div>

                <div className="pt-2 flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || status.type === "saving"}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                    >
                        Save Policy
                    </button>
                    {status.type !== "idle" && (
                        <span className={`text-sm ${status.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                            {status.type === "saving" ? "Saving..." : status.message}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
