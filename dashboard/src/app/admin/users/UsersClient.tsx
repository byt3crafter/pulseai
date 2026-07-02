"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyIcon, TrashIcon } from "@heroicons/react/24/outline";
import { resetPasswordAction, deleteUserAction, updateUserRoleAction } from "./actions";
import CreateUserModal from "./CreateUserModal";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { ui, PageHeader, Panel, Badge } from "../../../components/admin/ui";
import { PLATFORM_ROLES, TENANT_ROLES, ROLE_LABELS } from "../../../utils/permissions";

interface User {
    id: string;
    name: string | null;
    email: string;
    role: string;
    accessRole: string;
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
    canCreate: boolean;
    canDelete: boolean;
    canReset: boolean;
    canChangeRole: boolean;
}

function AccessRoleSelect({ user, canChangeRole }: { user: User; canChangeRole: boolean }) {
    const router = useRouter();
    const [value, setValue] = useState(user.accessRole);
    const [failed, setFailed] = useState(false);
    const [isPending, startTransition] = useTransition();

    const options = user.role === "ADMIN" ? PLATFORM_ROLES : TENANT_ROLES;

    if (!canChangeRole) {
        return <Badge variant="neutral">{ROLE_LABELS[user.accessRole] ?? user.accessRole}</Badge>;
    }

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const previous = value;
        const next = e.target.value;
        setValue(next);
        setFailed(false);
        startTransition(async () => {
            const result = await updateUserRoleAction(user.id, next);
            if (result.success) {
                router.refresh();
            } else {
                setValue(previous);
                setFailed(true);
            }
        });
    };

    return (
        <div className="flex items-center gap-1.5">
            <select
                value={value}
                onChange={handleChange}
                disabled={isPending}
                aria-label={`Access role for ${user.email}`}
                className={`${ui.input} w-auto py-1 text-[12px] ${failed ? "border-pulse-loss" : ""}`}
            >
                {options.map((role) => (
                    <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                    </option>
                ))}
            </select>
            {isPending && <span className="text-[11px] text-pulse-faint">Saving…</span>}
            {failed && !isPending && <span className="text-[11px] text-pulse-loss">Failed</span>}
        </div>
    );
}

export default function UsersClient({ users, tenants, canCreate, canDelete, canReset, canChangeRole }: Props) {
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
                action={canCreate ? <CreateUserModal tenants={tenants} /> : undefined}
            />

            {error && (
                <div role="alert" className="p-3 bg-pulse-loss/10 border border-pulse-loss/40 rounded-lg text-[13px] text-pulse-loss flex items-center justify-between gap-2">
                    <span>{error}</span>
                    <button
                        onClick={() => setError("")}
                        className="text-pulse-loss hover:text-pulse-loss/80"
                        aria-label="Dismiss error"
                    >
                        &times;
                    </button>
                </div>
            )}

            {/* Temp password display */}
            {tempPassword && actionUserId && (
                <div className="p-4 bg-pulse-accent/10 border border-pulse-accent/40 rounded-lg">
                    <p className="text-[13px] font-medium text-pulse-accent">
                        Temporary password generated:
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                        <code className="text-[13px] font-sans bg-pulse-panel px-3 py-1 rounded border border-pulse-accent/40 text-pulse-text">
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
                            className="text-[13px] text-pulse-muted hover:text-pulse-text-soft ml-2 transition-colors"
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
                                        <div className="text-[13px] font-medium text-pulse-text">
                                            {user.name || "—"}
                                        </div>
                                        <div className="text-[11px] text-pulse-faint mt-0.5">
                                            {user.email}
                                        </div>
                                    </td>
                                    <td className={ui.td}>
                                        <div className="flex flex-col gap-1.5">
                                            <Badge variant={user.role === "ADMIN" ? "accent" : "neutral"}>
                                                {user.role}
                                            </Badge>
                                            <AccessRoleSelect user={user} canChangeRole={canChangeRole} />
                                        </div>
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
                                        {canReset || canDelete ? (
                                            <div className="flex items-center justify-end gap-1">
                                                {canReset && (
                                                    <button
                                                        onClick={() => handleResetPassword(user.id)}
                                                        aria-label="Reset password"
                                                        title="Reset password"
                                                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-pulse-muted hover:text-pulse-accent hover:bg-pulse-hover transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pulse-accent"
                                                    >
                                                        <KeyIcon aria-hidden="true" className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {canDelete && (
                                                    <button
                                                        onClick={() => setDeleteUserId(user.id)}
                                                        aria-label="Delete user"
                                                        title="Delete user"
                                                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-pulse-muted hover:text-pulse-loss hover:bg-pulse-loss/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pulse-loss"
                                                    >
                                                        <TrashIcon aria-hidden="true" className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-pulse-faint">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-pulse-faint">
                                        No users found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <ConfirmDialog
                theme="pulse"
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
