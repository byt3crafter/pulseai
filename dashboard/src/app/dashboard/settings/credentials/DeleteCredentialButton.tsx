"use client";

import { useState } from "react";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { deleteCredential } from "./actions";

export default function DeleteCredentialButton({ credentialId }: { credentialId: string }) {
    const [showConfirm, setShowConfirm] = useState(false);

    return (
        <>
            <button
                onClick={() => setShowConfirm(true)}
                className="text-xs text-red-400 hover:text-red-300 font-medium cursor-pointer transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
            >
                Delete
            </button>

            <ConfirmDialog
                open={showConfirm}
                title="Delete Credential"
                message="This will permanently delete this credential. Agents using it will lose access to the associated service."
                confirmLabel="Delete Credential"
                variant="danger"
                theme="pulse"
                onConfirm={() => {
                    const fd = new FormData();
                    fd.append("credentialId", credentialId);
                    deleteCredential(fd);
                    setShowConfirm(false);
                }}
                onCancel={() => setShowConfirm(false)}
            />
        </>
    );
}
