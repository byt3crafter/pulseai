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
        setErrorMsg(null);
        const result = await approvePairingAction(tenantId, code);
        if (!result.success) setErrorMsg(result.message ?? "Failed to approve pairing.");
        setProcessing(null);
    };

    const handleReject = async (contactId: string) => {
        setProcessing(contactId);
        setErrorMsg(null);
        const result = await rejectPairingAction(tenantId, contactId);
        if (!result.success) setErrorMsg(result.message ?? "Failed to reject pairing.");
        setProcessing(null);
    };

    const handleRemove = async (contactId: string) => {
        setProcessing(contactId);
        setErrorMsg(null);
        const result = await removeFromAllowlistAction(tenantId, contactId);
        if (!result.success) setErrorMsg(result.message ?? "Failed to remove contact.");
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
            {errorMsg && (
                <div role="alert" className="bg-[#F0503C]/10 text-[#F0503C] p-3 rounded-lg text-sm border border-[#F0503C]/40">
                    {errorMsg}
                    <button onClick={() => setErrorMsg(null)} aria-label="Dismiss error" className="ml-2 text-[#F0503C]/70 hover:text-[#F0503C] font-bold">&times;</button>
                </div>
            )}
            {/* Pending Pairing Requests */}
            <section className="bg-[#0C0C0E] rounded-xl border border-[#242429] p-6">
                <h2 className="text-lg font-semibold text-[#EDEDED] mb-4">
                    Pending Pairing Requests
                    {pendingPairings.length > 0 && (
                        <span className="ml-2 text-sm font-normal text-[#8B5CF6]">
                            ({pendingPairings.length} pending)
                        </span>
                    )}
                </h2>
                {pendingPairings.length === 0 ? (
                    <p className="text-sm text-[#8A8A90]">No pending pairing requests.</p>
                ) : (
                    <div className="space-y-3">
                        {pendingPairings.map((p) => (
                            <div
                                key={p.id}
                                className="flex items-center justify-between bg-[#101012] rounded-lg p-3"
                            >
                                <div>
                                    <div className="text-sm font-medium text-[#EDEDED]">
                                        {p.contactName || "Unknown User"}
                                    </div>
                                    <div className="text-xs text-[#8A8A90]">
                                        ID: {p.contactId} &middot; Code:{" "}
                                        <code className="font-sans bg-[#141417] px-1 rounded">
                                            {p.code}
                                        </code>
                                    </div>
                                    {p.createdAt && (
                                        <div className="text-xs text-[#5A5A61]">
                                            {new Date(p.createdAt).toLocaleString()}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleApprove(p.code)}
                                        disabled={processing === p.code}
                                        className="px-3 py-1.5 bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]/40 text-xs font-medium rounded-lg hover:bg-[#3FB950]/20 disabled:opacity-50 transition-colors"
                                    >
                                        {processing === p.code ? "..." : "Approve"}
                                    </button>
                                    <button
                                        onClick={() => setConfirmAction({ type: "block", contactId: p.contactId })}
                                        disabled={processing === p.contactId}
                                        className="px-3 py-1.5 bg-[#F0503C]/10 text-[#F0503C] border border-[#F0503C]/40 text-xs font-medium rounded-lg hover:bg-[#F0503C]/20 disabled:opacity-50 transition-colors"
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
            <section className="bg-[#0C0C0E] rounded-xl border border-[#242429] p-6">
                <h2 className="text-lg font-semibold text-[#EDEDED] mb-4">Approved Contacts</h2>
                {approvedUsers.length === 0 ? (
                    <p className="text-sm text-[#8A8A90]">No approved contacts yet.</p>
                ) : (
                    <div className="space-y-2">
                        {approvedUsers.map((u) => (
                            <div
                                key={u.id}
                                className="flex items-center justify-between bg-[#101012] rounded-lg p-3"
                            >
                                <div>
                                    <div className="text-sm font-medium text-[#EDEDED]">
                                        {u.contactName || "Unknown"}
                                    </div>
                                    <div className="text-xs text-[#8A8A90] font-sans">{u.contactId}</div>
                                </div>
                                <button
                                    onClick={() => setConfirmAction({ type: "remove", contactId: u.contactId })}
                                    disabled={processing === u.contactId}
                                    className="px-3 py-1.5 text-[#F0503C] bg-[#F0503C]/10 text-xs font-medium rounded-lg hover:bg-[#F0503C]/20 disabled:opacity-50 transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Approved Groups */}
            <section className="bg-[#0C0C0E] rounded-xl border border-[#242429] p-6">
                <h2 className="text-lg font-semibold text-[#EDEDED] mb-4">Approved Groups</h2>
                {approvedGroups.length === 0 ? (
                    <p className="text-sm text-[#8A8A90]">No approved groups yet.</p>
                ) : (
                    <div className="space-y-2 mb-4">
                        {approvedGroups.map((g) => (
                            <div
                                key={g.id}
                                className="flex items-center justify-between bg-[#101012] rounded-lg p-3"
                            >
                                <div>
                                    <div className="text-sm font-medium text-[#EDEDED]">
                                        {g.contactName || "Unnamed Group"}
                                    </div>
                                    <div className="text-xs text-[#8A8A90] font-sans">{g.contactId}</div>
                                </div>
                                <button
                                    onClick={() => setConfirmAction({ type: "remove", contactId: g.contactId })}
                                    disabled={processing === g.contactId}
                                    className="px-3 py-1.5 text-[#F0503C] bg-[#F0503C]/10 text-xs font-medium rounded-lg hover:bg-[#F0503C]/20 disabled:opacity-50 transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Group Form */}
                <div className="border-t border-[#242429] pt-4 mt-4">
                    <h3 className="text-sm font-medium text-[#B5B5BA] mb-3">Add Group to Allowlist</h3>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="text"
                            placeholder="Group Chat ID (e.g. -1001234567890)"
                            value={groupChatId}
                            onChange={(e) => setGroupChatId(e.target.value)}
                            className="flex-1 bg-[#101012] border border-[#242429] text-[#EDEDED] placeholder:text-[#5A5A61] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#8B5CF6] outline-none"
                        />
                        <input
                            type="text"
                            placeholder="Group Name"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className="flex-1 bg-[#101012] border border-[#242429] text-[#EDEDED] placeholder:text-[#5A5A61] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#8B5CF6] outline-none"
                        />
                        <button
                            onClick={handleAddGroup}
                            disabled={addingGroup}
                            className="px-4 py-2 bg-[#8B5CF6] text-white text-sm font-medium rounded-lg hover:bg-[#A78BFA] disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                            {addingGroup ? "Adding..." : "Add Group"}
                        </button>
                    </div>
                    {errorMsg && <p className="text-xs text-[#F0503C] mt-2">{errorMsg}</p>}
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
