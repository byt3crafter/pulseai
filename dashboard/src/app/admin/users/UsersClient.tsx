"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetPasswordAction, deleteUserAction } from "./actions";
import CreateUserModal from "./CreateUserModal";
import ConfirmDialog from "../../../components/ConfirmDialog";

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
        <div className="p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#EDEDED] tracking-tight">
                        User Management
                    </h1>
                    <p className="text-sm text-[#8A8A90] mt-1">
                        Manage platform users and their access.
                    </p>
                </div>
                <CreateUserModal tenants={tenants} />
            </div>

            {error && (
                <div className="mb-4 p-3 bg-[#F0503C]/10 border border-[#F0503C]/40 rounded-lg text-sm text-[#F0503C]">
                    {error}
                    <button
                        onClick={() => setError("")}
                        className="ml-2 text-[#F0503C] hover:text-[#F0503C]/80"
                    >
                        &times;
                    </button>
                </div>
            )}

            {/* Temp password display */}
            {tempPassword && actionUserId && (
                <div className="mb-4 p-4 bg-[#8B5CF6]/10 border border-[#8B5CF6]/40 rounded-lg">
                    <p className="text-sm font-medium text-[#8B5CF6]">
                        Temporary password generated:
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm font-sans bg-[#0C0C0E] px-3 py-1 rounded border border-[#8B5CF6]/40">
                            {tempPassword}
                        </code>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(tempPassword);
                            }}
                            className="text-xs text-[#8B5CF6] hover:text-[#A78BFA] font-medium"
                        >
                            Copy
                        </button>
                        <button
                            onClick={() => {
                                setTempPassword(null);
                                setActionUserId(null);
                            }}
                            className="text-xs text-[#8A8A90] hover:text-[#B5B5BA] ml-2"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-[#0C0C0E] rounded-xl border border-[#242429]">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[#101012] text-[#5A5A61] text-xs uppercase tracking-wider border-b border-[#1C1C1F]">
                            <th className="px-6 py-4 font-medium">User</th>
                            <th className="px-6 py-4 font-medium">Role</th>
                            <th className="px-6 py-4 font-medium">Workspace</th>
                            <th className="px-6 py-4 font-medium">Last Login</th>
                            <th className="px-6 py-4 font-medium">Status</th>
                            <th className="px-6 py-4 font-medium text-right">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1C1C1F]">
                        {users.map((user) => (
                            <tr
                                key={user.id}
                                className="hover:bg-[#101012] transition-colors"
                            >
                                <td className="px-6 py-4">
                                    <div className="font-medium text-[#EDEDED]">
                                        {user.name || "—"}
                                    </div>
                                    <div className="text-xs text-[#8A8A90] mt-0.5">
                                        {user.email}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                            user.role === "ADMIN"
                                                ? "bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/40"
                                                : "bg-[#141417] text-[#8A8A90] border-[#242429]"
                                        }`}
                                    >
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-[#B5B5BA]">
                                    {user.tenantName || "—"}
                                </td>
                                <td className="px-6 py-4 text-sm text-[#8A8A90]">
                                    {user.lastLoginAt
                                        ? new Date(
                                              user.lastLoginAt
                                          ).toLocaleDateString()
                                        : "Never"}
                                </td>
                                <td className="px-6 py-4">
                                    {user.mustChangePassword ? (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/40">
                                            Pending Setup
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-xs text-[#3FB950]">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" />
                                            Active
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() =>
                                                handleResetPassword(user.id)
                                            }
                                            className="text-xs font-medium text-[#8B5CF6] hover:text-[#A78BFA] px-2 py-1 rounded hover:bg-[#8B5CF6]/10"
                                        >
                                            Reset Password
                                        </button>
                                        <button
                                            onClick={() =>
                                                setDeleteUserId(user.id)
                                            }
                                            className="text-xs font-medium text-[#F0503C] hover:text-[#F0503C]/80 px-2 py-1 rounded hover:bg-[#F0503C]/10"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr>
                                <td
                                    colSpan={6}
                                    className="px-6 py-12 text-center text-sm text-[#5A5A61]"
                                >
                                    No users found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

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
