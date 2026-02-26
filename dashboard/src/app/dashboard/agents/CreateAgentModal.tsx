"use client";

import { useState } from "react";
import { createAgentProfileAction } from "./actions";
import { PROVIDERS, DEFAULT_MODEL_ID } from "../../../utils/models";

export default function CreateAgentModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm shadow-sm"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create Persona
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden transform transition-all my-8">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-lg font-semibold text-gray-900">Define AI Persona</h3>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {error && (
                                <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100 flex items-start gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <span>{error}</span>
                                </div>
                            )}

                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Agent Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    required
                                    placeholder="e.g. Acme IT Support Bot"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-gray-900"
                                />
                                <p className="mt-1 text-xs text-gray-500">A friendly, internal name for this agent.</p>
                            </div>

                            <div>
                                <label htmlFor="modelId" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Model
                                </label>
                                <select
                                    id="modelId"
                                    name="modelId"
                                    defaultValue={DEFAULT_MODEL_ID}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-gray-900 bg-white"
                                >
                                    {PROVIDERS.map((provider) => (
                                        <optgroup key={provider.id} label={provider.name}>
                                            {provider.models.map((model) => (
                                                <option key={model.id} value={model.id}>
                                                    {model.displayName} ({model.category})
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                <p className="mt-1 text-xs text-gray-500">Select the LLM that powers this agent. Requires a configured API key for the provider.</p>
                            </div>

                            <div>
                                <label htmlFor="systemPrompt" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Initial Soul (System Prompt)
                                </label>
                                <textarea
                                    id="systemPrompt"
                                    name="systemPrompt"
                                    rows={5}
                                    placeholder={`You are a helpful IT support assistant for Acme Corp. You must always maintain a professional tone.\n\nWhen asked to troubleshoot, verify the employee's ID first...`}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-gray-900 resize-y"
                                ></textarea>
                                <p className="mt-1.5 text-xs text-gray-500">Seeds SOUL.md in the agent's workspace. You can edit it later in the workspace editor.</p>
                            </div>

                            <div className="flex items-start bg-red-50/50 p-4 rounded-lg border border-red-100">
                                <div className="flex items-center h-5">
                                    <input
                                        id="dockerSandboxEnabled"
                                        name="dockerSandboxEnabled"
                                        type="checkbox"
                                        value="true"
                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-2"
                                    />
                                </div>
                                <div className="ml-3 text-sm">
                                    <label htmlFor="dockerSandboxEnabled" className="font-medium text-gray-900">
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
                                    disabled={loading}
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
