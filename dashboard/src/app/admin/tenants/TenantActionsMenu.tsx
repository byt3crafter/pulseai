"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { EllipsisVerticalIcon, NoSymbolIcon, TrashIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { deleteTenantAction, toggleTenantStatusAction } from "./actions";
import ConfirmDialog from "../../../components/ConfirmDialog";

const MENU_WIDTH = 192; // w-48

export default function TenantActionsMenu({
    tenantId,
    currentStatus,
    canSuspend,
    canDelete,
}: {
    tenantId: string;
    currentStatus: string;
    canSuspend: boolean;
    canDelete: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isToggling, setIsToggling] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [error, setError] = useState("");
    const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const openMenu = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
            setCoords({
                top: rect.bottom + 6,
                left: Math.max(8, rect.right - MENU_WIDTH),
            });
        }
        setIsOpen(true);
    };

    useEffect(() => {
        if (!isOpen) return;
        function handlePointer(event: MouseEvent) {
            const t = event.target as Node;
            if (buttonRef.current?.contains(t) || panelRef.current?.contains(t)) return;
            setIsOpen(false);
        }
        const close = () => setIsOpen(false);
        document.addEventListener("mousedown", handlePointer);
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);
        return () => {
            document.removeEventListener("mousedown", handlePointer);
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("resize", close);
        };
    }, [isOpen]);

    const handleDelete = async () => {
        setShowDeleteConfirm(false);
        setIsDeleting(true);
        setError("");
        const result = await deleteTenantAction(tenantId);
        if (!result.success) {
            setError(result.message ?? "Failed to delete workspace.");
            setIsDeleting(false);
        }
        setIsOpen(false);
    };

    const handleToggleStatus = async () => {
        setIsToggling(true);
        setError("");
        const result = await toggleTenantStatusAction(tenantId, currentStatus);
        if (!result.success) {
            setError(result.message ?? "Failed to update workspace status.");
        }
        setIsToggling(false);
        setIsOpen(false);
    };

    if (!canSuspend && !canDelete) {
        return null;
    }

    return (
        <>
            {error && (
                <div role="alert" className="fixed bottom-4 right-4 z-50 bg-pulse-loss/10 text-pulse-loss p-3 rounded-lg text-sm border border-pulse-loss/40 max-w-xs">
                    {error}
                    <button
                        onClick={() => setError("")}
                        aria-label="Dismiss error"
                        className="ml-2 text-pulse-loss/70 hover:text-pulse-loss font-bold"
                    >
                        &times;
                    </button>
                </div>
            )}
            <div className="inline-block text-left">
                <button
                    ref={buttonRef}
                    onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
                    aria-label="Tenant actions"
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    className="text-pulse-faint hover:text-pulse-text-soft p-1 rounded hover:bg-pulse-hover transition-colors"
                >
                    <EllipsisVerticalIcon aria-hidden="true" className="w-5 h-5" />
                </button>

                {isOpen && typeof document !== "undefined" && createPortal(
                    <div
                        ref={panelRef}
                        style={{ position: "fixed", top: coords.top, left: coords.left, width: MENU_WIDTH }}
                        className="rounded-md bg-pulse-panel border border-pulse-border shadow-xl z-[200] py-1"
                        role="menu"
                        aria-orientation="vertical"
                    >
                        {canSuspend && (
                            <button
                                onClick={handleToggleStatus}
                                disabled={isToggling}
                                className="w-full text-left px-4 py-2 text-sm text-pulse-text-soft hover:bg-pulse-hover hover:text-pulse-text flex items-center gap-2 disabled:opacity-50"
                                role="menuitem"
                            >
                                {currentStatus === "active" ? (
                                    <>
                                        <NoSymbolIcon aria-hidden="true" className="w-4 h-4 text-pulse-accent" />
                                        Suspend Workspace
                                    </>
                                ) : (
                                    <>
                                        <CheckCircleIcon aria-hidden="true" className="w-4 h-4 text-pulse-profit" />
                                        Activate Workspace
                                    </>
                                )}
                            </button>
                        )}

                        {canDelete && (
                            <button
                                onClick={() => { setIsOpen(false); setShowDeleteConfirm(true); }}
                                disabled={isDeleting}
                                className="w-full text-left px-4 py-2 text-sm text-pulse-loss hover:bg-pulse-loss/10 hover:text-pulse-loss flex items-center gap-2 disabled:opacity-50"
                                role="menuitem"
                            >
                                <TrashIcon aria-hidden="true" className="w-4 h-4" />
                                {isDeleting ? "Deleting..." : "Delete Permanently"}
                            </button>
                        )}
                    </div>,
                    document.body,
                )}
            </div>

            <ConfirmDialog
                theme="pulse"
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
