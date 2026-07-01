"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createMcpServerAction } from "./actions";

export default function CreateMcpServerModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const modalRef = useRef<HTMLDivElement>(null);

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
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-mcp-modal-title"
        >
            <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setIsOpen(false)}
            />
            <div ref={modalRef} className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                <h2 id="create-mcp-modal-title" className="text-lg font-semibold text-slate-900 mb-4">
                    Add MCP Server
                </h2>

                {error && (
                    <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="mcp-server-name" className="block text-sm font-medium text-slate-700 mb-1">
                            Server Name
                        </label>
                        <input
                            id="mcp-server-name"
                            name="name"
                            type="text"
                            required
                            placeholder="e.g., ERPNext Production"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div>
                        <label htmlFor="mcp-server-url" className="block text-sm font-medium text-slate-700 mb-1">
                            Server URL
                        </label>
                        <input
                            id="mcp-server-url"
                            name="url"
                            type="url"
                            required
                            placeholder="https://mcp.example.com/sse"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div>
                        <label htmlFor="mcp-server-authHeaders" className="block text-sm font-medium text-slate-700 mb-1">
                            Auth Headers (JSON, optional)
                        </label>
                        <textarea
                            id="mcp-server-authHeaders"
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
