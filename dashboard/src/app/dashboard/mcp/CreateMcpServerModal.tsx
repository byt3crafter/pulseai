"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMcpServerAction } from "./actions";

export default function CreateMcpServerModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        const result = await createMcpServerAction(formData);

        setLoading(false);
        if (result.success) {
            setIsOpen(false);
            router.refresh();
        } else {
            setError(result.message ?? "Failed to create server.");
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors"
            >
                Add MCP Server
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setIsOpen(false)}
            />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    Add MCP Server
                </h2>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Server Name
                        </label>
                        <input
                            name="name"
                            type="text"
                            required
                            placeholder="e.g., ERPNext Production"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Server URL
                        </label>
                        <input
                            name="url"
                            type="url"
                            required
                            placeholder="https://mcp.example.com/sse"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Auth Headers (JSON, optional)
                        </label>
                        <textarea
                            name="authHeaders"
                            rows={3}
                            placeholder='{"Authorization": "Bearer sk-..."}'
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                            {loading ? "Creating..." : "Create Server"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
