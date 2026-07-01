"use client";

import { useState } from "react";
import {
    approvePairingAction,
    rejectPairingAction,
    addGroupToAllowlistAction,
    removeFromAllowlistAction,
} from "./actions";
import ConfirmDialog from "../../../../../components/ConfirmDialog";
import { ui, Panel } from "../../../../../components/admin/ui";

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
        <div className="space-y-4">
            {errorMsg && (
                <div role="alert" className="bg-[#F0503C]/10 text-[#F0503C] p-3 rounded-lg text-[13px] border border-[#F0503C]/40">
                    {errorMsg}
                    <button onClick={() => setErrorMsg(null)} aria-label="Dismiss error" className="ml-2 text-[#F0503C]/70 hover:text-[#F0503C] font-bold">&times;</button>
                </div>
            )}
            {/* Pending Pairing Requests */}
            <Panel bodyClassName="p-6">
                <h2 className="text-[15px] font-semibold text-[#EDEDED] mb-4">
                    Pending Pairing Requests
                    {pendingPairings.length > 0 && (
                        <span className="ml-2 text-[13px] font-normal text-[#8B5CF6]">
                            ({pendingPairings.length} pending)
                        </span>
                    )}
                </h2>
                {pendingPairings.length === 0 ? (
                    <p className="text-[13px] text-[#8A8A90]">No pending pairing requests.</p>
                ) : (
                    <div className="space-y-3">
                        {pendingPairings.map((p) => (
                            <div
                                key={p.id}
                                className="flex items-center justify-between bg-[#101012] border border-[#242429] rounded-md p-3"
                            >
                                <div>
                                    <div className="text-[13px] font-medium text-[#EDEDED]">
                                        {p.contactName || "Unknown User"}
                                    </div>
                                    <div className="text-[11px] text-[#8A8A90]">
                                        ID: {p.contactId} &middot; Code:{" "}
                                        <code className="font-mono bg-[#141417] px-1 rounded">
                                            {p.code}
                                        </code>
                                    </div>
                                    {p.createdAt && (
                                        <div className="text-[11px] text-[#5A5A61]">
                                            {new Date(p.createdAt).toLocaleString()}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleApprove(p.code)}
                                        disabled={processing === p.code}
                                        className={ui.btnPrimary}
                                    >
                                        {processing === p.code ? "..." : "Approve"}
                                    </button>
                                    <button
                                        onClick={() => setConfirmAction({ type: "block", contactId: p.contactId })}
                                        disabled={processing === p.contactId}
                                        className={ui.btnDanger}
                                    >
                                        {processing === p.contactId ? "..." : "Reject"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Panel>

            {/* Approved Users */}
            <Panel bodyClassName="p-6">
                <h2 className="text-[15px] font-semibold text-[#EDEDED] mb-4">Approved Contacts</h2>
                {approvedUsers.length === 0 ? (
                    <p className="text-[13px] text-[#8A8A90]">No approved contacts yet.</p>
                ) : (
                    <div className="space-y-2">
                        {approvedUsers.map((u) => (
                            <div
                                key={u.id}
                                className="flex items-center justify-between bg-[#101012] border border-[#242429] rounded-md p-3"
                            >
                                <div>
                                    <div className="text-[13px] font-medium text-[#EDEDED]">
                                        {u.contactName || "Unknown"}
                                    </div>
                                    <div className="text-[11px] text-[#8A8A90] font-mono">{u.contactId}</div>
                                </div>
                                <button
                                    onClick={() => setConfirmAction({ type: "remove", contactId: u.contactId })}
                                    disabled={processing === u.contactId}
                                    className={ui.btnDanger}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Panel>

            {/* Approved Groups */}
            <Panel bodyClassName="p-6">
                <h2 className="text-[15px] font-semibold text-[#EDEDED] mb-4">Approved Groups</h2>
                {approvedGroups.length === 0 ? (
                    <p className="text-[13px] text-[#8A8A90]">No approved groups yet.</p>
                ) : (
                    <div className="space-y-2 mb-4">
                        {approvedGroups.map((g) => (
                            <div
                                key={g.id}
                                className="flex items-center justify-between bg-[#101012] border border-[#242429] rounded-md p-3"
                            >
                                <div>
                                    <div className="text-[13px] font-medium text-[#EDEDED]">
                                        {g.contactName || "Unnamed Group"}
                                    </div>
                                    <div className="text-[11px] text-[#8A8A90] font-mono">{g.contactId}</div>
                                </div>
                                <button
                                    onClick={() => setConfirmAction({ type: "remove", contactId: g.contactId })}
                                    disabled={processing === g.contactId}
                                    className={ui.btnDanger}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Group Form */}
                <div className="border-t border-[#242429] pt-4 mt-4">
                    <h3 className="text-[13px] font-medium text-[#B5B5BA] mb-3">Add Group to Allowlist</h3>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="text"
                            placeholder="Group Chat ID (e.g. -1001234567890)"
                            value={groupChatId}
                            onChange={(e) => setGroupChatId(e.target.value)}
                            className={`${ui.input} flex-1`}
                        />
                        <input
                            type="text"
                            placeholder="Group Name"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className={`${ui.input} flex-1`}
                        />
                        <button
                            onClick={handleAddGroup}
                            disabled={addingGroup}
                            className={`${ui.btnPrimary} whitespace-nowrap`}
                        >
                            {addingGroup ? "Adding..." : "Add Group"}
                        </button>
                    </div>
                    {errorMsg && <p className="text-[11px] text-[#F0503C] mt-2">{errorMsg}</p>}
                </div>
            </Panel>

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
