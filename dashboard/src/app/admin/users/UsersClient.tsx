"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetPasswordAction, deleteUserAction } from "./actions";
import CreateUserModal from "./CreateUserModal";

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

    const handleResetPassword = async (userId: string) => {
        const result = await resetPasswordAction(userId);
        if (result.success && result.tempPassword) {
            setTempPassword(result.tempPassword);
            setActionUserId(userId);
        } else {
            setError(result.message ?? "Failed to reset password.");
        }
    };

    const handleDelete = async (userId: string) => {
        const result = await deleteUserAction(userId);
        if (result.success) {
            setActionUserId(null);
            router.refresh();
        } else {
            setError(result.message ?? "Failed to delete user.");
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                        User Management
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Manage platform users and their access.
                    </p>
                </div>
                <CreateUserModal tenants={tenants} />
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}
                    <button
                        onClick={() => setError("")}
                        className="ml-2 text-red-500 hover:text-red-700"
                    >
                        &times;
                    </button>
                </div>
            )}

            {/* Temp password display */}
            {tempPassword && actionUserId && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-medium text-amber-800">
                        Temporary password generated:
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm font-mono bg-white px-3 py-1 rounded border border-amber-200">
                            {tempPassword}
                        </code>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(tempPassword);
                            }}
                            className="text-xs text-amber-700 hover:text-amber-900 font-medium"
                        >
                            Copy
                        </button>
                        <button
                            onClick={() => {
                                setTempPassword(null);
                                setActionUserId(null);
                            }}
                            className="text-xs text-slate-500 hover:text-slate-700 ml-2"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
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
                    <tbody className="divide-y divide-gray-200">
                        {users.map((user) => (
                            <tr
                                key={user.id}
                                className="hover:bg-gray-50 transition-colors"
                            >
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900">
                                        {user.name || "—"}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {user.email}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            user.role === "ADMIN"
                                                ? "bg-purple-100 text-purple-800"
                                                : "bg-blue-100 text-blue-800"
                                        }`}
                                    >
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                    {user.tenantName || "—"}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">
                                    {user.lastLoginAt
                                        ? new Date(
                                              user.lastLoginAt
                                          ).toLocaleDateString()
                                        : "Never"}
                                </td>
                                <td className="px-6 py-4">
                                    {user.mustChangePassword ? (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                            Pending Setup
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
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
                                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50"
                                        >
                                            Reset Password
                                        </button>
                                        <button
                                            onClick={() =>
                                                handleDelete(user.id)
                                            }
                                            className="text-xs font-medium text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
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
                                    className="px-6 py-12 text-center text-sm text-gray-400"
                                >
                                    No users found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
