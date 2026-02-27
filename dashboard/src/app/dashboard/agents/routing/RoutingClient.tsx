"use client";

import { useState, useTransition } from "react";
import {
    createRoutingRule,
    updateRoutingRule,
    deleteRoutingRule,
    toggleRoutingRule,
} from "./actions";

interface Rule {
    id: string;
    agentProfileId: string;
    agentName: string;
    ruleType: string;
    matchValue: string;
    priority: number;
    enabled: boolean;
    description: string;
    createdAt: string;
}

interface Agent {
    id: string;
    name: string;
}

const RULE_TYPE_LABELS: Record<string, string> = {
    contact: "Contact",
    group: "Group",
    keyword: "Keyword",
    channel_default: "Channel Default",
};

const RULE_TYPE_HELP: Record<string, string> = {
    contact: "Telegram user ID. Matches DMs from this user or messages from this user in groups.",
    group: "Telegram group/chat ID. Matches all messages in that group.",
    keyword: "Regex pattern matched against message content (case-insensitive).",
    channel_default: "Channel type (e.g. \"telegram\", \"webchat\"). Catch-all for that channel.",
};

export default function RoutingClient({ rules, agents }: { rules: Rule[]; agents: Agent[] }) {
    const [pending, startTransition] = useTransition();
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    // Form state
    const [formRuleType, setFormRuleType] = useState("contact");
    const [formMatchValue, setFormMatchValue] = useState("");
    const [formAgentId, setFormAgentId] = useState(agents[0]?.id ?? "");
    const [formPriority, setFormPriority] = useState("100");
    const [formDescription, setFormDescription] = useState("");

    const resetForm = () => {
        setFormRuleType("contact");
        setFormMatchValue("");
        setFormAgentId(agents[0]?.id ?? "");
        setFormPriority("100");
        setFormDescription("");
        setEditingId(null);
        setShowForm(false);
    };

    const startEdit = (rule: Rule) => {
        setFormRuleType(rule.ruleType);
        setFormMatchValue(rule.matchValue);
        setFormAgentId(rule.agentProfileId);
        setFormPriority(rule.priority.toString());
        setFormDescription(rule.description);
        setEditingId(rule.id);
        setShowForm(true);
    };

    const handleSubmit = () => {
        setMessage(null);
        const fd = new FormData();
        fd.set("ruleType", formRuleType);
        fd.set("matchValue", formMatchValue);
        fd.set("agentProfileId", formAgentId);
        fd.set("priority", formPriority);
        fd.set("description", formDescription);

        startTransition(async () => {
            const result = editingId
                ? await updateRoutingRule(editingId, fd)
                : await createRoutingRule(fd);

            if (result.success) {
                resetForm();
            } else {
                setMessage(result.message || "Failed to save rule.");
            }
        });
    };

    const handleDelete = (ruleId: string) => {
        setMessage(null);
        startTransition(async () => {
            const result = await deleteRoutingRule(ruleId);
            if (!result.success) {
                setMessage(result.message || "Failed to delete rule.");
            }
            setConfirmDelete(null);
        });
    };

    const handleToggle = (ruleId: string) => {
        startTransition(async () => {
            await toggleRoutingRule(ruleId);
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Message Routing</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Route incoming messages to different agents based on rules. Rules are evaluated in priority order (lowest number first). The first matching rule wins.
                    </p>
                </div>
                {!showForm && (
                    <button
                        onClick={() => { resetForm(); setShowForm(true); }}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        Add Rule
                    </button>
                )}
            </div>

            {/* Error/success message */}
            {message && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-700">{message}</p>
                </div>
            )}

            {/* Add/Edit Form */}
            {showForm && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">
                        {editingId ? "Edit Rule" : "New Routing Rule"}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Rule Type */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Rule Type</label>
                            <select
                                value={formRuleType}
                                onChange={(e) => setFormRuleType(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="contact">Contact</option>
                                <option value="group">Group</option>
                                <option value="keyword">Keyword (Regex)</option>
                                <option value="channel_default">Channel Default</option>
                            </select>
                            <p className="text-xs text-slate-400 mt-1">{RULE_TYPE_HELP[formRuleType]}</p>
                        </div>

                        {/* Match Value */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Match Value</label>
                            {formRuleType === "channel_default" ? (
                                <select
                                    value={formMatchValue}
                                    onChange={(e) => setFormMatchValue(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select channel...</option>
                                    <option value="telegram">Telegram</option>
                                    <option value="webchat">Webchat</option>
                                    <option value="whatsapp">WhatsApp</option>
                                    <option value="api">API</option>
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={formMatchValue}
                                    onChange={(e) => setFormMatchValue(e.target.value)}
                                    placeholder={
                                        formRuleType === "contact"
                                            ? "e.g. 123456789"
                                            : formRuleType === "group"
                                              ? "e.g. -1001234567890"
                                              : "e.g. support|help|billing"
                                    }
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            )}
                        </div>

                        {/* Agent */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Route to Agent</label>
                            <select
                                value={formAgentId}
                                onChange={(e) => setFormAgentId(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {agents.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Priority */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                            <input
                                type="number"
                                min="1"
                                value={formPriority}
                                onChange={(e) => setFormPriority(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="text-xs text-slate-400 mt-1">Lower number = higher priority. Default: 100</p>
                        </div>

                        {/* Description */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Description (optional)</label>
                            <input
                                type="text"
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                placeholder="e.g. Route VIP customer to Sales agent"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mt-5">
                        <button
                            onClick={handleSubmit}
                            disabled={pending}
                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {pending ? "Saving..." : editingId ? "Update Rule" : "Create Rule"}
                        </button>
                        <button
                            onClick={resetForm}
                            className="px-4 py-2 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Rules Table */}
            {rules.length === 0 && !showForm ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                    <p className="text-slate-500 text-sm">No routing rules yet. Click &quot;Add Rule&quot; to create your first rule.</p>
                </div>
            ) : rules.length > 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="text-left px-4 py-3 font-medium text-slate-600">Priority</th>
                                    <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                                    <th className="text-left px-4 py-3 font-medium text-slate-600">Match Value</th>
                                    <th className="text-left px-4 py-3 font-medium text-slate-600">Agent</th>
                                    <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
                                    <th className="text-left px-4 py-3 font-medium text-slate-600">Enabled</th>
                                    <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map((rule) => (
                                    <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="px-4 py-3 font-mono text-slate-700">{rule.priority}</td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                                                {RULE_TYPE_LABELS[rule.ruleType] || rule.ruleType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-slate-600 max-w-[200px] truncate">
                                            {rule.matchValue}
                                        </td>
                                        <td className="px-4 py-3 text-slate-800">{rule.agentName}</td>
                                        <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">
                                            {rule.description || "-"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleToggle(rule.id)}
                                                disabled={pending}
                                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                                    rule.enabled ? "bg-indigo-600" : "bg-slate-200"
                                                }`}
                                            >
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                                        rule.enabled ? "translate-x-4" : "translate-x-0"
                                                    }`}
                                                />
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 text-right space-x-2">
                                            <button
                                                onClick={() => startEdit(rule)}
                                                className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                                            >
                                                Edit
                                            </button>
                                            {confirmDelete === rule.id ? (
                                                <>
                                                    <button
                                                        onClick={() => handleDelete(rule.id)}
                                                        disabled={pending}
                                                        className="text-red-600 hover:text-red-800 text-xs font-medium"
                                                    >
                                                        Confirm
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDelete(null)}
                                                        className="text-slate-500 hover:text-slate-700 text-xs font-medium"
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmDelete(rule.id)}
                                                    className="text-red-600 hover:text-red-800 text-xs font-medium"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800">
                    <span className="font-semibold">How routing works:</span> When a message arrives, rules are checked in priority order. The first rule that matches determines which agent handles the message. If no rule matches, the channel&apos;s default agent is used.
                </p>
            </div>
        </div>
    );
}
