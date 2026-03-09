"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BUILTIN_SKILLS } from "../../../../utils/skills-registry";
import { updateAgentSkillConfigAction } from "./actions";

interface CustomSkill {
    name: string;
    description: string;
    body: string;
}

interface SkillConfig {
    enabledBuiltIn?: string[];
    disabledBuiltIn?: string[];
    customSkills?: CustomSkill[];
}

interface Props {
    agentId: string;
    skillConfig: SkillConfig;
    defaultSkills: string[];
}

export default function SkillsEditor({ agentId, skillConfig, defaultSkills }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [config, setConfig] = useState<SkillConfig>(skillConfig);
    const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });

    // Custom skill editor state
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [editingCustomIdx, setEditingCustomIdx] = useState<number | null>(null);
    const [customName, setCustomName] = useState("");
    const [customDescription, setCustomDescription] = useState("");
    const [customBody, setCustomBody] = useState("");

    const hasAdminDefaults = defaultSkills.length > 0;

    function isSkillEnabled(name: string): boolean {
        if (config.disabledBuiltIn?.includes(name)) return false;
        if (config.enabledBuiltIn?.includes(name)) return true;
        // Fall back to admin defaults
        if (hasAdminDefaults) return defaultSkills.includes(name);
        // No admin defaults = all enabled
        return true;
    }

    function isOverridden(name: string): boolean {
        return (config.enabledBuiltIn?.includes(name) || config.disabledBuiltIn?.includes(name)) ?? false;
    }

    function toggleSkill(name: string) {
        setConfig((prev) => {
            const next = { ...prev };
            const enabled = isSkillEnabled(name);

            // Remove from both lists first
            next.enabledBuiltIn = (next.enabledBuiltIn ?? []).filter((n) => n !== name);
            next.disabledBuiltIn = (next.disabledBuiltIn ?? []).filter((n) => n !== name);

            if (enabled) {
                // Currently on → turn off
                next.disabledBuiltIn = [...(next.disabledBuiltIn ?? []), name];
            } else {
                // Currently off → turn on
                next.enabledBuiltIn = [...(next.enabledBuiltIn ?? []), name];
            }
            return next;
        });
    }

    function resetOverride(name: string) {
        setConfig((prev) => ({
            ...prev,
            enabledBuiltIn: (prev.enabledBuiltIn ?? []).filter((n) => n !== name),
            disabledBuiltIn: (prev.disabledBuiltIn ?? []).filter((n) => n !== name),
        }));
    }

    function saveCustomSkill() {
        if (!customName.trim() || !customDescription.trim() || !customBody.trim()) return;

        setConfig((prev) => {
            const customs = [...(prev.customSkills ?? [])];
            const skill = { name: customName.trim(), description: customDescription.trim(), body: customBody.trim() };
            if (editingCustomIdx !== null) {
                customs[editingCustomIdx] = skill;
            } else {
                customs.push(skill);
            }
            return { ...prev, customSkills: customs };
        });
        resetCustomForm();
    }

    function editCustomSkill(idx: number) {
        const skill = (config.customSkills ?? [])[idx];
        if (!skill) return;
        setEditingCustomIdx(idx);
        setCustomName(skill.name);
        setCustomDescription(skill.description);
        setCustomBody(skill.body);
        setShowCustomForm(true);
    }

    function deleteCustomSkill(idx: number) {
        setConfig((prev) => ({
            ...prev,
            customSkills: (prev.customSkills ?? []).filter((_, i) => i !== idx),
        }));
    }

    function resetCustomForm() {
        setShowCustomForm(false);
        setEditingCustomIdx(null);
        setCustomName("");
        setCustomDescription("");
        setCustomBody("");
    }

    function handleSave() {
        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("skillConfig", JSON.stringify(config));

        startTransition(async () => {
            const result = await updateAgentSkillConfigAction(fd);
            setStatus({
                type: result.success ? "success" : "error",
                message: result.message ?? "",
            });
            if (result.success) {
                router.refresh();
            }
        });
    }

    const categories = [
        { id: "core" as const, label: "Core" },
        { id: "productivity" as const, label: "Productivity" },
        { id: "meta" as const, label: "Meta" },
    ];

    return (
        <div className="space-y-6">
            {/* Built-in Skills */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-900">Built-in Skills</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        Skills teach the agent <em>how</em> to use tools effectively. Toggle skills on or off for this agent.
                        {hasAdminDefaults && " Gray background indicates inherited from admin defaults."}
                    </p>
                </div>
                <div className="p-6 space-y-6">
                    {categories.map((cat) => {
                        const skills = BUILTIN_SKILLS.filter((s) => s.category === cat.id);
                        if (skills.length === 0) return null;
                        return (
                            <div key={cat.id}>
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{cat.label}</h3>
                                <div className="grid gap-3">
                                    {skills.map((skill) => {
                                        const enabled = isSkillEnabled(skill.name);
                                        const overridden = isOverridden(skill.name);
                                        return (
                                            <div
                                                key={skill.name}
                                                className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                                                    enabled
                                                        ? "border-indigo-200 bg-indigo-50/50"
                                                        : "border-slate-200 bg-slate-50/50"
                                                }`}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-slate-900">{skill.name}</span>
                                                        {overridden && (
                                                            <button
                                                                onClick={() => resetOverride(skill.name)}
                                                                className="text-xs text-indigo-500 hover:text-indigo-700"
                                                            >
                                                                reset
                                                            </button>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-0.5">{skill.description}</p>
                                                </div>
                                                <button
                                                    onClick={() => toggleSkill(skill.name)}
                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                        enabled ? "bg-indigo-600" : "bg-slate-300"
                                                    }`}
                                                >
                                                    <span
                                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                            enabled ? "translate-x-6" : "translate-x-1"
                                                        }`}
                                                    />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Custom Skills */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-900">Custom Skills</h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Add domain-specific skills that teach the agent specialized workflows.
                        </p>
                    </div>
                    {!showCustomForm && (
                        <button
                            onClick={() => setShowCustomForm(true)}
                            className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                        >
                            + Add Skill
                        </button>
                    )}
                </div>
                <div className="p-6">
                    {/* Custom skills list */}
                    {(config.customSkills ?? []).length > 0 && (
                        <div className="space-y-3 mb-4">
                            {(config.customSkills ?? []).map((skill, idx) => (
                                <div key={idx} className="flex items-start justify-between px-4 py-3 rounded-lg border border-slate-200 bg-slate-50/50">
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium text-slate-900">{skill.name}</span>
                                        <p className="text-xs text-slate-500 mt-0.5">{skill.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-3">
                                        <button
                                            onClick={() => editCustomSkill(idx)}
                                            className="text-xs text-slate-500 hover:text-indigo-600"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => deleteCustomSkill(idx)}
                                            className="text-xs text-slate-500 hover:text-red-600"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {(config.customSkills ?? []).length === 0 && !showCustomForm && (
                        <p className="text-sm text-slate-400">No custom skills yet.</p>
                    )}

                    {/* Custom skill form */}
                    {showCustomForm && (
                        <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Skill Name</label>
                                <input
                                    type="text"
                                    value={customName}
                                    onChange={(e) => setCustomName(e.target.value)}
                                    placeholder="e.g., invoice-generation"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Trigger Description</label>
                                <input
                                    type="text"
                                    value={customDescription}
                                    onChange={(e) => setCustomDescription(e.target.value)}
                                    placeholder="e.g., Generate invoices for clients using ERPNext"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Skill Body (Markdown)</label>
                                <textarea
                                    value={customBody}
                                    onChange={(e) => setCustomBody(e.target.value)}
                                    rows={10}
                                    placeholder={"# Skill Instructions\n\n## When to Use\n- ...\n\n## How to Do It\n- ..."}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800 resize-y"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={saveCustomSkill}
                                    disabled={!customName.trim() || !customDescription.trim() || !customBody.trim()}
                                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                >
                                    {editingCustomIdx !== null ? "Update Skill" : "Add Skill"}
                                </button>
                                <button
                                    onClick={resetCustomForm}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Save button */}
            <div className="flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={pending}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                    {pending ? "Saving..." : "Save Skills"}
                </button>
                {status.type === "success" && (
                    <span className="text-sm text-emerald-600">{status.message || "Saved!"}</span>
                )}
                {status.type === "error" && (
                    <span className="text-sm text-red-600">{status.message || "Failed to save."}</span>
                )}
            </div>
        </div>
    );
}
