"use client";

import { useState, useTransition } from "react";
import { PlusIcon, InformationCircleIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { PageHeader, Card, CardHeader, EmptyState, Toggle } from "../../../../components/dashboard/ui";
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
        <div className="p-4 sm:p-5 lg:p-6 max-w-[1060px] mx-auto">
            <PageHeader
                title="Message Routing"
                description="Route incoming messages to different agents based on rules. Rules are evaluated in priority order (lowest number first). The first matching rule wins."
                action={
                    !showForm && (
                        <button
                            onClick={() => { resetForm(); setShowForm(true); }}
                            className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap"
                        >
                            <PlusIcon className="h-4 w-4" aria-hidden="true" /> Add rule
                        </button>
                    )
                }
            />

            <div className="space-y-6">
            {/* Error/success message */}
            {message && (
                <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-sm text-red-400">{message}</p>
                </div>
            )}

            {/* Add/Edit Form */}
            {showForm && (
                <Card>
                    <CardHeader title={editingId ? "Edit rule" : "New routing rule"} />
                    <div className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Rule Type */}
                        <div>
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Rule Type</label>
                            <select
                                value={formRuleType}
                                onChange={(e) => setFormRuleType(e.target.value)}
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-pulse-panel text-pulse-text"
                            >
                                <option value="contact">Contact</option>
                                <option value="group">Group</option>
                                <option value="keyword">Keyword (Regex)</option>
                                <option value="channel_default">Channel Default</option>
                            </select>
                            <p className="text-xs text-pulse-faint mt-1">{RULE_TYPE_HELP[formRuleType]}</p>
                        </div>

                        {/* Match Value */}
                        <div>
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Match Value</label>
                            {formRuleType === "channel_default" ? (
                                <select
                                    value={formMatchValue}
                                    onChange={(e) => setFormMatchValue(e.target.value)}
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-pulse-panel text-pulse-text"
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
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                                />
                            )}
                        </div>

                        {/* Agent */}
                        <div>
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Route to Agent</label>
                            <select
                                value={formAgentId}
                                onChange={(e) => setFormAgentId(e.target.value)}
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-pulse-panel text-pulse-text"
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
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Priority</label>
                            <input
                                type="number"
                                min="1"
                                value={formPriority}
                                onChange={(e) => setFormPriority(e.target.value)}
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-pulse-panel text-pulse-text"
                            />
                            <p className="text-xs text-pulse-faint mt-1">Lower number = higher priority. Default: 100</p>
                        </div>

                        {/* Description */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Description (optional)</label>
                            <input
                                type="text"
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                placeholder="e.g. Route VIP customer to Sales agent"
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mt-5">
                        <button
                            onClick={handleSubmit}
                            disabled={pending}
                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            {pending ? "Saving..." : editingId ? "Update rule" : "Create rule"}
                        </button>
                        <button
                            onClick={resetForm}
                            className="px-4 py-2 text-pulse-muted text-sm font-medium rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            Cancel
                        </button>
                    </div>
                    </div>
                </Card>
            )}

            {/* Rules Table */}
            {rules.length === 0 && !showForm ? (
                <Card>
                    <EmptyState
                        icon={ArrowsRightLeftIcon}
                        title="No routing rules yet"
                        description={'Click "Add rule" to create your first rule.'}
                    />
                </Card>
            ) : rules.length > 0 ? (
                <Card>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-xs uppercase tracking-wide text-pulse-faint border-b border-pulse-border-subtle">
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Priority</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Type</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Match value</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Agent</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Description</th>
                                    <th scope="col" className="px-4 py-3 text-left font-medium">Enabled</th>
                                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map((rule) => (
                                    <tr key={rule.id} className="border-b border-pulse-border-subtle last:border-b-0 hover:bg-pulse-hover">
                                        <td className="px-4 py-3 align-top font-mono text-pulse-text-soft">{rule.priority}</td>
                                        <td className="px-4 py-3 align-top">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-pulse-panel-alt text-pulse-text-soft">
                                                {RULE_TYPE_LABELS[rule.ruleType] || rule.ruleType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 align-top font-mono text-xs text-pulse-muted max-w-[200px] truncate">
                                            {rule.matchValue}
                                        </td>
                                        <td className="px-4 py-3 align-top text-pulse-text-soft">{rule.agentName}</td>
                                        <td className="px-4 py-3 align-top text-pulse-muted max-w-[200px] truncate">
                                            {rule.description || "-"}
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <Toggle
                                                checked={rule.enabled}
                                                onChange={() => handleToggle(rule.id)}
                                                label={rule.enabled ? "Disable rule" : "Enable rule"}
                                                disabled={pending}
                                            />
                                        </td>
                                        <td className="px-4 py-3 align-top text-right space-x-2 whitespace-nowrap">
                                            <button
                                                onClick={() => startEdit(rule)}
                                                className="text-indigo-500 hover:text-indigo-400 text-xs font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                            >
                                                Edit
                                            </button>
                                            {confirmDelete === rule.id ? (
                                                <>
                                                    <button
                                                        onClick={() => handleDelete(rule.id)}
                                                        disabled={pending}
                                                        className="text-red-500 hover:text-red-400 text-xs font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                                    >
                                                        Confirm
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDelete(null)}
                                                        className="text-pulse-muted hover:text-pulse-text-soft text-xs font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmDelete(rule.id)}
                                                    className="text-red-500 hover:text-red-400 text-xs font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
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
                </Card>
            ) : null}

            {/* Info note */}
            <div className="flex items-start gap-2.5 rounded-lg border border-pulse-border-subtle bg-pulse-panel-alt/60 px-4 py-3">
                <InformationCircleIcon className="w-4 h-4 text-pulse-faint flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-pulse-muted">
                    <span className="font-medium text-pulse-text-soft">How routing works:</span> When a message arrives, rules are checked in priority order. The first rule that matches determines which agent handles the message. If no rule matches, the channel&apos;s default agent is used.
                </p>
            </div>
            </div>
        </div>
    );
}
