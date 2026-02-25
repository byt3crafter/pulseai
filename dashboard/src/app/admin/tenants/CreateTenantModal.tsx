"use client";

import { useState } from "react";
import { createTenantAction } from "./actions";

export default function CreateTenantModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [credentials, setCredentials] = useState<{ clientId: string; clientSecret: string; initialUser?: { email: string; password: string } } | null>(null);
    const [companyName, setCompanyName] = useState("");
    const [slug, setSlug] = useState("");
    const [slugEdited, setSlugEdited] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

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
        }, 300);
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm shadow-sm"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create Tenant
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden transform transition-all my-8">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-lg font-semibold text-gray-900">
                                {credentials ? "Workspace Created" : "Add New Tenant"}
                            </h3>
                            <button
                                onClick={handleClose}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                title="Close"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {credentials ? (
                            <div className="p-6 space-y-4">
                                {/* Success banner */}
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                                    <p className="text-sm font-semibold text-emerald-900">
                                        ✓ Workspace created successfully
                                    </p>
                                    <p className="text-xs text-emerald-700 mt-1">
                                        Share the credentials below with the customer
                                    </p>
                                </div>

                                {/* User Login Credentials */}
                                {credentials.initialUser && (
                                    <div className="bg-white border border-blue-200 rounded-xl overflow-hidden">
                                        <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
                                            <h3 className="text-sm font-semibold text-blue-900">Customer Login</h3>
                                            <p className="text-xs text-blue-700 mt-0.5">Primary workspace access</p>
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
                                        <div className="bg-amber-50 px-4 py-2 border-t border-amber-200">
                                            <p className="text-xs text-amber-800">
                                                ⚠️ Customer will be required to change password on first login
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* OAuth Credentials */}
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                                        <h3 className="text-sm font-semibold text-slate-900">OAuth Credentials</h3>
                                        <p className="text-xs text-slate-600 mt-0.5">For CLI/API integrations (Claude Code, etc.)</p>
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
                                    <div className="bg-slate-50 px-4 py-2 border-t border-slate-200">
                                        <p className="text-xs text-slate-600">
                                            ℹ️ Client Secret shown once only. Customer can view Client ID in Settings → API tab
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={handleClose}
                                    className="w-full px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg transition-colors"
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="p-6 space-y-5">
                                {error && (
                                    <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100 flex items-start gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Company Name <span className="text-red-500">*</span>
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
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-gray-900"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="customerEmail" className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Customer Admin Email <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        id="customerEmail"
                                        name="customerEmail"
                                        required
                                        placeholder="admin@acmecorp.com"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-gray-900"
                                    />
                                    <p className="mt-1.5 text-xs text-gray-500">The customer's real email. They'll use this to log in.</p>
                                </div>

                                <div>
                                    <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Routing Slug <span className="text-red-500">*</span>
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
                                            className="w-full px-3 py-2 pr-9 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-gray-900 placeholder:font-sans"
                                        />
                                        {/* Lock/unlock icon — click to re-enable auto-gen */}
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            onClick={() => { setSlugEdited(false); setSlug(toSlug(companyName)); }}
                                            className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-indigo-600 transition-colors"
                                            title={slugEdited ? "Click to re-sync with company name" : "Auto-syncing with company name"}
                                        >
                                            {slugEdited ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                </svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-indigo-400">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75M3.75 21.75h16.5M16.5 10.5h.008v.008H16.5V10.5zm-9 0h.008v.008H7.5V10.5z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                    <p className="mt-1.5 text-xs text-gray-500 flex items-center gap-1.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                                        Webhook: /webhooks/telegram/<strong>{slug || "acme-corp"}</strong>
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="initialBalance" className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Starting Credit Balance ($)
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <span className="text-gray-500 sm:text-sm">$</span>
                                        </div>
                                        <input
                                            type="number"
                                            id="initialBalance"
                                            name="initialBalance"
                                            step="0.01"
                                            min="0"
                                            defaultValue="0.00"
                                            className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-gray-900"
                                        />
                                    </div>
                                    <p className="mt-1.5 text-xs text-gray-500">1 credit = $0.01 USD equivalent</p>
                                </div>

                                <div className="pt-5 flex gap-3 justify-end border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center justify-center min-w-[140px]"
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
            <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
            <div className="flex items-center gap-2">
                <code className={`flex-1 text-xs px-3 py-2 rounded-lg border ${
                    secret
                        ? "bg-slate-50 border-slate-200 text-slate-900 font-mono"
                        : "bg-slate-50 border-slate-200 text-slate-700 font-mono"
                } break-all`}>
                    {value}
                </code>
                <button
                    onClick={onCopy}
                    className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex-shrink-0"
                >
                    {copied ? "Copied!" : "Copy"}
                </button>
            </div>
        </div>
    );
}
