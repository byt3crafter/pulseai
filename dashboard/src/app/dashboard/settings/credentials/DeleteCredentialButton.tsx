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
                className="text-xs text-red-600 hover:text-red-800 font-medium"
            >
                Delete
            </button>

            <ConfirmDialog
                open={showConfirm}
                title="Delete Credential"
                message="This will permanently delete this credential. Agents using it will lose access to the associated service."
                confirmLabel="Delete Credential"
                variant="danger"
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
