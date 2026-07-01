"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createUserAction } from "./actions";
import { ui } from "../../../components/admin/ui";

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
            <button onClick={() => setIsOpen(true)} className={ui.btnPrimary}>
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
            <div ref={modalRef} className="relative bg-[#0C0C0E] border border-[#242429] rounded-lg w-full max-w-lg mx-4 p-6">
                {credentials ? (
                    /* Success state — show credentials */
                    <div>
                        <h2 id="create-user-modal-title" className="text-lg font-semibold text-[#EDEDED] mb-4">
                            User Created
                        </h2>
                        <div className="space-y-3 bg-[#3FB950]/10 border border-[#3FB950]/40 rounded-lg p-4">
                            <div>
                                <p className={ui.labelMicro}>
                                    Email
                                </p>
                                <p className="text-[13px] font-sans text-[#EDEDED] mt-1">
                                    {credentials.email}
                                </p>
                            </div>
                            <div>
                                <p className={ui.labelMicro}>
                                    Temporary Password
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <code className="text-[13px] font-sans bg-[#0C0C0E] px-2 py-1 rounded border border-[#3FB950]/40 text-[#EDEDED]">
                                        {credentials.password}
                                    </code>
                                    <button
                                        onClick={() =>
                                            navigator.clipboard.writeText(
                                                credentials.password
                                            )
                                        }
                                        className="text-[13px] font-medium text-[#3FB950] hover:text-[#3FB950]/80 transition-colors"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                            <p className="text-[11px] text-[#3FB950]">
                                User will be prompted to change their password on
                                first login.
                            </p>
                        </div>
                        <div className="flex justify-end mt-4">
                            <button onClick={handleClose} className={ui.btnPrimary}>
                                Done
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Form state */
                    <div>
                        <h2 id="create-user-modal-title" className="text-lg font-semibold text-[#EDEDED] mb-4">
                            Create User
                        </h2>

                        {error && (
                            <div role="alert" className="mb-4 p-3 bg-[#F0503C]/10 border border-[#F0503C]/40 rounded-lg text-[13px] text-[#F0503C]">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="create-user-email" className={ui.label}>
                                    Email
                                </label>
                                <input
                                    id="create-user-email"
                                    name="email"
                                    type="email"
                                    required
                                    className={ui.input}
                                />
                            </div>

                            <div>
                                <label htmlFor="create-user-name" className={ui.label}>
                                    Name
                                </label>
                                <input
                                    id="create-user-name"
                                    name="name"
                                    type="text"
                                    required
                                    className={ui.input}
                                />
                            </div>

                            <div>
                                <label htmlFor="create-user-role" className={ui.label}>
                                    Role
                                </label>
                                <select
                                    id="create-user-role"
                                    name="role"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    className={ui.input}
                                >
                                    <option value="TENANT">Tenant User</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>

                            {role === "TENANT" && (
                                <div>
                                    <label htmlFor="create-user-tenantId" className={ui.label}>
                                        Workspace
                                    </label>
                                    <select
                                        id="create-user-tenantId"
                                        name="tenantId"
                                        required
                                        className={ui.input}
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
                                    className={ui.btnSecondary}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className={ui.btnPrimary}
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
