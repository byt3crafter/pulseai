"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetPasswordAction, deleteUserAction } from "./actions";
import CreateUserModal from "./CreateUserModal";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { ui, PageHeader, Panel, Badge } from "../../../components/admin/ui";

interface User {
    id: string;
    name: string | null;
    email: string;
    role: string;
    tenantId: string | null;
    tenantName: string | null;
    mustChangePassword: boolean;
    lastLoginAt: string | null;
    createdAt: string;
}

interface Tenant {
    id: string;
    name: string;
}

interface Props {
    users: User[];
    tenants: Tenant[];
}

export default function UsersClient({ users, tenants }: Props) {
    const router = useRouter();
    const [actionUserId, setActionUserId] = useState<string | null>(null);
    const [tempPassword, setTempPassword] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

    const handleResetPassword = async (userId: string) => {
        const result = await resetPasswordAction(userId);
        if (result.success && result.tempPassword) {
            setTempPassword(result.tempPassword);
            setActionUserId(userId);
        } else {
            setError(result.message ?? "Failed to reset password.");
        }
    };

    const handleDelete = async () => {
        if (!deleteUserId) return;
        const result = await deleteUserAction(deleteUserId);
        setDeleteUserId(null);
        if (result.success) {
            setActionUserId(null);
            router.refresh();
        } else {
            setError(result.message ?? "Failed to delete user.");
        }
    };

    return (
        <div className={ui.page}>
            <PageHeader
                title="User Management"
                subtitle="Manage platform users and their access."
                action={<CreateUserModal tenants={tenants} />}
            />

            {error && (
                <div role="alert" className="p-3 bg-[#F0503C]/10 border border-[#F0503C]/40 rounded-lg text-[13px] text-[#F0503C] flex items-center justify-between gap-2">
                    <span>{error}</span>
                    <button
                        onClick={() => setError("")}
                        className="text-[#F0503C] hover:text-[#F0503C]/80"
                        aria-label="Dismiss error"
                    >
                        &times;
                    </button>
                </div>
            )}

            {/* Temp password display */}
            {tempPassword && actionUserId && (
                <div className="p-4 bg-[#8B5CF6]/10 border border-[#8B5CF6]/40 rounded-lg">
                    <p className="text-[13px] font-medium text-[#8B5CF6]">
                        Temporary password generated:
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                        <code className="text-[13px] font-sans bg-[#0C0C0E] px-3 py-1 rounded border border-[#8B5CF6]/40 text-[#EDEDED]">
                            {tempPassword}
                        </code>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(tempPassword);
                            }}
                            className={ui.btnGhost}
                        >
                            Copy
                        </button>
                        <button
                            onClick={() => {
                                setTempPassword(null);
                                setActionUserId(null);
                            }}
                            className="text-[13px] text-[#8A8A90] hover:text-[#B5B5BA] ml-2 transition-colors"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            <Panel bodyClassName="">
                <div className="overflow-x-auto">
                    <table className={ui.table}>
                        <thead>
                            <tr>
                                <th className={ui.th}>User</th>
                                <th className={ui.th}>Role</th>
                                <th className={ui.th}>Workspace</th>
                                <th className={ui.th}>Last Login</th>
                                <th className={ui.th}>Status</th>
                                <th className={ui.thRight}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id} className={ui.row}>
                                    <td className={ui.td}>
                                        <div className="text-[13px] font-medium text-[#EDEDED]">
                                            {user.name || "—"}
                                        </div>
                                        <div className="text-[11px] text-[#5A5A61] mt-0.5">
                                            {user.email}
                                        </div>
                                    </td>
                                    <td className={ui.td}>
                                        <Badge variant={user.role === "ADMIN" ? "accent" : "neutral"}>
                                            {user.role}
                                        </Badge>
                                    </td>
                                    <td className={ui.tdMuted}>
                                        {user.tenantName || "—"}
                                    </td>
                                    <td className={ui.tdMuted}>
                                        {user.lastLoginAt
                                            ? new Date(user.lastLoginAt).toLocaleDateString()
                                            : "Never"}
                                    </td>
                                    <td className={ui.td}>
                                        {user.mustChangePassword ? (
                                            <Badge variant="accent">Pending Setup</Badge>
                                        ) : (
                                            <Badge variant="success">Active</Badge>
                                        )}
                                    </td>
                                    <td className={ui.tdRight}>
                                        <div className="flex items-center justify-end gap-4">
                                            <button
                                                onClick={() => handleResetPassword(user.id)}
                                                className={ui.btnGhost}
                                            >
                                                Reset Password
                                            </button>
                                            <button
                                                onClick={() => setDeleteUserId(user.id)}
                                                className="text-[13px] font-medium text-[#F0503C] hover:text-[#F0503C]/80 transition-colors focus-visible:outline-none"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-[#5A5A61]">
                                        No users found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <ConfirmDialog
                open={!!deleteUserId}
                title="Delete User"
                message="This will permanently delete this user account. This action cannot be undone."
                confirmLabel="Delete User"
                variant="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeleteUserId(null)}
            />
        </div>
    );
}
