"use client";

import { useState, useEffect, useRef } from "react";
import { createTenantAction } from "./actions";
import { ui } from "../../../components/admin/ui";

export default function CreateTenantModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [credentials, setCredentials] = useState<{ clientId: string; clientSecret: string; initialUser?: { email: string; password: string } } | null>(null);
    const [companyName, setCompanyName] = useState("");
    const [slug, setSlug] = useState("");
    const [slugEdited, setSlugEdited] = useState(false);
    const [apiMode, setApiMode] = useState<"platform" | "byok">("platform");
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const modal = modalRef.current;
        if (!modal) return;
        const focusable = modal.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        first?.focus();
        const trap = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        };
        modal.addEventListener("keydown", trap);
        return () => modal.removeEventListener("keydown", trap);
    }, [isOpen]);

    const copy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const toSlug = (name: string) =>
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const result = await createTenantAction(formData);

        if (!result.success && result.message) {
            setError(result.message);
        } else if (result.success && result.credentials) {
            setCredentials(result.credentials as { clientId: string; clientSecret: string; initialUser?: { email: string; password: string } });
        } else {
            setIsOpen(false);
        }
        setLoading(false);
    };

    const handleClose = () => {
        setIsOpen(false);
        setTimeout(() => {
            setCredentials(null);
            setError(null);
            setCompanyName("");
            setSlug("");
            setSlugEdited(false);
            setApiMode("platform");
        }, 300);
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className={ui.btnPrimary}
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create Tenant
            </button>

            {isOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="create-tenant-modal-title"
                >
                    <div ref={modalRef} className="bg-pulse-panel rounded-lg border border-pulse-border w-full max-w-lg overflow-hidden transform transition-all my-8">
                        <div className="px-6 py-4 border-b border-pulse-border flex justify-between items-center bg-pulse-panel-alt">
                            <h3 id="create-tenant-modal-title" className="text-lg font-semibold text-pulse-text">
                                {credentials ? "Workspace Created" : "Add New Tenant"}
                            </h3>
                            <button
                                onClick={handleClose}
                                aria-label="Close"
                                className="text-pulse-faint hover:text-pulse-text-soft transition-colors"
                            >
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {credentials ? (
                            <div className="p-6 space-y-4">
                                {/* Success banner */}
                                <div className="bg-pulse-profit/10 border border-pulse-profit/40 rounded-lg p-4">
                                    <p className="text-sm font-semibold text-pulse-profit">
                                        ✓ Workspace created successfully
                                    </p>
                                    <p className="text-xs text-pulse-profit mt-1">
                                        Share the credentials below with the customer
                                    </p>
                                </div>

                                {/* User Login Credentials */}
                                {credentials.initialUser && (
                                    <div className="bg-pulse-panel border border-pulse-accent/40 rounded-lg overflow-hidden">
                                        <div className="bg-pulse-accent/10 px-4 py-3 border-b border-pulse-accent/40">
                                            <h3 className="text-sm font-semibold text-pulse-accent">Customer Login</h3>
                                            <p className="text-xs text-pulse-accent mt-0.5">Primary workspace access</p>
                                        </div>
                                        <div className="p-4 space-y-3">
                                            <CredentialRow
                                                label="Email"
                                                value={credentials.initialUser?.email ?? ''}
                                                onCopy={() => copy(credentials.initialUser?.email ?? '', 'email')}
                                                copied={copiedId === 'email'}
                                            />
                                            <CredentialRow
                                                label="Temporary Password"
                                                value={credentials.initialUser?.password ?? ''}
                                                onCopy={() => copy(credentials.initialUser?.password ?? '', 'password')}
                                                copied={copiedId === 'password'}
                                                secret
                                            />
                                        </div>
                                        <div className="bg-pulse-accent/10 px-4 py-2 border-t border-pulse-accent/40">
                                            <p className="text-xs text-pulse-accent">
                                                ⚠️ Customer will be required to change password on first login
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* OAuth Credentials */}
                                <div className="bg-pulse-panel border border-pulse-border rounded-lg overflow-hidden">
                                    <div className="bg-pulse-panel-alt px-4 py-3 border-b border-pulse-border">
                                        <h3 className="text-sm font-semibold text-pulse-text">OAuth Credentials</h3>
                                        <p className="text-xs text-pulse-text-soft mt-0.5">For CLI/API integrations (Claude Code, etc.)</p>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <CredentialRow
                                            label="Client ID"
                                            value={credentials.clientId}
                                            onCopy={() => copy(credentials.clientId, 'clientId')}
                                            copied={copiedId === 'clientId'}
                                        />
                                        <CredentialRow
                                            label="Client Secret"
                                            value={credentials.clientSecret}
                                            onCopy={() => copy(credentials.clientSecret, 'clientSecret')}
                                            copied={copiedId === 'clientSecret'}
                                            secret
                                        />
                                    </div>
                                    <div className="bg-pulse-panel-alt px-4 py-2 border-t border-pulse-border">
                                        <p className="text-xs text-pulse-text-soft">
                                            ℹ️ Client Secret shown once only. Customer can view Client ID in Settings → API tab
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={handleClose}
                                    className={`${ui.btnSecondary} w-full`}
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="p-6 space-y-5">
                                {error && (
                                    <div role="alert" className="p-3 text-sm text-pulse-loss bg-pulse-loss/10 rounded-lg border border-pulse-loss/40 flex items-start gap-2">
                                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="name" className={ui.label}>
                                        Company Name <span className="text-pulse-loss">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        required
                                        placeholder="Acme Corp"
                                        value={companyName}
                                        onChange={(e) => {
                                            setCompanyName(e.target.value);
                                            if (!slugEdited) setSlug(toSlug(e.target.value));
                                        }}
                                        className={ui.input}
                                    />
                                </div>

                                <div>
                                    <label htmlFor="customerEmail" className={ui.label}>
                                        Customer Admin Email <span className="text-pulse-loss">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        id="customerEmail"
                                        name="customerEmail"
                                        required
                                        placeholder="admin@acmecorp.com"
                                        className={ui.input}
                                    />
                                    <p className="mt-1.5 text-[11px] text-pulse-muted">The customer's real email. They'll use this to log in.</p>
                                </div>

                                <div>
                                    <label htmlFor="slug" className={ui.label}>
                                        Routing Slug <span className="text-pulse-loss">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            id="slug"
                                            name="slug"
                                            required
                                            value={slug}
                                            onChange={(e) => {
                                                setSlug(e.target.value);
                                                setSlugEdited(true);
                                            }}
                                            placeholder="acme-corp"
                                            pattern="[-a-z0-9]+"
                                            title="Lowercase letters, numbers, and hyphens only"
                                            className={`${ui.input} pr-9 font-mono placeholder:font-mono`}
                                        />
                                        {/* Lock/unlock icon — click to re-enable auto-gen */}
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            onClick={() => { setSlugEdited(false); setSlug(toSlug(companyName)); }}
                                            className="absolute inset-y-0 right-2 flex items-center text-pulse-faint hover:text-pulse-accent transition-colors"
                                            title={slugEdited ? "Click to re-sync with company name" : "Auto-syncing with company name"}
                                        >
                                            {slugEdited ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                </svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-pulse-accent">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75M3.75 21.75h16.5M16.5 10.5h.008v.008H16.5V10.5zm-9 0h.008v.008H7.5V10.5z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                    <p className="mt-1.5 text-[11px] text-pulse-muted flex items-center gap-1.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                                        Webhook: /webhooks/telegram/<strong>{slug || "acme-corp"}</strong>
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="initialBalance" className={ui.label}>
                                        Starting Credit Balance ($)
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <span className="text-pulse-muted text-[13px]">$</span>
                                        </div>
                                        <input
                                            type="number"
                                            id="initialBalance"
                                            name="initialBalance"
                                            step="0.01"
                                            min="0"
                                            defaultValue="0.00"
                                            className={`${ui.input} pl-7`}
                                        />
                                    </div>
                                    <p className="mt-1.5 text-[11px] text-pulse-muted">1 credit = $0.01 USD equivalent</p>
                                </div>

                                <div>
                                    <label htmlFor="apiMode" className={ui.label}>
                                        API Mode
                                    </label>
                                    <select
                                        id="apiMode"
                                        name="apiMode"
                                        value={apiMode}
                                        onChange={(e) => setApiMode(e.target.value as "platform" | "byok")}
                                        className={ui.input}
                                    >
                                        <option value="platform">Platform API (uses global keys)</option>
                                        <option value="byok">Bring Your Own Key (tenant provides keys)</option>
                                    </select>
                                    <p className="mt-1.5 text-[11px] text-pulse-muted">
                                        {apiMode === "platform"
                                            ? "Tenant uses your global API keys. AI Provider onboarding step is skipped."
                                            : "Tenant must configure their own API keys during onboarding."}
                                    </p>
                                </div>

                                <div className="pt-5 flex gap-3 justify-end border-t border-pulse-border">
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        className={ui.btnSecondary}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className={`${ui.btnPrimary} min-w-[140px]`}
                                    >
                                        {loading ? (
                                            <>
                                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Creating...
                                            </>
                                        ) : 'Create Workspace'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

// Helper component for credential rows with copy functionality
function CredentialRow({ label, value, onCopy, copied, secret }: { label: string; value: string; onCopy: () => void; copied: boolean; secret?: boolean }) {
    return (
        <div>
            <label className="block text-[11px] font-medium text-pulse-muted mb-1">{label}</label>
            <div className="flex items-center gap-2">
                <code className={`flex-1 text-[13px] px-3 py-2 rounded-md border ${
                    secret
                        ? "bg-pulse-panel-alt border-pulse-border text-pulse-text font-mono"
                        : "bg-pulse-panel-alt border-pulse-border text-pulse-text-soft font-mono"
                } break-all`}>
                    {value}
                </code>
                <button
                    onClick={onCopy}
                    className={`${ui.btnSecondary} flex-shrink-0`}
                >
                    {copied ? "Copied!" : "Copy"}
                </button>
            </div>
        </div>
    );
}
