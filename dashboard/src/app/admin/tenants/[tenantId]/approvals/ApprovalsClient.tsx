"use client";

import { useState } from "react";
import {
    approvePairingAction,
    rejectPairingAction,
    addGroupToAllowlistAction,
    removeFromAllowlistAction,
} from "./actions";
import ConfirmDialog from "../../../../../components/ConfirmDialog";

interface PairingRequest {
    id: string;
    code: string;
    contactId: string;
    contactName: string | null;
    createdAt: Date | null;
}

interface AllowlistEntry {
    id: string;
    contactId: string;
    contactName: string | null;
    contactType: string | null;
    status: string | null;
}

interface ApprovalsClientProps {
    tenantId: string;
    pendingPairings: PairingRequest[];
    approvedUsers: AllowlistEntry[];
    approvedGroups: AllowlistEntry[];
}

export default function ApprovalsClient({
    tenantId,
    pendingPairings,
    approvedUsers,
    approvedGroups,
}: ApprovalsClientProps) {
    const [processing, setProcessing] = useState<string | null>(null);
    const [groupChatId, setGroupChatId] = useState("");
    const [groupName, setGroupName] = useState("");
    const [addingGroup, setAddingGroup] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ type: "block" | "remove"; contactId: string } | null>(null);

    const handleApprove = async (code: string) => {
        setProcessing(code);
        const result = await approvePairingAction(tenantId, code);
        if (!result.success) alert(result.message);
        setProcessing(null);
    };

    const handleReject = async (contactId: string) => {
        setProcessing(contactId);
        const result = await rejectPairingAction(tenantId, contactId);
        if (!result.success) alert(result.message);
        setProcessing(null);
    };

    const handleRemove = async (contactId: string) => {
        setProcessing(contactId);
        const result = await removeFromAllowlistAction(tenantId, contactId);
        if (!result.success) alert(result.message);
        setProcessing(null);
    };

    const handleConfirmAction = async () => {
        if (!confirmAction) return;
        if (confirmAction.type === "block") {
            await handleReject(confirmAction.contactId);
        } else {
            await handleRemove(confirmAction.contactId);
        }
        setConfirmAction(null);
    };

    const handleAddGroup = async () => {
        if (!groupChatId.trim() || !groupName.trim()) {
            setErrorMsg("Both Group Chat ID and name are required.");
            return;
        }
        setAddingGroup(true);
        setErrorMsg(null);
        const result = await addGroupToAllowlistAction(tenantId, groupChatId.trim(), groupName.trim());
        if (result.success) {
            setGroupChatId("");
            setGroupName("");
        } else {
            setErrorMsg(result.message || "Failed to add group.");
        }
        setAddingGroup(false);
    };

    return (
        <div className="space-y-8">
            {/* Pending Pairing Requests */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Pending Pairing Requests
                    {pendingPairings.length > 0 && (
                        <span className="ml-2 text-sm font-normal text-amber-600">
                            ({pendingPairings.length} pending)
                        </span>
                    )}
                </h2>
                {pendingPairings.length === 0 ? (
                    <p className="text-sm text-gray-500">No pending pairing requests.</p>
                ) : (
                    <div className="space-y-3">
                        {pendingPairings.map((p) => (
                            <div
                                key={p.id}
                                className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                            >
                                <div>
                                    <div className="text-sm font-medium text-gray-900">
                                        {p.contactName || "Unknown User"}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        ID: {p.contactId} &middot; Code:{" "}
                                        <code className="font-mono bg-gray-100 px-1 rounded">
                                            {p.code}
                                        </code>
                                    </div>
                                    {p.createdAt && (
                                        <div className="text-xs text-gray-400">
                                            {new Date(p.createdAt).toLocaleString()}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleApprove(p.code)}
                                        disabled={processing === p.code}
                                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                                    >
                                        {processing === p.code ? "..." : "Approve"}
                                    </button>
                                    <button
                                        onClick={() => setConfirmAction({ type: "block", contactId: p.contactId })}
                                        disabled={processing === p.contactId}
                                        className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                                    >
                                        {processing === p.contactId ? "..." : "Reject"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Approved Users */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Approved Contacts</h2>
                {approvedUsers.length === 0 ? (
                    <p className="text-sm text-gray-500">No approved contacts yet.</p>
                ) : (
                    <div className="space-y-2">
                        {approvedUsers.map((u) => (
                            <div
                                key={u.id}
                                className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                            >
                                <div>
                                    <div className="text-sm font-medium text-gray-900">
                                        {u.contactName || "Unknown"}
                                    </div>
                                    <div className="text-xs text-gray-500 font-mono">{u.contactId}</div>
                                </div>
                                <button
                                    onClick={() => setConfirmAction({ type: "remove", contactId: u.contactId })}
                                    disabled={processing === u.contactId}
                                    className="px-3 py-1.5 text-red-600 bg-red-50 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Approved Groups */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Approved Groups</h2>
                {approvedGroups.length === 0 ? (
                    <p className="text-sm text-gray-500">No approved groups yet.</p>
                ) : (
                    <div className="space-y-2 mb-4">
                        {approvedGroups.map((g) => (
                            <div
                                key={g.id}
                                className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                            >
                                <div>
                                    <div className="text-sm font-medium text-gray-900">
                                        {g.contactName || "Unnamed Group"}
                                    </div>
                                    <div className="text-xs text-gray-500 font-mono">{g.contactId}</div>
                                </div>
                                <button
                                    onClick={() => setConfirmAction({ type: "remove", contactId: g.contactId })}
                                    disabled={processing === g.contactId}
                                    className="px-3 py-1.5 text-red-600 bg-red-50 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Group Form */}
                <div className="border-t border-gray-200 pt-4 mt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Add Group to Allowlist</h3>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="text"
                            placeholder="Group Chat ID (e.g. -1001234567890)"
                            value={groupChatId}
                            onChange={(e) => setGroupChatId(e.target.value)}
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <input
                            type="text"
                            placeholder="Group Name"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <button
                            onClick={handleAddGroup}
                            disabled={addingGroup}
                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                            {addingGroup ? "Adding..." : "Add Group"}
                        </button>
                    </div>
                    {errorMsg && <p className="text-xs text-red-600 mt-2">{errorMsg}</p>}
                </div>
            </section>

            <ConfirmDialog
                open={!!confirmAction}
                title={confirmAction?.type === "block" ? "Block Contact" : "Remove from Allowlist"}
                message={
                    confirmAction?.type === "block"
                        ? "Block this contact? They will not be able to request pairing again."
                        : "Remove this entry from the allowlist?"
                }
                confirmLabel={confirmAction?.type === "block" ? "Block" : "Remove"}
                variant={confirmAction?.type === "block" ? "danger" : "warning"}
                onConfirm={handleConfirmAction}
                onCancel={() => setConfirmAction(null)}
            />
        </div>
    );
}
