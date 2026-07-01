"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createUserAction } from "./actions";

interface Tenant {
    id: string;
    name: string;
}

export default function CreateUserModal({
    tenants,
}: {
    tenants: Tenant[];
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [role, setRole] = useState("TENANT");
    const [credentials, setCredentials] = useState<{
        email: string;
        password: string;
    } | null>(null);
    const router = useRouter();
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
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

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        const result = await createUserAction(formData);

        setLoading(false);
        if (result.success && result.credentials) {
            setCredentials(result.credentials);
            router.refresh();
        } else {
            setError(result.message ?? "Failed to create user.");
        }
    };

    const handleClose = () => {
        setIsOpen(false);
        setCredentials(null);
        setError("");
        setRole("TENANT");
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors"
            >
                Create User
            </button>
        );
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-modal-title"
        >
            <div
                className="absolute inset-0 bg-black/40"
                onClick={handleClose}
            />
            <div ref={modalRef} className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
                {credentials ? (
                    /* Success state — show credentials */
                    <div>
                        <h2 id="create-user-modal-title" className="text-lg font-semibold text-slate-900 mb-4">
                            User Created
                        </h2>
                        <div className="space-y-3 bg-green-50 border border-green-200 rounded-lg p-4">
                            <div>
                                <p className="text-xs font-medium text-green-700 uppercase tracking-wide">
                                    Email
                                </p>
                                <p className="text-sm font-mono text-green-900">
                                    {credentials.email}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-green-700 uppercase tracking-wide">
                                    Temporary Password
                                </p>
                                <div className="flex items-center gap-2">
                                    <code className="text-sm font-mono bg-white px-2 py-1 rounded border border-green-200 text-green-900">
                                        {credentials.password}
                                    </code>
                                    <button
                                        onClick={() =>
                                            navigator.clipboard.writeText(
                                                credentials.password
                                            )
                                        }
                                        className="text-xs text-green-700 hover:text-green-900 font-medium"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-green-600">
                                User will be prompted to change their password on
                                first login.
                            </p>
                        </div>
                        <div className="flex justify-end mt-4">
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Form state */
                    <div>
                        <h2 id="create-user-modal-title" className="text-lg font-semibold text-slate-900 mb-4">
                            Create User
                        </h2>

                        {error && (
                            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="create-user-email" className="block text-sm font-medium text-slate-700 mb-1">
                                    Email
                                </label>
                                <input
                                    id="create-user-email"
                                    name="email"
                                    type="email"
                                    required
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                            </div>

                            <div>
                                <label htmlFor="create-user-name" className="block text-sm font-medium text-slate-700 mb-1">
                                    Name
                                </label>
                                <input
                                    id="create-user-name"
                                    name="name"
                                    type="text"
                                    required
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                            </div>

                            <div>
                                <label htmlFor="create-user-role" className="block text-sm font-medium text-slate-700 mb-1">
                                    Role
                                </label>
                                <select
                                    id="create-user-role"
                                    name="role"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                                >
                                    <option value="TENANT">Tenant User</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>

                            {role === "TENANT" && (
                                <div>
                                    <label htmlFor="create-user-tenantId" className="block text-sm font-medium text-slate-700 mb-1">
                                        Workspace
                                    </label>
                                    <select
                                        id="create-user-tenantId"
                                        name="tenantId"
                                        required
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                                    >
                                        <option value="">
                                            Select a workspace...
                                        </option>
                                        {tenants.map((t) => (
                                            <option key={t.id} value={t.id}>
                                                {t.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
                                >
                                    {loading ? "Creating..." : "Create User"}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
