"use client";

import { useState, useEffect, useRef } from "react";
import { createAgentProfileAction, generatePersonaAction } from "./actions";
import { PROVIDERS, DEFAULT_MODEL_ID } from "../../../utils/models";

export default function CreateAgentModal({ connectedProviders }: { connectedProviders: string[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    // Controlled Soul + "write it for me" assistant
    const [soul, setSoul] = useState("");
    const [assistOpen, setAssistOpen] = useState(false);
    const [role, setRole] = useState("");
    const [company, setCompany] = useState("");
    const [tone, setTone] = useState("Professional");
    const [generating, setGenerating] = useState(false);
    const [genError, setGenError] = useState<string | null>(null);

    const handleGenerate = async () => {
        setGenError(null);
        if (!role.trim()) { setGenError("Tell me what this agent should do."); return; }
        setGenerating(true);
        const name = (document.getElementById("create-agent-name") as HTMLInputElement | null)?.value || "";
        const model = (document.getElementById("create-agent-modelId") as HTMLSelectElement | null)?.value || "";
        const res = await generatePersonaAction({ name, role, company, tone, model });
        if (res.success && res.text) { setSoul(res.text); setAssistOpen(false); }
        else setGenError(res.message || "Couldn't generate.");
        setGenerating(false);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const result = await createAgentProfileAction(formData);

        if (!result.success && result.message) {
            setError(result.message);
        } else {
            setIsOpen(false);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const modal = modalRef.current;
        if (!modal) return;
        const focusable = modal.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        first?.focus();
        const trap = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        };
        modal.addEventListener("keydown", trap);
        return () => modal.removeEventListener("keydown", trap);
    }, [isOpen]);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm shadow-sm"
            >
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create Persona
            </button>

            {isOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="create-agent-modal-title"
                >
                    <div ref={modalRef} className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden transform transition-all my-8">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 id="create-agent-modal-title" className="text-lg font-semibold text-gray-900">Define AI Persona</h3>
                            <button
                                onClick={() => setIsOpen(false)}
                                aria-label="Close"
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {error && (
                                <div role="alert" className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100 flex items-start gap-2">
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <span>{error}</span>
                                </div>
                            )}

                            <div>
                                <label htmlFor="create-agent-name" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Agent Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="create-agent-name"
                                    name="name"
                                    required
                                    placeholder="e.g. Acme IT Support Bot"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-gray-900"
                                />
                                <p className="mt-1 text-xs text-gray-500">A friendly, internal name for this agent.</p>
                            </div>

                            <div>
                                <label htmlFor="create-agent-modelId" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Model
                                </label>
                                {connectedProviders.length > 0 ? (
                                    <>
                                        <select
                                            id="create-agent-modelId"
                                            name="modelId"
                                            defaultValue={
                                                PROVIDERS.filter((p) => connectedProviders.includes(p.id))
                                                    .flatMap((p) => p.models)[0]?.id ?? DEFAULT_MODEL_ID
                                            }
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-gray-900 bg-white"
                                        >
                                            {PROVIDERS.filter((p) => connectedProviders.includes(p.id)).map((provider) => (
                                                <optgroup key={provider.id} label={provider.name}>
                                                    {provider.models.map((model) => (
                                                        <option key={model.id} value={model.id}>
                                                            {model.displayName} ({model.category})
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                        <p className="mt-1 text-xs text-gray-500">Only models from your connected providers are shown.</p>
                                    </>
                                ) : (
                                    <div className="p-3 text-sm text-amber-700 bg-amber-50 rounded-lg border border-amber-200">
                                        No AI providers configured. Add an API key in Settings first.
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label htmlFor="create-agent-systemPrompt" className="block text-sm font-medium text-gray-700">
                                        Initial Soul (System Prompt)
                                    </label>
                                    {connectedProviders.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setAssistOpen((v) => !v)}
                                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M9 4l1.5 3.5L14 9l-3.5 1.5L9 14l-1.5-3.5L4 9l3.5-1.5L9 4zm8 6l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1 1-2.2z"/></svg>
                                            Write it for me
                                        </button>
                                    )}
                                </div>

                                {assistOpen && (
                                    <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 space-y-2.5">
                                        <p className="text-xs text-indigo-800">Answer a couple of things and the AI will draft the persona for you.</p>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">What should this agent do?</label>
                                            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Handle customer support tickets and answer product questions" className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900" />
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Company / context (optional)</label>
                                                <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Runstate, a logistics firm" className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Tone</label>
                                                <select value={tone} onChange={(e) => setTone(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 bg-white">
                                                    <option>Professional</option>
                                                    <option>Friendly</option>
                                                    <option>Concise</option>
                                                    <option>Warm</option>
                                                </select>
                                            </div>
                                        </div>
                                        {genError && <p className="text-xs text-red-600">{genError}</p>}
                                        <button type="button" onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-md px-3 py-1.5">
                                            {generating ? "Generating…" : "Generate persona"}
                                        </button>
                                    </div>
                                )}

                                <textarea
                                    id="create-agent-systemPrompt"
                                    name="systemPrompt"
                                    rows={5}
                                    value={soul}
                                    onChange={(e) => setSoul(e.target.value)}
                                    placeholder={`You are a helpful IT support assistant for Acme Corp. You must always maintain a professional tone.\n\nWhen asked to troubleshoot, verify the employee's ID first...`}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-gray-900 resize-y"
                                ></textarea>
                                <p className="mt-1.5 text-xs text-gray-500">Seeds SOUL.md in the agent's workspace. You can edit it later in the workspace editor.</p>
                            </div>

                            <div className="flex items-start bg-red-50/50 p-4 rounded-lg border border-red-100">
                                <div className="flex items-center h-5">
                                    <input
                                        id="create-agent-dockerSandboxEnabled"
                                        name="dockerSandboxEnabled"
                                        type="checkbox"
                                        value="true"
                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-2"
                                    />
                                </div>
                                <div className="ml-3 text-sm">
                                    <label htmlFor="create-agent-dockerSandboxEnabled" className="font-medium text-gray-900">
                                        Enable Raw Code Execution (Docker Sandbox)
                                    </label>
                                    <p className="text-gray-500 mt-1">
                                        <span className="font-semibold text-red-600">WARNING: </span>
                                        Allows this agent to write and execute python/bash logic on the fly in an isolated Alpine container. Use only if necessary.
                                    </p>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3 justify-end border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || connectedProviders.length === 0}
                                    className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {loading ? 'Creating...' : 'Create Persona'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
