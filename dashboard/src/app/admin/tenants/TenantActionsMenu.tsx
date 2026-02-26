"use client";

import { useState, useRef, useEffect } from "react";
import { EllipsisVerticalIcon, NoSymbolIcon, TrashIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { deleteTenantAction, toggleTenantStatusAction } from "./actions";
import ConfirmDialog from "../../../components/ConfirmDialog";

export default function TenantActionsMenu({ tenantId, currentStatus }: { tenantId: string, currentStatus: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isToggling, setIsToggling] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleDelete = async () => {
        setShowDeleteConfirm(false);
        setIsDeleting(true);
        const result = await deleteTenantAction(tenantId);
        if (!result.success) {
            alert(result.message);
            setIsDeleting(false);
        }
        setIsOpen(false);
    };

    const handleToggleStatus = async () => {
        setIsToggling(true);
        const result = await toggleTenantStatusAction(tenantId, currentStatus);
        if (!result.success) {
            alert(result.message);
        }
        setIsToggling(false);
        setIsOpen(false);
    };

    return (
        <>
            <div className="relative inline-block text-left" ref={menuRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors"
                >
                    <EllipsisVerticalIcon className="w-5 h-5" />
                </button>

                {isOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10 transition-all">
                        <div className="py-1" role="menu" aria-orientation="vertical">
                            <button
                                onClick={handleToggleStatus}
                                disabled={isToggling}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 flex items-center gap-2 disabled:opacity-50"
                                role="menuitem"
                            >
                                {currentStatus === "active" ? (
                                    <>
                                        <NoSymbolIcon className="w-4 h-4 text-amber-500" />
                                        Suspend Workspace
                                    </>
                                ) : (
                                    <>
                                        <CheckCircleIcon className="w-4 h-4 text-green-500" />
                                        Activate Workspace
                                    </>
                                )}
                            </button>

                            <button
                                onClick={() => { setIsOpen(false); setShowDeleteConfirm(true); }}
                                disabled={isDeleting}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center gap-2 disabled:opacity-50"
                                role="menuitem"
                            >
                                <TrashIcon className="w-4 h-4" />
                                {isDeleting ? "Deleting..." : "Delete Permanently"}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={showDeleteConfirm}
                title="Delete Workspace"
                message="This will permanently destroy this workspace and all its users, data, and configurations. This action cannot be undone."
                confirmLabel="Delete Permanently"
                variant="danger"
                onConfirm={handleDelete}
                onCancel={() => setShowDeleteConfirm(false)}
            />
        </>
    );
}
