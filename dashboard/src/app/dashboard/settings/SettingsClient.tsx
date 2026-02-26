"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    changePasswordAction,
    saveTelegramTokenAction,
    saveProviderKeyAction,
    removeProviderKeyAction,
    validateProviderKeyAction,
    toggleCliAccessAction,
    updateTelegramPoliciesAction,
    approvePairingAction,
    rejectPairingAction,
    addGroupToAllowlistAction,
    removeFromAllowlistAction,
    exchangeOpenAICodeAction,
} from "./actions";
import { ensureDashboardClientAction } from "../../oauth/authorize/actions";
import { PROVIDERS } from "../../../utils/models";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "../../../utils/pkce";
import { buildOpenAIAuthUrl, getCallbackUrl } from "../../../utils/openai-oauth";
import ConfirmDialog from "../../../components/ConfirmDialog";

const TABS = [
    { id: "account", label: "Account" },
    { id: "integrations", label: "Integrations" },
    { id: "telegram", label: "Telegram" },
    { id: "providers", label: "AI Providers" },
    { id: "api", label: "API & Developer" },
    { id: "billing", label: "Billing" },
];

interface ProviderKeyInfo {
    provider: string;
    authMethod: string;
    keyAlias: string | null;
    isActive: boolean | null;
    lastValidatedAt: string | null;
}

interface PairingInfo {
    id: string;
    code: string;
    contactId: string;
    contactName: string | null;
    createdAt: string;
}

interface AllowlistInfo {
    id: string;
    contactId: string;
    contactName: string | null;
}

interface Props {
    tab: string;
    credits: number;
    telegramConnected: boolean;
    oauthClients: { clientId: string; name: string; createdAt: string }[];
    apiTokens: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[];
    userEmail: string;
    userName: string;
    enableThirdPartyCli: boolean;
    apiBaseUrl: string;
    providerKeys: ProviderKeyInfo[];
    telegramConfig: {
        dmPolicy: string;
        groupPolicy: string;
        requireMention: boolean;
    };
    pendingPairings: PairingInfo[];
    approvedUsers: AllowlistInfo[];
    approvedGroups: AllowlistInfo[];
}

export default function SettingsClient({
    tab, credits, telegramConnected, oauthClients, apiTokens, userEmail, userName, providerKeys,
    enableThirdPartyCli, apiBaseUrl,
    telegramConfig, pendingPairings, approvedUsers, approvedGroups,
}: Props) {
    const router = useRouter();

    return (
        <div className="p-8">
            {/* Page header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
                <p className="text-sm text-slate-500 mt-1">Manage your workspace, account, integrations, and API access.</p>
            </div>

            <div className="flex gap-8">
                {/* Left tab nav — Vercel/Linear style */}
                <nav className="w-44 flex-shrink-0">
                    <ul className="space-y-0.5">
                        {TABS.map(t => (
                            <li key={t.id}>
                                <Link
                                    href={`/dashboard/settings?tab=${t.id}`}
                                    className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id
                                        ? "bg-slate-100 text-slate-900"
                                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                                        }`}
                                >
                                    {t.label}
                                    {t.id === "telegram" && pendingPairings.length > 0 && (
                                        <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                                            {pendingPairings.length}
                                        </span>
                                    )}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* Tab content */}
                <div className="flex-1 min-w-0">
                    {tab === "account" && <AccountTab userEmail={userEmail} userName={userName} />}
                    {tab === "integrations" && <IntegrationsTab telegramConnected={telegramConnected} oauthEnabled={enableThirdPartyCli} />}
                    {tab === "telegram" && (
                        <TelegramTab
                            config={telegramConfig}
                            pendingPairings={pendingPairings}
                            approvedUsers={approvedUsers}
                            approvedGroups={approvedGroups}
                        />
                    )}
                    {tab === "providers" && <ProvidersTab providerKeys={providerKeys} />}
                    {tab === "api" && <ApiTab oauthClients={oauthClients} enableThirdPartyCli={enableThirdPartyCli} apiBaseUrl={apiBaseUrl} apiTokens={apiTokens} />}
                    {tab === "billing" && <BillingTab credits={credits} />}
                </div>
            </div>
        </div>
    );
}

// ─── Account Tab ────────────────────────────────────────────────────────────

function AccountTab({ userEmail, userName }: { userEmail: string; userName: string }) {
    const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message: string }>({ type: "idle", message: "" });
    const searchParams = useSearchParams();
    const forcePasswordChange = searchParams.get("forcePasswordChange") === "true";

    const handlePasswordChange = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setStatus({ type: "loading", message: "" });
        const fd = new FormData(e.currentTarget);
        const result = await changePasswordAction(fd);
        setStatus({ type: result.success ? "success" : "error", message: result.message ?? "" });
        if (result.success) {
            (e.target as HTMLFormElement).reset();
            // For forced password change, the server action re-authenticates
            // and redirects to /dashboard automatically (fresh JWT)
        }
    };

    return (
        <div className="space-y-6">
            {/* Show alert if first login */}
            {forcePasswordChange && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-amber-900">Password Change Required</h3>
                    <p className="text-xs text-amber-700 mt-1">
                        For security, please change your temporary password before continuing.
                    </p>
                </div>
            )}

            {/* Profile info */}
            <Section title="Profile" description="Your workspace account details.">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Name" value={userName || "--"} />
                    <Field label="Email" value={userEmail || "--"} />
                </div>
            </Section>

            {/* Change Password */}
            <Section title="Change Password" description="Update your login password. You'll stay signed in.">
                <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                    <FormInput label="Current Password" name="currentPassword" type="password" placeholder="--------" />
                    <FormInput label="New Password" name="newPassword" type="password" placeholder="Min. 8 characters" />
                    <FormInput label="Confirm New Password" name="confirmPassword" type="password" placeholder="--------" />
                    {status.type !== "idle" && (
                        <p className={`text-sm ${status.type === "success" ? "text-emerald-600" : "text-red-500"}`}>{status.message}</p>
                    )}
                    <button
                        type="submit"
                        disabled={status.type === "loading"}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        {status.type === "loading" ? "Updating..." : "Update Password"}
                    </button>
                </form>
            </Section>
        </div>
    );
}

// ─── Integrations Tab ───────────────────────────────────────────────────────

function IntegrationsTab({ telegramConnected, oauthEnabled }: { telegramConnected: boolean; oauthEnabled: boolean }) {
    const [tokenStatus, setTokenStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message: string }>({ type: "idle", message: "" });

    const handleSaveTelegram = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setTokenStatus({ type: "loading", message: "" });
        const fd = new FormData(e.currentTarget);
        const result = await saveTelegramTokenAction(fd);
        setTokenStatus({ type: result.success ? "success" : "error", message: result.message ?? "" });
        if (result.success) (e.target as HTMLFormElement).reset();
    };

    return (
        <div className="space-y-6">
            {/* Integration Status Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={`rounded-xl border p-4 ${telegramConnected ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${telegramConnected ? "bg-emerald-400" : "bg-slate-300"}`} />
                        <span className="text-sm font-semibold text-slate-900">Telegram</span>
                    </div>
                    <p className="text-xs text-slate-500">{telegramConnected ? "Bot connected" : "Not configured"}</p>
                </div>
                <div className={`rounded-xl border p-4 ${oauthEnabled ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${oauthEnabled ? "bg-emerald-400" : "bg-slate-300"}`} />
                        <span className="text-sm font-semibold text-slate-900">OAuth / CLI</span>
                    </div>
                    <p className="text-xs text-slate-500">{oauthEnabled ? "Enabled" : "Disabled"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                        <span className="text-sm font-semibold text-slate-900">WhatsApp</span>
                    </div>
                    <p className="text-xs text-slate-500">Coming soon</p>
                </div>
            </div>

            <Section
                title="Telegram Bot"
                description="Connect a Telegram bot to route customer messages through your AI. Get your token from @BotFather."
                badge={telegramConnected ? "Connected" : undefined}
            >
                <form onSubmit={handleSaveTelegram} className="space-y-4 max-w-md">
                    <FormInput
                        label="Bot API Token"
                        name="telegramToken"
                        type="password"
                        placeholder="123456789:ABCdef..."
                        mono
                    />
                    {tokenStatus.type !== "idle" && (
                        <p className={`text-sm ${tokenStatus.type === "success" ? "text-emerald-600" : "text-red-500"}`}>{tokenStatus.message}</p>
                    )}
                    <button
                        type="submit"
                        disabled={tokenStatus.type === "loading"}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        {telegramConnected ? "Update Token" : "Connect Bot"}
                    </button>
                </form>
            </Section>

            <Section title="WhatsApp Business" description="Connect WhatsApp Business API to handle customer conversations." badge="Coming Soon">
                <p className="text-sm text-slate-400">WhatsApp integration will be available in a future update.</p>
            </Section>
        </div>
    );
}

// ─── Telegram Tab ───────────────────────────────────────────────────────────

function TelegramTab({
    config,
    pendingPairings,
    approvedUsers,
    approvedGroups,
}: {
    config: { dmPolicy: string; groupPolicy: string; requireMention: boolean };
    pendingPairings: PairingInfo[];
    approvedUsers: AllowlistInfo[];
    approvedGroups: AllowlistInfo[];
}) {
    const [dmPolicy, setDmPolicy] = useState(config.dmPolicy);
    const [groupPolicy, setGroupPolicy] = useState(config.groupPolicy);
    const [requireMention, setRequireMention] = useState(config.requireMention);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [processing, setProcessing] = useState<string | null>(null);

    // Group form
    const [groupChatId, setGroupChatId] = useState("");
    const [groupName, setGroupName] = useState("");
    const [addingGroup, setAddingGroup] = useState(false);
    const [groupError, setGroupError] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ type: "block" | "remove"; contactId: string } | null>(null);

    const handleSavePolicies = async () => {
        setSaving(true);
        setMessage(null);
        const result = await updateTelegramPoliciesAction({
            telegram_dm_policy: dmPolicy,
            telegram_group_policy: groupPolicy,
            telegram_require_mention: requireMention,
        });
        setMessage(result.success ? "Policies saved." : (result.message || "Failed to save."));
        setSaving(false);
    };

    const handleApprove = async (code: string) => {
        setProcessing(code);
        const result = await approvePairingAction(code);
        if (!result.success) alert(result.message);
        setProcessing(null);
    };

    const handleReject = async (contactId: string) => {
        setProcessing(contactId);
        const result = await rejectPairingAction(contactId);
        if (!result.success) alert(result.message);
        setProcessing(null);
    };

    const handleRemove = async (contactId: string) => {
        setProcessing(contactId);
        const result = await removeFromAllowlistAction(contactId);
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
            setGroupError("Both fields are required.");
            return;
        }
        setAddingGroup(true);
        setGroupError(null);
        const result = await addGroupToAllowlistAction(groupChatId.trim(), groupName.trim());
        if (result.success) {
            setGroupChatId("");
            setGroupName("");
        } else {
            setGroupError(result.message || "Failed.");
        }
        setAddingGroup(false);
    };

    return (
        <div className="space-y-6">
            {/* Policies */}
            <Section title="Telegram Policies" description="Control how the bot handles DMs and group messages.">
                <div className="space-y-5 max-w-md">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">DM Policy</label>
                        <select
                            value={dmPolicy}
                            onChange={(e) => setDmPolicy(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="open">Open — anyone can DM</option>
                            <option value="pairing">Pairing — require approval code</option>
                            <option value="disabled">Disabled — ignore all DMs</option>
                        </select>
                        <p className="text-xs text-slate-400 mt-1">
                            {dmPolicy === "pairing" && "Unknown users will receive a pairing code. You approve them below."}
                            {dmPolicy === "open" && "All direct messages are processed without approval."}
                            {dmPolicy === "disabled" && "The bot will not respond to any direct messages."}
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Group Policy</label>
                        <select
                            value={groupPolicy}
                            onChange={(e) => setGroupPolicy(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="open">Open — respond in any group</option>
                            <option value="allowlist">Allowlist — only approved groups</option>
                            <option value="disabled">Disabled — ignore all groups</option>
                        </select>
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={requireMention}
                            onChange={(e) => setRequireMention(e.target.checked)}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                        />
                        <div>
                            <span className="text-sm font-medium text-slate-700">Require @mention in Groups</span>
                            <p className="text-xs text-slate-400">Bot only responds when @mentioned or replied to</p>
                        </div>
                    </label>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSavePolicies}
                            disabled={saving}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            {saving ? "Saving..." : "Save Policies"}
                        </button>
                        {message && (
                            <span className={`text-sm ${message.includes("saved") ? "text-emerald-600" : "text-red-500"}`}>{message}</span>
                        )}
                    </div>
                </div>
            </Section>

            {/* Pending Pairing Requests */}
            <Section
                title="Pending Pairing Requests"
                description="Users who DMed the bot and need approval. Enter their pairing code to approve."
                badge={pendingPairings.length > 0 ? `${pendingPairings.length} pending` : undefined}
            >
                {pendingPairings.length === 0 ? (
                    <p className="text-sm text-slate-400">No pending requests. When someone DMs the bot, they'll get a pairing code that shows up here.</p>
                ) : (
                    <div className="space-y-3">
                        {pendingPairings.map((p) => (
                            <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                                <div>
                                    <div className="text-sm font-medium text-slate-900">{p.contactName || "Unknown User"}</div>
                                    <div className="text-xs text-slate-500">
                                        Telegram ID: <span className="font-mono">{p.contactId}</span> &middot; Code: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">{p.code}</code>
                                    </div>
                                    <div className="text-xs text-slate-400 mt-0.5">{new Date(p.createdAt).toLocaleString()}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleApprove(p.code)}
                                        disabled={processing === p.code}
                                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                    >
                                        {processing === p.code ? "..." : "Approve"}
                                    </button>
                                    <button
                                        onClick={() => setConfirmAction({ type: "block", contactId: p.contactId })}
                                        disabled={processing === p.contactId}
                                        className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                                    >
                                        {processing === p.contactId ? "..." : "Block"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {/* Approved Contacts */}
            <Section title="Approved Contacts" description="Users who have been approved to DM the bot.">
                {approvedUsers.length === 0 ? (
                    <p className="text-sm text-slate-400">No approved contacts yet.</p>
                ) : (
                    <div className="space-y-2">
                        {approvedUsers.map((u) => (
                            <div key={u.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                                <div>
                                    <div className="text-sm font-medium text-slate-900">{u.contactName || "Unknown"}</div>
                                    <div className="text-xs text-slate-500 font-mono">{u.contactId}</div>
                                </div>
                                <button
                                    onClick={() => setConfirmAction({ type: "remove", contactId: u.contactId })}
                                    disabled={processing === u.contactId}
                                    className="text-xs font-medium text-red-600 px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {/* Approved Groups */}
            <Section title="Approved Groups" description="Groups where the bot is allowed to respond (when using allowlist policy).">
                {approvedGroups.length === 0 ? (
                    <p className="text-sm text-slate-400">No approved groups yet.</p>
                ) : (
                    <div className="space-y-2 mb-4">
                        {approvedGroups.map((g) => (
                            <div key={g.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                                <div>
                                    <div className="text-sm font-medium text-slate-900">{g.contactName || "Unnamed Group"}</div>
                                    <div className="text-xs text-slate-500 font-mono">{g.contactId}</div>
                                </div>
                                <button
                                    onClick={() => setConfirmAction({ type: "remove", contactId: g.contactId })}
                                    disabled={processing === g.contactId}
                                    className="text-xs font-medium text-red-600 px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="border-t border-slate-100 pt-4 mt-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Add Group</p>
                    <div className="flex flex-col sm:flex-row gap-2 max-w-lg">
                        <input
                            type="text"
                            placeholder="Group Chat ID (e.g. -1001234567890)"
                            value={groupChatId}
                            onChange={(e) => setGroupChatId(e.target.value)}
                            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <input
                            type="text"
                            placeholder="Group Name"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <button
                            onClick={handleAddGroup}
                            disabled={addingGroup}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                            {addingGroup ? "Adding..." : "Add Group"}
                        </button>
                    </div>
                    {groupError && <p className="text-xs text-red-500 mt-2">{groupError}</p>}
                </div>
            </Section>

            <ConfirmDialog
                open={!!confirmAction}
                title={confirmAction?.type === "block" ? "Block Contact" : "Remove from Allowlist"}
                message={
                    confirmAction?.type === "block"
                        ? "Block this contact? They will not be able to message the bot."
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

// ─── AI Providers Tab ────────────────────────────────────────────────────────

function ProvidersTab({ providerKeys }: { providerKeys: ProviderKeyInfo[] }) {
    return (
        <div className="space-y-6">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-sm text-indigo-800">
                    <span className="font-semibold">Bring Your Own Key (BYOK)</span> — Add your API keys to use different LLM providers.
                    Keys are encrypted at rest with AES-256-GCM. If no key is configured, the platform's global key is used as fallback.
                </p>
            </div>

            {PROVIDERS.map((provider) => {
                const existingKey = providerKeys.find((k) => k.provider === provider.id);
                return (
                    <ProviderCard
                        key={provider.id}
                        providerId={provider.id}
                        providerName={provider.name}
                        authMethods={provider.authMethods}
                        modelCount={provider.models.length}
                        existingKey={existingKey}
                    />
                );
            })}
        </div>
    );
}

function ProviderCard({
    providerId,
    providerName,
    authMethods,
    modelCount,
    existingKey,
}: {
    providerId: string;
    providerName: string;
    authMethods: string[];
    modelCount: number;
    existingKey?: ProviderKeyInfo;
}) {
    // Setup token (Claude Account) support is implemented but Anthropic's API
    // does not yet accept OAuth tokens. Keep infra ready, hide from UI for now.
    const supportsSetupToken = false; // authMethods.includes("setup_token") — re-enable when Anthropic supports OAuth
    const supportsOAuth = authMethods.includes("oauth");
    const isOpenAIOAuth = supportsOAuth && providerId === "openai";
    const [showForm, setShowForm] = useState(false);
    const [apiKey, setApiKey] = useState("");
    const [authMethod, setAuthMethod] = useState<"api_key" | "setup_token" | "oauth">(
        (existingKey?.authMethod as "api_key" | "setup_token" | "oauth") || "api_key"
    );
    const [status, setStatus] = useState<{ type: "idle" | "saving" | "validating" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });
    const router = useRouter();

    const isConfigured = !!existingKey?.isActive;
    const isSetupToken = authMethod === "setup_token";
    const isOAuth = authMethod === "oauth";
    const isTokenAuth = isSetupToken || isOAuth;

    const handleSave = async () => {
        if (!apiKey.trim()) return;
        setStatus({ type: "saving", message: "" });

        const fd = new FormData();
        fd.set("provider", providerId);
        fd.set("apiKey", apiKey);
        fd.set("authMethod", authMethod);

        const result = await saveProviderKeyAction(fd);
        setStatus({ type: result.success ? "success" : "error", message: result.message ?? "" });
        if (result.success) {
            setApiKey("");
            setShowForm(false);
            router.refresh();
        }
    };

    const handleRemove = async () => {
        setStatus({ type: "saving", message: "" });
        const fd = new FormData();
        fd.set("provider", providerId);

        const result = await removeProviderKeyAction(fd);
        setStatus({ type: result.success ? "success" : "error", message: result.message ?? "" });
        if (result.success) router.refresh();
    };

    const handleValidate = async () => {
        if (!apiKey.trim()) return;
        setStatus({ type: "validating", message: "" });

        const fd = new FormData();
        fd.set("provider", providerId);
        fd.set("apiKey", apiKey);
        fd.set("authMethod", authMethod);

        const result = await validateProviderKeyAction(fd);
        setStatus({
            type: result.valid ? "success" : "error",
            message: result.valid ? (isTokenAuth ? "Token is valid!" : "Key is valid!") : (result.error ?? "Validation failed"),
        });
    };

    // ── OpenAI browser-based OAuth sign-in (same-tab redirect with PKCE) ──
    const handleOpenAISignIn = async () => {
        try {
            // Generate PKCE pair
            const verifier = generateCodeVerifier();
            const challenge = await generateCodeChallenge(verifier);
            const state = generateState();
            const redirectUri = getCallbackUrl();

            // Store PKCE data in sessionStorage — survives the redirect round-trip
            sessionStorage.setItem("openai_pkce_verifier", verifier);
            sessionStorage.setItem("openai_pkce_state", state);
            sessionStorage.setItem("openai_redirect_uri", redirectUri);

            const authUrl = buildOpenAIAuthUrl({ codeChallenge: challenge, state, redirectUri });

            // Same-tab redirect: OpenAI auth → :1455 proxy → dashboard :3001
            // sessionStorage persists across same-origin navigations in the same tab.
            window.location.href = authUrl;
        } catch {
            setStatus({ type: "error", message: "Failed to start OAuth flow." });
        }
    };

    const [manualUrl, setManualUrl] = useState("");

    const handleManualPaste = () => {
        if (!manualUrl.trim()) return;
        try {
            const url = new URL(manualUrl);
            const code = url.searchParams.get("code");
            const returnedState = url.searchParams.get("state");
            const error = url.searchParams.get("error");
            const errorDesc = url.searchParams.get("error_description");

            if (error) {
                setStatus({ type: "error", message: errorDesc || "Authorization was denied." });
                return;
            }

            const savedState = sessionStorage.getItem("openai_pkce_state");
            if (returnedState !== savedState) {
                setStatus({ type: "error", message: "Invalid response (state mismatch). Please try again." });
                return;
            }

            const savedVerifier = sessionStorage.getItem("openai_pkce_verifier");
            const savedRedirectUri = sessionStorage.getItem("openai_redirect_uri");

            if (!code || !savedVerifier || !savedRedirectUri) {
                setStatus({ type: "error", message: "Missing OAuth data. Please start the flow again." });
                return;
            }

            setAuthMethod("oauth");
            setStatus({ type: "saving", message: "Exchanging token..." });

            exchangeOpenAICodeAction({
                code,
                codeVerifier: savedVerifier,
                redirectUri: savedRedirectUri,
            }).then((result) => {
                sessionStorage.removeItem("openai_pkce_verifier");
                sessionStorage.removeItem("openai_pkce_state");
                sessionStorage.removeItem("openai_redirect_uri");
                setManualUrl("");

                setStatus({
                    type: result.success ? "success" : "error",
                    message: result.message ?? "",
                });

                if (result.success) {
                    setShowForm(false);
                    router.refresh();
                }
            });
        } catch (err) {
            setStatus({ type: "error", message: "Invalid URL format." });
        }
    };

    // ── Handle OAuth callback code from URL (after redirect back) ──
    const searchParams = useSearchParams();
    useEffect(() => {
        if (providerId !== "openai") return;

        const code = searchParams.get("openai_code");
        const returnedState = searchParams.get("openai_state");
        const error = searchParams.get("openai_error");
        const errorDesc = searchParams.get("openai_error_desc");

        if (!code && !error) return;

        // Clean URL immediately
        const url = new URL(window.location.href);
        url.searchParams.delete("openai_code");
        url.searchParams.delete("openai_state");
        url.searchParams.delete("openai_error");
        url.searchParams.delete("openai_error_desc");
        window.history.replaceState({}, "", url.toString());

        if (error) {
            setStatus({ type: "error", message: errorDesc || "Authorization was denied." });
            return;
        }

        // Verify state
        const savedState = sessionStorage.getItem("openai_pkce_state");
        if (returnedState !== savedState) {
            setStatus({ type: "error", message: "Invalid response (state mismatch). Please try again." });
            return;
        }

        const savedVerifier = sessionStorage.getItem("openai_pkce_verifier");
        const savedRedirectUri = sessionStorage.getItem("openai_redirect_uri");

        if (!code || !savedVerifier || !savedRedirectUri) {
            setStatus({ type: "error", message: "Missing OAuth data. Please try again." });
            return;
        }

        // Exchange code for tokens
        setAuthMethod("oauth");
        setStatus({ type: "saving", message: "Exchanging token..." });

        exchangeOpenAICodeAction({
            code,
            codeVerifier: savedVerifier,
            redirectUri: savedRedirectUri,
        }).then((result) => {
            // Clean up sessionStorage
            sessionStorage.removeItem("openai_pkce_verifier");
            sessionStorage.removeItem("openai_pkce_state");
            sessionStorage.removeItem("openai_redirect_uri");

            setStatus({
                type: result.success ? "success" : "error",
                message: result.message ?? "",
            });

            if (result.success) {
                setShowForm(false);
                router.refresh();
            }
        });
    }, [searchParams, providerId]); // eslint-disable-line react-hooks/exhaustive-deps

    const displayAuthMethods = authMethods
        .map((m) => (m === "setup_token" ? "setup token" : m === "oauth" ? "OAuth" : m === "api_key" ? "API key" : m))
        .join(", ");

    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isConfigured ? "bg-emerald-400" : "bg-slate-300"}`} />
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900">{providerName}</h3>
                        <p className="text-xs text-slate-400">
                            {modelCount} model{modelCount !== 1 ? "s" : ""} &middot; {displayAuthMethods}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isConfigured && (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                            {existingKey?.authMethod === "setup_token" ? "Claude Account" : existingKey?.authMethod === "oauth" ? "ChatGPT Subscription" : "Configured"}
                        </span>
                    )}
                </div>
            </div>

            <div className="px-6 py-4">
                {isConfigured && !showForm && (
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-600">
                                {existingKey?.authMethod === "setup_token" ? "Setup token configured" : existingKey?.authMethod === "oauth" ? "OAuth token configured" : "API key configured"}
                                {existingKey?.keyAlias && <span className="text-slate-400"> ({existingKey.keyAlias})</span>}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowForm(true)}
                                className="text-xs font-medium text-slate-600 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                Update
                            </button>
                            <button
                                onClick={handleRemove}
                                className="text-xs font-medium text-red-600 px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                )}

                {(!isConfigured || showForm) && (
                    <div className="space-y-3 max-w-md">
                        {supportsSetupToken && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Authentication Method</label>
                                <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => { setAuthMethod("api_key"); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${authMethod === "api_key"
                                            ? "bg-slate-900 text-white"
                                            : "bg-white text-slate-600 hover:bg-slate-50"
                                            }`}
                                    >
                                        API Key
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setAuthMethod("setup_token"); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${authMethod === "setup_token"
                                            ? "bg-slate-900 text-white"
                                            : "bg-white text-slate-600 hover:bg-slate-50"
                                            }`}
                                    >
                                        Claude Account
                                    </button>
                                </div>
                            </div>
                        )}

                        {supportsOAuth && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Authentication Method</label>
                                <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => { setAuthMethod("api_key"); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${authMethod === "api_key"
                                            ? "bg-slate-900 text-white"
                                            : "bg-white text-slate-600 hover:bg-slate-50"
                                            }`}
                                    >
                                        API Key
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setAuthMethod("oauth"); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${authMethod === "oauth"
                                            ? "bg-slate-900 text-white"
                                            : "bg-white text-slate-600 hover:bg-slate-50"
                                            }`}
                                    >
                                        ChatGPT Subscription
                                    </button>
                                </div>
                            </div>
                        )}

                        {isSetupToken && (
                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                                <p className="text-xs text-amber-800">
                                    <span className="font-semibold">Use your Claude Pro/Max subscription.</span>{" "}
                                    Run <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">claude setup-token</code> in
                                    your terminal, then paste the token below.
                                </p>
                            </div>
                        )}

                        {/* OpenAI OAuth: browser-based sign-in button */}
                        {isOAuth && isOpenAIOAuth && (
                            <>
                                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                                    <p className="text-xs text-emerald-800">
                                        <span className="font-semibold">Use your ChatGPT Plus/Pro/Team subscription.</span>{" "}
                                        Sign in with your OpenAI account to connect automatically — no API key or CLI needed.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleOpenAISignIn}
                                    disabled={status.type === "saving"}
                                    className="w-full px-4 py-2.5 bg-[#10a37f] hover:bg-[#0e8c6b] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" /></svg>
                                    {status.type === "saving" ? (status.message || "Connecting...") : "Sign in with ChatGPT"}
                                </button>

                                <div className="mt-4 border-t border-slate-100 pt-3">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Remote Access Fallback
                                    </label>
                                    <p className="text-[11px] text-slate-500 mb-2 leading-tight">
                                        If the sign-in redirect fails to load, copy the URL from the failed page and paste it below.
                                    </p>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={manualUrl}
                                            onChange={(e) => setManualUrl(e.target.value)}
                                            placeholder="http://localhost:3001/auth/callback?code=..."
                                            className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleManualPaste}
                                            disabled={!manualUrl.trim() || status.type === "saving"}
                                            className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded hover:bg-slate-800 disabled:opacity-50"
                                        >
                                            Submit
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Non-OpenAI OAuth or setup_token: manual paste field */}
                        {isOAuth && !isOpenAIOAuth && (
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                                <p className="text-xs text-blue-800">
                                    <span className="font-semibold">OAuth token.</span>{" "}
                                    Paste your OAuth token below.
                                </p>
                            </div>
                        )}

                        {/* Show manual key/token input for: API key, setup_token, or non-OpenAI OAuth */}
                        {(!isOAuth || !isOpenAIOAuth) && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                        {isSetupToken ? "Setup Token" : isOAuth ? "OAuth Token" : "API Key"}
                                    </label>
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder={
                                            isSetupToken
                                                ? "Paste your setup token (sk-ant-oat01-...)"
                                                : isOAuth
                                                    ? "Paste your OAuth token..."
                                                    : `Enter your ${providerName} API key...`
                                        }
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:font-sans placeholder:text-slate-400"
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSave}
                                        disabled={!apiKey.trim() || status.type === "saving"}
                                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {isTokenAuth ? "Save Token" : "Save Key"}
                                    </button>
                                    <button
                                        onClick={handleValidate}
                                        disabled={!apiKey.trim() || status.type === "validating"}
                                        className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40"
                                    >
                                        {isTokenAuth ? "Test Token" : "Test Key"}
                                    </button>
                                    {showForm && (
                                        <button
                                            onClick={() => { setShowForm(false); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Status messages (shown for all auth methods) */}
                        {status.type !== "idle" && !isOpenAIOAuth && (
                            <p className={`text-sm ${status.type === "success" ? "text-emerald-600" : status.type === "error" ? "text-red-500" : "text-slate-500"}`}>
                                {status.type === "saving" ? "Saving..." : status.type === "validating" ? "Validating..." : status.message}
                            </p>
                        )}

                        {/* OpenAI OAuth status (separate since button already shows saving state) */}
                        {isOpenAIOAuth && status.type === "error" && (
                            <p className="text-sm text-red-500">{status.message}</p>
                        )}
                        {isOpenAIOAuth && status.type === "success" && (
                            <p className="text-sm text-emerald-600">{status.message}</p>
                        )}

                        {/* Cancel button for OpenAI OAuth when updating */}
                        {isOpenAIOAuth && showForm && status.type !== "saving" && (
                            <button
                                onClick={() => { setShowForm(false); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── API & Developer Tab ────────────────────────────────────────────────────

function ApiTab({ oauthClients, enableThirdPartyCli, apiBaseUrl, apiTokens }: {
    oauthClients: { clientId: string; name: string; createdAt: string }[];
    enableThirdPartyCli: boolean;
    apiBaseUrl: string;
    apiTokens: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[];
}) {
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [cliEnabled, setCliEnabled] = useState(enableThirdPartyCli);
    const [toggling, setToggling] = useState(false);
    const [connecting, setConnecting] = useState(false);

    const [generatingToken, setGeneratingToken] = useState(false);
    const [newToken, setNewToken] = useState<string | null>(null);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);

    const router = useRouter();

    const copy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleToggleCli = async () => {
        setToggling(true);
        const newValue = !cliEnabled;
        const result = await toggleCliAccessAction(newValue);
        if (result.success) {
            setCliEnabled(newValue);
            router.refresh();
        } else {
            alert(result.message);
        }
        setToggling(false);
    };

    const handleConnect = async () => {
        setConnecting(true);
        // Ensure dashboard client exists, then navigate to the consent page
        const result = await ensureDashboardClientAction();
        if (result.error || !result.clientId) {
            alert(result.error ?? "Failed to initialize. Please try again.");
            setConnecting(false);
            return;
        }
        // Navigate to the consent page with mode=connect for dashboard-initiated flow
        window.location.href = `/oauth/authorize?client_id=${result.clientId}&mode=connect`;
    };

    const handleGenerateApiToken = async () => {
        setGeneratingToken(true);
        setNewToken(null);
        const { generateApiTokenAction } = await import("./actions");

        const fd = new FormData();
        fd.set("name", "Dashboard Token");
        const result = await generateApiTokenAction(fd);
        if (result.success && result.token) {
            setNewToken(result.token);
            router.refresh();
        } else {
            alert(result.message);
        }
        setGeneratingToken(false);
    };

    const handleRevokeToken = async () => {
        if (!revokeTokenId) return;
        setRevoking(revokeTokenId);
        const { revokeApiTokenAction } = await import("./actions");
        const result = await revokeApiTokenAction(revokeTokenId);
        setRevokeTokenId(null);
        if (result.success) {
            router.refresh();
        } else {
            alert(result.message);
        }
        setRevoking(null);
    };

    return (
        <div className="space-y-6">
            {/* CLI Access Toggle */}
            <Section
                title="Third-Party CLI Access"
                description="Allow developer tools like Claude Code, Cursor CLI, and Codex to authenticate with this workspace."
                badge={cliEnabled ? "Enabled" : undefined}
            >
                <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer group w-fit">
                        <div className="relative">
                            <input
                                type="checkbox"
                                checked={cliEnabled}
                                onChange={handleToggleCli}
                                disabled={toggling}
                                className="sr-only peer"
                            />
                            <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                        </div>
                        <span className="text-sm text-slate-700 group-hover:text-slate-900">
                            {toggling ? "Saving..." : "Enable CLI tool authentication"}
                        </span>
                    </label>

                    {cliEnabled && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                            <p className="text-xs text-emerald-800 font-medium">
                                OAuth is active. CLI tools can discover and authenticate with this workspace.
                            </p>
                        </div>
                    )}
                </div>
            </Section>

            {/* Connect & Generate Token */}
            <Section
                title="Connect & Generate Token"
                description="Click the button below to authorize and generate an API token. You'll see a consent page to approve the connection."
            >
                <div className="space-y-4 max-w-lg">
                    {!cliEnabled ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-xs text-amber-800">Enable CLI access above first before connecting.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <button
                                onClick={handleConnect}
                                disabled={connecting}
                                className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                {connecting ? "Preparing..." : "Connect & Authorize"}
                            </button>
                            <p className="text-xs text-slate-500">
                                Opens a consent page where you review permissions and click <strong>Approve</strong>. You&apos;ll get an API token to copy.
                            </p>
                        </div>
                    )}
                </div>
            </Section>

            {/* How CLI Tools Connect */}
            <Section
                title="How External CLI Tools Connect"
                description="When an external CLI tool (Claude Code, Codex, etc.) connects, this is the flow:"
            >
                <div className="space-y-3 max-w-lg">
                    <div className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">1</span>
                        <p className="text-sm text-slate-700">Point the CLI tool at your API server URL below.</p>
                    </div>
                    <div className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
                        <p className="text-sm text-slate-700">The CLI auto-discovers OAuth endpoints and opens your browser.</p>
                    </div>
                    <div className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">3</span>
                        <p className="text-sm text-slate-700">You see the same consent page — click <strong>Approve</strong> and the CLI receives a token automatically.</p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-xs font-medium text-slate-500 mb-2">API Server URL</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-700 truncate">{apiBaseUrl}</code>
                            <button
                                onClick={() => copy(apiBaseUrl, "api-url")}
                                className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
                            >
                                {copiedId === "api-url" ? "Copied!" : "Copy"}
                            </button>
                        </div>
                    </div>
                </div>
            </Section>

            {/* HTTP API Tokens */}
            <Section
                title="API Tokens"
                description="Manage static tokens to access the OpenAI-compatible HTTP API."
            >
                <div className="space-y-4 max-w-lg">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={handleGenerateApiToken}
                            disabled={generatingToken}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            {generatingToken ? "Generating..." : "Generate New API Token"}
                        </button>
                    </div>

                    {newToken && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2 relative">
                            <button
                                onClick={() => setNewToken(null)}
                                className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                            <p className="text-sm font-medium text-emerald-900">Your new API token</p>
                            <p className="text-xs text-emerald-700">Please copy this token now. You won&apos;t be able to see it again!</p>
                            <div className="flex items-center gap-2 mt-2">
                                <code className="flex-1 text-sm bg-white border border-emerald-200 rounded-lg px-3 py-2 font-mono text-emerald-900">{newToken}</code>
                                <button
                                    onClick={() => copy(newToken, "new-token")}
                                    className="px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                                >
                                    {copiedId === "new-token" ? "Copied!" : "Copy"}
                                </button>
                            </div>
                        </div>
                    )}

                    {apiTokens.length > 0 && (
                        <div className="space-y-3 mt-6">
                            {apiTokens.map(token => (
                                <div key={token.id} className="border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{token.name}</p>
                                        <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                                            <p>Created: {new Date(token.createdAt).toLocaleDateString()}</p>
                                            <p>Last used: {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleDateString() : "Never"}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setRevokeTokenId(token.id)}
                                        disabled={revoking === token.id}
                                        className="text-xs font-medium text-red-600 px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                                    >
                                        {revoking === token.id ? "Revoking..." : "Revoke"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Section>

            {/* Connected Applications */}
            {oauthClients.length > 0 && (
                <Section
                    title="Connected Applications"
                    description="OAuth clients that have been registered with this workspace."
                >
                    <div className="space-y-3 max-w-lg">
                        {oauthClients.map(client => (
                            <div key={client.clientId} className="border border-slate-200 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{client.name}</span>
                                    <span className="text-xs text-slate-400">{new Date(client.createdAt).toLocaleDateString()}</span>
                                </div>
                                <CredentialRow
                                    label="Client ID"
                                    value={client.clientId}
                                    onCopy={() => copy(client.clientId, `cid-${client.clientId}`)}
                                    copied={copiedId === `cid-${client.clientId}`}
                                />
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            <ConfirmDialog
                open={!!revokeTokenId}
                title="Revoke API Token"
                message="Are you sure you want to revoke this token? This action cannot be undone. Any applications using this token will lose access."
                confirmLabel="Revoke Token"
                variant="danger"
                onConfirm={handleRevokeToken}
                onCancel={() => setRevokeTokenId(null)}
            />
        </div>
    );
}

// ─── Billing Tab ─────────────────────────────────────────────────────────────

function BillingTab({ credits }: { credits: number }) {
    const status = credits > 500 ? { label: "Healthy", cls: "bg-emerald-100 text-emerald-700" }
        : credits > 0 ? { label: "Low", cls: "bg-yellow-100 text-yellow-700" }
            : { label: "Empty", cls: "bg-red-100 text-red-700" };

    return (
        <div className="space-y-6">
            <Section title="Credit Balance" description="AI usage is charged in credits. 1 credit = ~1,500 input tokens.">
                <div className="flex items-center gap-4">
                    <div>
                        <p className="text-3xl font-bold text-slate-900">{credits.toLocaleString()}</p>
                        <p className="text-sm text-slate-500 mt-0.5">~{(credits * 1500).toLocaleString()} input tokens remaining</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.cls}`}>{status.label}</span>
                </div>
            </Section>

            <Section title="Top Up" description="Purchase additional credits. Payment gateway coming soon.">
                <div className="grid grid-cols-3 gap-3 max-w-lg">
                    {[
                        { label: "Starter", credits: 1000, price: "$10" },
                        { label: "Growth", credits: 5000, price: "$45" },
                        { label: "Scale", credits: 15000, price: "$120" },
                    ].map(plan => (
                        <button
                            key={plan.label}
                            disabled
                            className="flex flex-col p-4 rounded-xl border border-slate-200 text-left hover:border-indigo-300 hover:bg-indigo-50/30 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{plan.label}</span>
                            <span className="text-xl font-bold text-slate-900 mt-1">{plan.price}</span>
                            <span className="text-xs text-slate-400 mt-0.5">{plan.credits.toLocaleString()} credits</span>
                        </button>
                    ))}
                </div>
                <p className="text-xs text-slate-400 mt-3">Contact your administrator to top up your balance.</p>
            </Section>
        </div>
    );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Section({ title, description, badge, children }: { title: string; description: string; badge?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{description}</p>
                </div>
                {badge && (
                    <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${badge === "Connected" ? "bg-emerald-100 text-emerald-700" : badge.includes("pending") ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                        {badge}
                    </span>
                )}
            </div>
            <div className="px-6 py-5">{children}</div>
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-sm text-slate-800 font-medium">{value}</p>
        </div>
    );
}

function FormInput({ label, name, type, placeholder, mono }: { label: string; name: string; type: string; placeholder: string; mono?: boolean }) {
    return (
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
            <input
                type={type}
                name={name}
                placeholder={placeholder}
                className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 ${mono ? "font-mono placeholder:font-sans" : ""}`}
            />
        </div>
    );
}

function CredentialRow({ label, value, onCopy, copied, masked, hint }: { label: string; value: string; onCopy?: () => void; copied?: boolean; masked?: boolean; hint?: string }) {
    return (
        <div>
            <p className="text-xs font-medium text-slate-400 mb-1">{label}</p>
            <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-700 truncate">{value}</code>
                {onCopy && (
                    <button onClick={onCopy} className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600">
                        {copied ? "Copied!" : "Copy"}
                    </button>
                )}
                {masked && hint && <span className="text-xs text-slate-400 flex-shrink-0">{hint}</span>}
            </div>
        </div>
    );
}
