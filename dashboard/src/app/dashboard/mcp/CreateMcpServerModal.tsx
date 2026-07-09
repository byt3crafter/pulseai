"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@heroicons/react/24/outline";
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
                type="button"
                onClick={() => setIsOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap"
            >
                <PlusIcon className="h-4 w-4" aria-hidden="true" /> Add server
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
                className="absolute inset-0 bg-black/50"
                onClick={() => setIsOpen(false)}
            />
            <div ref={modalRef} className="relative bg-pulse-panel border border-pulse-border rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                <h2 id="create-mcp-modal-title" className="text-lg font-semibold text-pulse-text mb-4">
                    Add MCP server
                </h2>

                {error && (
                    <div role="alert" className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="mcp-server-name" className="block text-sm font-medium text-pulse-text-soft mb-1">
                            Server Name
                        </label>
                        <input
                            id="mcp-server-name"
                            name="name"
                            type="text"
                            required
                            placeholder="e.g., ERPNext Production"
                            className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div>
                        <label htmlFor="mcp-server-url" className="block text-sm font-medium text-pulse-text-soft mb-1">
                            Server URL
                        </label>
                        <input
                            id="mcp-server-url"
                            name="url"
                            type="url"
                            required
                            placeholder="https://mcp.example.com/sse"
                            className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div>
                        <label htmlFor="mcp-server-authHeaders" className="block text-sm font-medium text-pulse-text-soft mb-1">
                            Auth Headers (JSON, optional)
                        </label>
                        <textarea
                            id="mcp-server-authHeaders"
                            name="authHeaders"
                            rows={3}
                            placeholder='{"Authorization": "Bearer sk-..."}'
                            className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm font-mono bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="px-4 py-2 text-sm font-medium text-pulse-text-soft bg-pulse-panel border border-pulse-border rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            {loading ? "Creating..." : "Create server"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
