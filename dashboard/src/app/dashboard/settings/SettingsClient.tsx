"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
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
    saveEmailConfigAction,
    testEmailConnectionAction,
    testEmbeddingKeyAction,
    saveEmbeddingKeyAction,
    removeEmbeddingKeyAction,
    getEmbeddingConfigAction,
    saveEmbeddingProviderAction,
    testMinimaxEmbeddingAction,
    saveVoyageKeyAction,
    testVoyageEmbeddingAction,
    saveDraftChannelConfigAction,
    saveAutoMemorySettingsAction,
} from "./actions";
import { ensureDashboardClientAction } from "../../oauth/authorize/actions";
import { PROVIDERS } from "../../../utils/models";
import { CHANNEL_SETUP_CATALOG, type ChannelSetupDefinition } from "../../../utils/channel-catalog";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "../../../utils/pkce";
import { buildOpenAIAuthUrl, getCallbackUrl } from "../../../utils/openai-oauth";
import ConfirmDialog from "../../../components/ConfirmDialog";
import TwoFactorCard from "../../../components/TwoFactorCard";
import { PageHeader, Card, CardHeader, SettingRow, Toggle } from "../../../components/dashboard/ui";

const TABS = [
    { id: "account", label: "Account" },
    { id: "integrations", label: "Integrations" },
    { id: "telegram", label: "Telegram" },
    { id: "providers", label: "AI Providers" },
    { id: "memory", label: "Memory" },
    { id: "email", label: "Email" },
    { id: "plugins", label: "Plugins" },
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

interface PluginCredentialField {
    name: string;
    label: string;
    type: "url" | "text" | "secret";
    placeholder?: string;
    required?: boolean;
    helpText?: string;
    configured: boolean;
}

interface PluginData {
    id: string;
    name: string;
    version: string | null;
    config: {
        description: string;
        author: string;
        toolCount: number;
        hookNames: string[];
        routeCount: number;
        credentialSchema: PluginCredentialField[];
    };
}

interface ChannelSetupStatus {
    type: string;
    status: string;
    configuredFields: string[];
}

interface Props {
    tab: string;
    credits: number;
    telegramConnected: boolean;
    channelSetups: ChannelSetupStatus[];
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
        visionEnabled: boolean;
    };
    autoMemoryConfig: {
        enabled: boolean;
        maxMemories: number;
    };
    pendingPairings: PairingInfo[];
    approvedUsers: AllowlistInfo[];
    approvedGroups: AllowlistInfo[];
    plugins: PluginData[];
    savePluginCredentials: (formData: FormData) => Promise<void>;
    emailConfig: { smtp?: any; imap?: any } | null;
    embeddingConfigured: boolean;
}

export default function SettingsClient({
    tab, credits, telegramConnected, oauthClients, apiTokens, userEmail, userName, providerKeys,
    channelSetups,
    enableThirdPartyCli, apiBaseUrl,
    telegramConfig, autoMemoryConfig, pendingPairings, approvedUsers, approvedGroups,
    plugins, savePluginCredentials,
    emailConfig,
    embeddingConfigured,
}: Props) {
    const router = useRouter();

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <PageHeader title="Settings" description="Manage your workspace, account, integrations, and API access." />

            <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                {/* Tab nav — horizontal scroll on mobile, vertical rail on desktop */}
                <nav className="w-full md:w-44 flex-shrink-0">
                    <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0">
                        {TABS.map(t => (
                            <li key={t.id} className="flex-shrink-0">
                                <Link
                                    href={`/dashboard/settings?tab=${t.id}`}
                                    className={`block w-full text-left whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${tab === t.id
                                        ? "bg-pulse-tint text-pulse-accent-hi"
                                        : "text-pulse-muted hover:text-pulse-text hover:bg-pulse-hover"
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
                    {tab === "integrations" && <IntegrationsTab telegramConnected={telegramConnected} oauthEnabled={enableThirdPartyCli} channelSetups={channelSetups} />}
                    {tab === "telegram" && (
                        <TelegramTab
                            config={telegramConfig}
                            pendingPairings={pendingPairings}
                            approvedUsers={approvedUsers}
                            approvedGroups={approvedGroups}
                        />
                    )}
                    {tab === "email" && <EmailTab config={emailConfig} />}
                    {tab === "providers" && <ProvidersTab providerKeys={providerKeys} />}
                    {tab === "memory" && <MemoryTab embeddingConfigured={embeddingConfigured} autoMemoryConfig={autoMemoryConfig} />}
                    {tab === "plugins" && <PluginsTab plugins={plugins} savePluginCredentials={savePluginCredentials} />}
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
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-amber-400">Password Change Required</h3>
                    <p className="text-xs text-amber-400/90 mt-1">
                        For security, please change your temporary password before continuing.
                    </p>
                </div>
            )}

            {/* Profile info */}
            <Card>
                <CardHeader title="Profile" description="Your workspace account details." />
                <div className="divide-y divide-pulse-border-subtle">
                    <SettingRow title="Name" control={<span className="text-sm text-pulse-text-soft">{userName || "--"}</span>} />
                    <SettingRow title="Email" control={<span className="text-sm text-pulse-text-soft">{userEmail || "--"}</span>} />
                </div>
            </Card>

            {/* Change Password */}
            <Section title="Change Password" description="Update your login password. You'll stay signed in.">
                <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                    <FormInput label="Current Password" name="currentPassword" type="password" placeholder="--------" />
                    <FormInput label="New Password" name="newPassword" type="password" placeholder="Min. 8 characters" />
                    <FormInput label="Confirm New Password" name="confirmPassword" type="password" placeholder="--------" />
                    {status.type !== "idle" && (
                        <p className={`text-sm ${status.type === "success" ? "text-green-400" : "text-red-400"}`}>{status.message}</p>
                    )}
                    <button
                        type="submit"
                        disabled={status.type === "loading"}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                    >
                        {status.type === "loading" ? "Updating..." : "Update Password"}
                    </button>
                </form>
            </Section>

            {/* Security */}
            <TwoFactorCard variant="pulse" />
        </div>
    );
}

// ─── Integrations Tab ───────────────────────────────────────────────────────

function IntegrationsTab({
    telegramConnected,
    oauthEnabled,
    channelSetups,
}: {
    telegramConnected: boolean;
    oauthEnabled: boolean;
    channelSetups: ChannelSetupStatus[];
}) {
    const [tokenStatus, setTokenStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message: string }>({ type: "idle", message: "" });
    const setupMap = new Map(channelSetups.map((setup) => [setup.type, setup]));

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
                <div className={`rounded-xl border p-4 ${telegramConnected ? "border-emerald-500/30 bg-emerald-500/10" : "border-pulse-border-subtle bg-pulse-panel"}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${telegramConnected ? "bg-emerald-400" : "bg-pulse-border-strong"}`} />
                        <span className="text-sm font-semibold text-pulse-text">Telegram</span>
                    </div>
                    <p className="text-xs text-pulse-muted">{telegramConnected ? "Bot connected" : "Not configured"}</p>
                </div>
                <div className={`rounded-xl border p-4 ${oauthEnabled ? "border-emerald-500/30 bg-emerald-500/10" : "border-pulse-border-subtle bg-pulse-panel"}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${oauthEnabled ? "bg-emerald-400" : "bg-pulse-border-strong"}`} />
                        <span className="text-sm font-semibold text-pulse-text">OAuth / CLI</span>
                    </div>
                    <p className="text-xs text-pulse-muted">{oauthEnabled ? "Enabled" : "Disabled"}</p>
                </div>
                <div className="rounded-xl border border-pulse-border-subtle bg-pulse-panel p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${setupMap.get("whatsapp")?.status === "draft" ? "bg-amber-400" : "bg-pulse-border-strong"}`} />
                        <span className="text-sm font-semibold text-pulse-text">WhatsApp</span>
                    </div>
                    <p className="text-xs text-pulse-muted">{setupMap.get("whatsapp")?.status === "draft" ? "Draft saved" : "Not configured"}</p>
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
                        <p className={`text-sm ${tokenStatus.type === "success" ? "text-green-400" : "text-red-400"}`}>{tokenStatus.message}</p>
                    )}
                    <button
                        type="submit"
                        disabled={tokenStatus.type === "loading"}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                    >
                        {telegramConnected ? "Update Token" : "Connect Bot"}
                    </button>
                </form>
            </Section>

            {CHANNEL_SETUP_CATALOG.map((definition) => (
                <ChannelSetupForm
                    key={definition.type}
                    definition={definition}
                    setup={setupMap.get(definition.type)}
                />
            ))}
        </div>
    );
}

function ChannelSetupForm({
    definition,
    setup,
}: {
    definition: ChannelSetupDefinition;
    setup?: ChannelSetupStatus;
}) {
    const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message: string }>({ type: "idle", message: "" });
    const isDraft = setup?.status === "draft";

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setStatus({ type: "loading", message: "" });
        const fd = new FormData(e.currentTarget);
        const result = await saveDraftChannelConfigAction(fd);
        setStatus({ type: result.success ? "success" : "error", message: result.message ?? "" });
        if (result.success) {
            (e.target as HTMLFormElement).reset();
        }
    };

    return (
        <Section
            title={definition.label}
            description={definition.description}
            badge={isDraft ? "Draft saved" : "Adapter pending"}
        >
            <form onSubmit={handleSave} className="space-y-4 max-w-xl">
                <input type="hidden" name="channelType" value={definition.type} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {definition.fields.map((field) => {
                        const configured = setup?.configuredFields.includes(field.name);
                        return (
                            <div key={field.name}>
                                <FormInput
                                    label={field.label}
                                    name={field.name}
                                    type={field.type === "secret" ? "password" : field.type}
                                    placeholder={configured && field.type === "secret" ? "Configured; leave blank to keep" : field.placeholder}
                                    mono={field.type === "secret"}
                                />
                                {field.helpText && <p className="text-xs text-pulse-faint mt-1">{field.helpText}</p>}
                            </div>
                        );
                    })}
                </div>
                {status.type !== "idle" && (
                    <p className={`text-sm ${status.type === "success" ? "text-green-400" : "text-red-400"}`}>{status.message}</p>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <button
                        type="submit"
                        disabled={status.type === "loading"}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                    >
                        {status.type === "loading" ? "Saving..." : isDraft ? "Update Draft" : "Save Draft"}
                    </button>
                    <p className="text-xs text-pulse-faint">Saved settings stay inactive until the runtime adapter is installed.</p>
                </div>
            </form>
        </Section>
    );
}

// ─── Telegram Tab ───────────────────────────────────────────────────────────

function TelegramTab({
    config,
    pendingPairings,
    approvedUsers,
    approvedGroups,
}: {
    config: { dmPolicy: string; groupPolicy: string; requireMention: boolean; visionEnabled: boolean };
    pendingPairings: PairingInfo[];
    approvedUsers: AllowlistInfo[];
    approvedGroups: AllowlistInfo[];
}) {
    const [dmPolicy, setDmPolicy] = useState(config.dmPolicy);
    const [groupPolicy, setGroupPolicy] = useState(config.groupPolicy);
    const [requireMention, setRequireMention] = useState(config.requireMention);
    const [visionEnabled, setVisionEnabled] = useState(config.visionEnabled);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [processing, setProcessing] = useState<string | null>(null);

    // Group form
    const [groupChatId, setGroupChatId] = useState("");
    const [groupName, setGroupName] = useState("");
    const [addingGroup, setAddingGroup] = useState(false);
    const [groupError, setGroupError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ type: "block" | "remove"; contactId: string } | null>(null);

    const handleSavePolicies = async () => {
        setSaving(true);
        setMessage(null);
        const result = await updateTelegramPoliciesAction({
            telegram_dm_policy: dmPolicy,
            telegram_group_policy: groupPolicy,
            telegram_require_mention: requireMention,
            telegram_vision_enabled: visionEnabled,
        });
        setMessage(result.success ? "Policies saved." : (result.message || "Failed to save."));
        setSaving(false);
    };

    const handleApprove = async (code: string) => {
        setProcessing(code);
        setActionError(null);
        const result = await approvePairingAction(code);
        if (!result.success) setActionError(result.message ?? "Failed to approve pairing.");
        setProcessing(null);
    };

    const handleReject = async (contactId: string) => {
        setProcessing(contactId);
        setActionError(null);
        const result = await rejectPairingAction(contactId);
        if (!result.success) setActionError(result.message ?? "Failed to reject pairing.");
        setProcessing(null);
    };

    const handleRemove = async (contactId: string) => {
        setProcessing(contactId);
        setActionError(null);
        const result = await removeFromAllowlistAction(contactId);
        if (!result.success) setActionError(result.message ?? "Failed to remove contact.");
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
            {actionError && (
                <div role="alert" className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm border border-red-500/30 mb-4">
                    {actionError}
                    <button onClick={() => setActionError(null)} aria-label="Dismiss error" className="ml-2 text-red-400 hover:text-red-300 font-bold cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">&times;</button>
                </div>
            )}
            {/* Policies */}
            <Card>
                <CardHeader title="Telegram Policies" description="Control how the bot handles DMs and group messages." />
                <div className="divide-y divide-pulse-border-subtle">
                    <SettingRow
                        title="DM Policy"
                        description={
                            (dmPolicy === "pairing" && "Unknown users will receive a pairing code. You approve them below.") ||
                            (dmPolicy === "open" && "All direct messages are processed without approval.") ||
                            (dmPolicy === "disabled" && "The bot will not respond to any direct messages.") ||
                            undefined
                        }
                        control={
                            <select
                                value={dmPolicy}
                                onChange={(e) => setDmPolicy(e.target.value)}
                                className="border border-pulse-border rounded-lg px-3 py-1.5 text-sm text-pulse-text bg-pulse-panel focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="open">Open — anyone can DM</option>
                                <option value="pairing">Pairing — require approval code</option>
                                <option value="disabled">Disabled — ignore all DMs</option>
                            </select>
                        }
                    />
                    <SettingRow
                        title="Group Policy"
                        description="Controls whether the bot responds in groups it's added to."
                        control={
                            <select
                                value={groupPolicy}
                                onChange={(e) => setGroupPolicy(e.target.value)}
                                className="border border-pulse-border rounded-lg px-3 py-1.5 text-sm text-pulse-text bg-pulse-panel focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="open">Open — respond in any group</option>
                                <option value="allowlist">Allowlist — only approved groups</option>
                                <option value="disabled">Disabled — ignore all groups</option>
                            </select>
                        }
                    />
                    <SettingRow
                        title="Require @mention in Groups"
                        description="Bot only responds when @mentioned or replied to."
                        control={<Toggle checked={requireMention} onChange={setRequireMention} label="Require @mention in groups" />}
                    />
                    <SettingRow
                        title="Photo understanding (vision)"
                        description="Let agents see photos sent on Telegram. When off, the bot still receives the message but tells the agent it can't view images."
                        control={<Toggle checked={visionEnabled} onChange={setVisionEnabled} label="Photo understanding (vision)" />}
                    />
                </div>
                <div className="flex items-center gap-3 px-5 py-4 border-t border-pulse-border-subtle bg-pulse-panel-alt">
                    <button
                        onClick={handleSavePolicies}
                        disabled={saving}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                    >
                        {saving ? "Saving..." : "Save Policies"}
                    </button>
                    {message && (
                        <span className={`text-sm ${message.includes("saved") ? "text-green-400" : "text-red-400"}`}>{message}</span>
                    )}
                </div>
            </Card>

            {/* Pending Pairing Requests */}
            <Section
                title="Pending Pairing Requests"
                description="Users who DMed the bot and need approval. Enter their pairing code to approve."
                badge={pendingPairings.length > 0 ? `${pendingPairings.length} pending` : undefined}
            >
                {pendingPairings.length === 0 ? (
                    <p className="text-sm text-pulse-faint">No pending requests. When someone DMs the bot, they'll get a pairing code that shows up here.</p>
                ) : (
                    <div className="space-y-3">
                        {pendingPairings.map((p) => (
                            <div key={p.id} className="flex items-center justify-between bg-pulse-panel-alt rounded-lg p-3">
                                <div>
                                    <div className="text-sm font-medium text-pulse-text">{p.contactName || "Unknown User"}</div>
                                    <div className="text-xs text-pulse-muted">
                                        Telegram ID: <span className="font-mono">{p.contactId}</span> &middot; Code: <code className="bg-pulse-panel px-1.5 py-0.5 rounded text-pulse-text-soft font-mono">{p.code}</code>
                                    </div>
                                    <div className="text-xs text-pulse-faint mt-0.5">{new Date(p.createdAt).toLocaleString()}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleApprove(p.code)}
                                        disabled={processing === p.code}
                                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors motion-reduce:transition-none cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    >
                                        {processing === p.code ? "..." : "Approve"}
                                    </button>
                                    <button
                                        onClick={() => setConfirmAction({ type: "block", contactId: p.contactId })}
                                        disabled={processing === p.contactId}
                                        className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors motion-reduce:transition-none cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                    <p className="text-sm text-pulse-faint">No approved contacts yet.</p>
                ) : (
                    <div className="space-y-2">
                        {approvedUsers.map((u) => (
                            <div key={u.id} className="flex items-center justify-between bg-pulse-panel-alt rounded-lg p-3">
                                <div>
                                    <div className="text-sm font-medium text-pulse-text">{u.contactName || "Unknown"}</div>
                                    <div className="text-xs text-pulse-muted font-mono">{u.contactId}</div>
                                </div>
                                <button
                                    onClick={() => setConfirmAction({ type: "remove", contactId: u.contactId })}
                                    disabled={processing === u.contactId}
                                    className="text-xs font-medium text-red-400 px-3 py-1.5 border border-red-500/30 rounded-lg hover:bg-red-500/10 disabled:opacity-50 transition-colors motion-reduce:transition-none cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                    <p className="text-sm text-pulse-faint">No approved groups yet.</p>
                ) : (
                    <div className="space-y-2 mb-4">
                        {approvedGroups.map((g) => (
                            <div key={g.id} className="flex items-center justify-between bg-pulse-panel-alt rounded-lg p-3">
                                <div>
                                    <div className="text-sm font-medium text-pulse-text">{g.contactName || "Unnamed Group"}</div>
                                    <div className="text-xs text-pulse-muted font-mono">{g.contactId}</div>
                                </div>
                                <button
                                    onClick={() => setConfirmAction({ type: "remove", contactId: g.contactId })}
                                    disabled={processing === g.contactId}
                                    className="text-xs font-medium text-red-400 px-3 py-1.5 border border-red-500/30 rounded-lg hover:bg-red-500/10 disabled:opacity-50 transition-colors motion-reduce:transition-none cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="border-t border-pulse-border-subtle pt-4 mt-4">
                    <p className="text-xs font-semibold text-pulse-muted uppercase tracking-wider mb-3">Add Group</p>
                    <div className="flex flex-col sm:flex-row gap-2 max-w-lg">
                        <input
                            type="text"
                            placeholder="Group Chat ID (e.g. -1001234567890)"
                            value={groupChatId}
                            onChange={(e) => setGroupChatId(e.target.value)}
                            className="flex-1 border border-pulse-border rounded-lg px-3 py-2 text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <input
                            type="text"
                            placeholder="Group Name"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className="flex-1 border border-pulse-border rounded-lg px-3 py-2 text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <button
                            onClick={handleAddGroup}
                            disabled={addingGroup}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                        >
                            {addingGroup ? "Adding..." : "Add Group"}
                        </button>
                    </div>
                    {groupError && <p className="text-xs text-red-400 mt-2">{groupError}</p>}
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
                theme="pulse"
                onConfirm={handleConfirmAction}
                onCancel={() => setConfirmAction(null)}
            />
        </div>
    );
}

// ─── AI Providers Tab ────────────────────────────────────────────────────────

function ProvidersTab({ providerKeys }: { providerKeys: ProviderKeyInfo[] }) {
    const connected = PROVIDERS.filter((p) => providerKeys.some((k) => k.provider === p.id));
    const available = PROVIDERS.filter((p) => !providerKeys.some((k) => k.provider === p.id));
    const [adding, setAdding] = useState<string>("");

    const renderCard = (provider: typeof PROVIDERS[number]) => (
        <ProviderCard
            key={provider.id}
            providerId={provider.id}
            providerName={provider.name}
            authMethods={provider.authMethods}
            modelCount={provider.models.length}
            existingKey={providerKeys.find((k) => k.provider === provider.id)}
        />
    );

    return (
        <div className="space-y-6">
            <div className="bg-pulse-tint border border-pulse-border rounded-xl p-4">
                <p className="text-sm text-pulse-text-soft">
                    <span className="font-semibold">Bring Your Own Key (BYOK)</span> — connect the LLM providers you want your agents to use.
                    Keys are encrypted at rest (AES-256-GCM). Tip: Google Gemini has a free tier to get started.
                </p>
            </div>

            {/* Connected providers */}
            <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-pulse-faint mb-3">
                    Connected {connected.length > 0 && <span className="text-pulse-faint">· {connected.length}</span>}
                </h3>
                {connected.length === 0 ? (
                    <p className="text-sm text-pulse-faint bg-pulse-panel border border-dashed border-pulse-border-subtle rounded-xl p-6 text-center">
                        No providers connected yet. Add one below to power your agents.
                    </p>
                ) : (
                    <div className="space-y-4">{connected.map(renderCard)}</div>
                )}
            </div>

            {/* Add a provider */}
            {available.length > 0 && (
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-pulse-faint mb-3">Add a provider</h3>
                    <div className="flex items-center gap-2">
                        <select
                            value={adding}
                            onChange={(e) => setAdding(e.target.value)}
                            className="border border-pulse-border rounded-lg px-3 py-2 text-sm text-pulse-text focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-pulse-panel"
                        >
                            <option value="">Choose a provider…</option>
                            {available.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}{p.id === "google" ? " (free tier)" : ""}</option>
                            ))}
                        </select>
                    </div>
                    {adding && (
                        <div className="mt-4">
                            {renderCard(available.find((p) => p.id === adding)!)}
                        </div>
                    )}
                </div>
            )}
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

    // ── OpenAI OAuth sign-in (generate URL + paste callback) ──
    const handleOpenAISignIn = async () => {
        try {
            const verifier = generateCodeVerifier();
            const challenge = await generateCodeChallenge(verifier);
            const state = generateState(); // No prefix — settings is the default
            const redirectUri = getCallbackUrl();

            localStorage.setItem("openai_pkce_verifier", verifier);
            localStorage.setItem("openai_pkce_state", state);
            localStorage.setItem("openai_redirect_uri", redirectUri);

            const url = buildOpenAIAuthUrl({ codeChallenge: challenge, state, redirectUri });
            setAuthUrl(url);

            // Copy to clipboard
            try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
            } catch {
                // Clipboard may fail — URL is still displayed
            }
        } catch {
            setStatus({ type: "error", message: "Failed to generate sign-in URL." });
        }
    };

    const [manualUrl, setManualUrl] = useState("");
    const [authUrl, setAuthUrl] = useState("");
    const [copied, setCopied] = useState(false);

    const exchangeSettingsOAuthCode = (code: string, verifier: string, redirectUri: string) => {
        setAuthMethod("oauth");
        setStatus({ type: "saving", message: "Exchanging token..." });

        exchangeOpenAICodeAction({ code, codeVerifier: verifier, redirectUri }).then((result) => {
            localStorage.removeItem("openai_pkce_verifier");
            localStorage.removeItem("openai_pkce_state");
            localStorage.removeItem("openai_redirect_uri");

            setStatus({
                type: result.success ? "success" : "error",
                message: result.message ?? "",
            });

            if (result.success) {
                setShowForm(false);
                router.refresh();
            }
        });
    };

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

            const savedState = localStorage.getItem("openai_pkce_state");
            if (returnedState !== savedState) {
                setStatus({ type: "error", message: "Invalid response (state mismatch). Please try again." });
                return;
            }

            const savedVerifier = localStorage.getItem("openai_pkce_verifier");
            const savedRedirectUri = localStorage.getItem("openai_redirect_uri");

            if (!code || !savedVerifier || !savedRedirectUri) {
                setStatus({ type: "error", message: "Missing OAuth data. Please start the flow again." });
                return;
            }

            setManualUrl("");
            exchangeSettingsOAuthCode(code, savedVerifier, savedRedirectUri);
        } catch (err) {
            setStatus({ type: "error", message: "Invalid URL format." });
        }
    };

    // ── Handle same-tab fallback (if callback somehow resolves locally) ──
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

        const savedState = localStorage.getItem("openai_pkce_state");
        if (returnedState !== savedState) {
            setStatus({ type: "error", message: "Invalid response (state mismatch). Please try again." });
            return;
        }

        const savedVerifier = localStorage.getItem("openai_pkce_verifier");
        const savedRedirectUri = localStorage.getItem("openai_redirect_uri");

        if (!code || !savedVerifier || !savedRedirectUri) {
            setStatus({ type: "error", message: "Missing OAuth data. Please try again." });
            return;
        }

        exchangeSettingsOAuthCode(code, savedVerifier, savedRedirectUri);
    }, [searchParams, providerId]); // eslint-disable-line react-hooks/exhaustive-deps

    const displayAuthMethods = authMethods
        .map((m) => (m === "setup_token" ? "setup token" : m === "oauth" ? "OAuth" : m === "api_key" ? "API key" : m))
        .join(", ");

    return (
        <Card>
            <div className="px-5 py-4 border-b border-pulse-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isConfigured ? "bg-emerald-400" : "bg-pulse-border-strong"}`} />
                    <div>
                        <h3 className="text-sm font-semibold text-pulse-text">{providerName}</h3>
                        <p className="text-xs text-pulse-faint">
                            {modelCount} model{modelCount !== 1 ? "s" : ""} &middot; {displayAuthMethods}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isConfigured && (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
                            {existingKey?.authMethod === "setup_token" ? "Claude Account" : existingKey?.authMethod === "oauth" ? "ChatGPT Subscription" : "Configured"}
                        </span>
                    )}
                </div>
            </div>

            <div className="px-5 py-4">
                {isConfigured && !showForm && (
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-pulse-muted">
                                {existingKey?.authMethod === "setup_token" ? "Setup token configured" : existingKey?.authMethod === "oauth" ? "OAuth token configured" : "API key configured"}
                                {existingKey?.keyAlias && <span className="text-pulse-faint"> ({existingKey.keyAlias})</span>}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowForm(true)}
                                className="text-xs font-medium text-pulse-muted px-3 py-1.5 border border-pulse-border-subtle rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                Update
                            </button>
                            <button
                                onClick={handleRemove}
                                className="text-xs font-medium text-red-400 px-3 py-1.5 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1.5">Authentication Method</label>
                                <div className="flex rounded-lg border border-pulse-border overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => { setAuthMethod("api_key"); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${authMethod === "api_key"
                                            ? "bg-indigo-600 text-white"
                                            : "bg-pulse-panel text-pulse-muted hover:bg-pulse-hover"
                                            }`}
                                    >
                                        API Key
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setAuthMethod("setup_token"); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${authMethod === "setup_token"
                                            ? "bg-indigo-600 text-white"
                                            : "bg-pulse-panel text-pulse-muted hover:bg-pulse-hover"
                                            }`}
                                    >
                                        Claude Account
                                    </button>
                                </div>
                            </div>
                        )}

                        {supportsOAuth && (
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1.5">Authentication Method</label>
                                <div className="flex rounded-lg border border-pulse-border overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => { setAuthMethod("api_key"); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${authMethod === "api_key"
                                            ? "bg-indigo-600 text-white"
                                            : "bg-pulse-panel text-pulse-muted hover:bg-pulse-hover"
                                            }`}
                                    >
                                        API Key
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setAuthMethod("oauth"); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${authMethod === "oauth"
                                            ? "bg-indigo-600 text-white"
                                            : "bg-pulse-panel text-pulse-muted hover:bg-pulse-hover"
                                            }`}
                                    >
                                        ChatGPT Subscription
                                    </button>
                                </div>
                            </div>
                        )}

                        {isSetupToken && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                                <p className="text-xs text-amber-400">
                                    <span className="font-semibold">Use your Claude Pro/Max subscription.</span>{" "}
                                    Run <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">claude setup-token</code> in
                                    your terminal, then paste the token below.
                                </p>
                            </div>
                        )}

                        {/* OpenAI OAuth: generate URL + paste callback */}
                        {isOAuth && isOpenAIOAuth && (
                            <>
                                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                                    <p className="text-xs text-emerald-400">
                                        <span className="font-semibold">Use your ChatGPT Plus/Pro/Team subscription.</span>{" "}
                                        Click the button below to generate a sign-in link, then open it in your browser.
                                    </p>
                                </div>

                                {/* Step 1: Generate the auth URL */}
                                <button
                                    type="button"
                                    onClick={handleOpenAISignIn}
                                    disabled={status.type === "saving"}
                                    className="w-full px-4 py-2.5 bg-[#10a37f] hover:bg-[#0e8c6b] text-white text-sm font-semibold rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" /></svg>
                                    {status.type === "saving"
                                        ? (status.message || "Connecting...")
                                        : authUrl
                                        ? (copied ? "Copied! Generate New Link" : "Generate New Link")
                                        : "Generate Sign-in Link"}
                                </button>

                                {/* Step 2: Show the generated URL for user to copy */}
                                {authUrl && (
                                    <div className="bg-pulse-panel-alt border border-pulse-border-subtle rounded-lg p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-semibold text-pulse-text-soft">Sign-in Link {copied && <span className="text-green-400 font-normal">(copied to clipboard)</span>}</label>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try { await navigator.clipboard.writeText(authUrl); setCopied(true); setTimeout(() => setCopied(false), 3000); } catch {}
                                                }}
                                                className="text-xs text-indigo-500 hover:text-indigo-400 font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                            >
                                                Copy
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            readOnly
                                            value={authUrl}
                                            onClick={(e) => (e.target as HTMLInputElement).select()}
                                            className="w-full px-2 py-1.5 border border-pulse-border rounded text-[11px] font-mono bg-pulse-panel text-pulse-text-soft cursor-text"
                                        />
                                        <p className="text-[11px] text-pulse-muted leading-tight">
                                            Open this link in your browser. After signing in, the page will redirect to a <code className="bg-pulse-panel-alt px-1 rounded">localhost</code> URL that won&apos;t load — that&apos;s expected. Copy that full URL and paste it below.
                                        </p>
                                    </div>
                                )}

                                {/* Step 3: Paste the callback URL */}
                                {authUrl && (
                                    <div>
                                        <label className="block text-xs font-semibold text-pulse-text-soft mb-1">
                                            Paste Callback URL
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={manualUrl}
                                                onChange={(e) => setManualUrl(e.target.value)}
                                                placeholder="http://localhost:1455/auth/callback?code=..."
                                                className="flex-1 px-3 py-1.5 border border-pulse-border rounded text-xs font-mono bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-1 focus:ring-emerald-500 outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleManualPaste}
                                                disabled={!manualUrl.trim() || status.type === "saving"}
                                                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors motion-reduce:transition-none cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                            >
                                                Connect
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Non-OpenAI OAuth or setup_token: manual paste field */}
                        {isOAuth && !isOpenAIOAuth && (
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                                <p className="text-xs text-blue-400">
                                    <span className="font-semibold">OAuth token.</span>{" "}
                                    Paste your OAuth token below.
                                </p>
                            </div>
                        )}

                        {/* Show manual key/token input for: API key, setup_token, or non-OpenAI OAuth */}
                        {(!isOAuth || !isOpenAIOAuth) && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-pulse-text-soft mb-1.5">
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
                                        className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-pulse-panel text-pulse-text placeholder:font-sans placeholder:text-pulse-faint"
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSave}
                                        disabled={!apiKey.trim() || status.type === "saving"}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                                    >
                                        {isTokenAuth ? "Save Token" : "Save Key"}
                                    </button>
                                    <button
                                        onClick={handleValidate}
                                        disabled={!apiKey.trim() || status.type === "validating"}
                                        className="px-4 py-2 text-sm font-medium text-pulse-muted border border-pulse-border rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    >
                                        {isTokenAuth ? "Test Token" : "Test Key"}
                                    </button>
                                    {showForm && (
                                        <button
                                            onClick={() => { setShowForm(false); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                            className="px-4 py-2 text-sm font-medium text-pulse-muted hover:text-pulse-text-soft transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Status messages (shown for all auth methods) */}
                        {status.type !== "idle" && !isOpenAIOAuth && (
                            <p className={`text-sm ${status.type === "success" ? "text-green-400" : status.type === "error" ? "text-red-400" : "text-pulse-muted"}`}>
                                {status.type === "saving" ? "Saving..." : status.type === "validating" ? "Validating..." : status.message}
                            </p>
                        )}

                        {/* OpenAI OAuth status (separate since button already shows saving state) */}
                        {isOpenAIOAuth && status.type === "error" && (
                            <p className="text-sm text-red-400">{status.message}</p>
                        )}
                        {isOpenAIOAuth && status.type === "success" && (
                            <p className="text-sm text-green-400">{status.message}</p>
                        )}

                        {/* Cancel button for OpenAI OAuth when updating */}
                        {isOpenAIOAuth && showForm && status.type !== "saving" && (
                            <button
                                onClick={() => { setShowForm(false); setApiKey(""); setStatus({ type: "idle", message: "" }); }}
                                className="px-4 py-2 text-sm font-medium text-pulse-muted hover:text-pulse-text-soft transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
}

// ─── Memory Tab ──────────────────────────────────────────────────────────────

type EmbeddingProviderId = "openai" | "minimax" | "voyage";
type VoyageModel = "voyage-3-large" | "voyage-3-lite";

function MemoryTab({
    embeddingConfigured,
    autoMemoryConfig,
}: {
    embeddingConfigured: boolean;
    autoMemoryConfig: { enabled: boolean; maxMemories: number };
}) {
    const router = useRouter();

    // Server-loaded config (fetched on mount — this is the source of truth for
    // "what's actually active", separate from `provider` below which is just
    // which panel the user has selected to look at / edit.
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [activeProvider, setActiveProvider] = useState<EmbeddingProviderId>("openai");
    const [openaiConfigured, setOpenaiConfigured] = useState(embeddingConfigured);
    const [minimaxKeyPresent, setMinimaxKeyPresent] = useState(false);
    const [voyageKeyPresent, setVoyageKeyPresent] = useState(false);
    const [voyageModel, setVoyageModel] = useState<VoyageModel>("voyage-3-large");

    // Which panel is selected in the segmented control.
    const [provider, setProvider] = useState<EmbeddingProviderId>("openai");

    const [apiKey, setApiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [groupId, setGroupId] = useState("");
    const [voyageKey, setVoyageKey] = useState("");
    const [showVoyageKey, setShowVoyageKey] = useState(false);

    const [result, setResult] = useState<{ type: "idle" | "success" | "error" | "warning"; message: string }>({ type: "idle", message: "" });
    const [autoMemoryEnabled, setAutoMemoryEnabled] = useState(autoMemoryConfig.enabled);
    const [autoMemoryMax, setAutoMemoryMax] = useState(autoMemoryConfig.maxMemories.toString());
    const [autoMemoryStatus, setAutoMemoryStatus] = useState<{ type: "idle" | "success" | "error"; message: string }>({ type: "idle", message: "" });
    const [testing, startTesting] = useTransition();
    const [saving, startSaving] = useTransition();
    const [removing, startRemoving] = useTransition();
    const [switching, startSwitching] = useTransition();
    const [savingAutoMemory, startSavingAutoMemory] = useTransition();
    const busy = testing || saving || removing || switching;

    const refreshConfig = async () => {
        const cfg = await getEmbeddingConfigAction();
        setActiveProvider(cfg.provider);
        setOpenaiConfigured(cfg.openaiConfigured);
        setMinimaxKeyPresent(cfg.minimaxKeyPresent);
        setGroupId(cfg.minimaxGroupId || "");
        setVoyageKeyPresent(cfg.voyageKeyPresent);
        setVoyageModel((cfg.voyageModel as VoyageModel) || "voyage-3-large");
        return cfg;
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const cfg = await refreshConfig();
            if (cancelled) return;
            setProvider(cfg.provider);
            setLoadingConfig(false);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleTestOpenAI = () => {
        if (!apiKey.trim()) return;
        startTesting(async () => {
            const res = await testEmbeddingKeyAction(apiKey);
            setResult({ type: res.success ? "success" : "error", message: res.message });
        });
    };

    const handleSaveOpenAI = () => {
        if (!apiKey.trim()) return;
        startSaving(async () => {
            const res = await saveEmbeddingKeyAction(apiKey);
            if (!res.success) {
                setResult({ type: "error", message: res.message });
                return;
            }
            const providerRes = await saveEmbeddingProviderAction("openai");
            setResult({ type: providerRes.success ? "success" : "error", message: providerRes.success ? res.message : providerRes.message });
            setApiKey("");
            await refreshConfig();
            router.refresh();
        });
    };

    const handleUseOpenAI = () => {
        startSwitching(async () => {
            const res = await saveEmbeddingProviderAction("openai");
            setResult({ type: res.success ? "success" : "error", message: res.message });
            if (res.success) {
                await refreshConfig();
                router.refresh();
            }
        });
    };

    const handleRemove = () => {
        if (!window.confirm("Remove the embedding key? Memory will revert to keyword mode.")) return;
        startRemoving(async () => {
            const res = await removeEmbeddingKeyAction();
            setResult({ type: res.success ? "success" : "error", message: res.message });
            if (res.success) {
                await refreshConfig();
                router.refresh();
            }
        });
    };

    const handleTestMinimax = () => {
        if (!groupId.trim()) return;
        startTesting(async () => {
            const res = await testMinimaxEmbeddingAction(groupId);
            if (res.success) setResult({ type: "success", message: res.message });
            else setResult({ type: res.message.includes("1002") ? "warning" : "error", message: res.message });
        });
    };

    const handleSaveMinimax = () => {
        if (!groupId.trim() || !minimaxKeyPresent) return;
        startSaving(async () => {
            const res = await saveEmbeddingProviderAction("minimax", groupId);
            setResult({ type: res.success ? "success" : "error", message: res.message });
            if (res.success) {
                await refreshConfig();
                router.refresh();
            }
        });
    };

    const handleTestVoyage = () => {
        startTesting(async () => {
            const res = await testVoyageEmbeddingAction(voyageKey, voyageModel);
            setResult({ type: res.success ? "success" : "error", message: res.message });
        });
    };

    const handleSaveVoyageKey = () => {
        if (!voyageKey.trim()) return;
        startSaving(async () => {
            const res = await saveVoyageKeyAction(voyageKey);
            setResult({ type: res.success ? "success" : "error", message: res.message });
            if (res.success) {
                setVoyageKey("");
                await refreshConfig();
                router.refresh();
            }
        });
    };

    const handleUseVoyage = () => {
        if (!voyageKeyPresent) return;
        startSwitching(async () => {
            const res = await saveEmbeddingProviderAction("voyage", { model: voyageModel });
            setResult({ type: res.success ? "success" : "error", message: res.message });
            if (res.success) {
                await refreshConfig();
                router.refresh();
            }
        });
    };

    const messageColor = result.type === "success" ? "text-green-400" : result.type === "warning" ? "text-amber-400" : result.type === "error" ? "text-red-400" : "";

    const handleSaveAutoMemory = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        startSavingAutoMemory(async () => {
            const res = await saveAutoMemorySettingsAction({
                enabled: autoMemoryEnabled,
                maxMemories: Number(autoMemoryMax),
            });
            setAutoMemoryStatus({ type: res.success ? "success" : "error", message: res.message });
            if (res.success) router.refresh();
        });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader title="Automatic Memory" description="Extract durable facts after each completed turn and save them without relying on the chat model to call a tool." />
                <div className="px-5 py-5">
                    <form onSubmit={handleSaveAutoMemory} className="space-y-5 max-w-xl">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={autoMemoryEnabled}
                                onChange={(e) => setAutoMemoryEnabled(e.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-pulse-border text-indigo-600 focus:ring-indigo-600 focus:ring-offset-2 focus:ring-offset-pulse-panel"
                            />
                            <span>
                                <span className="block text-sm font-semibold text-pulse-text">Remember automatically after each reply</span>
                                <span className="block text-xs text-pulse-muted mt-1">
                                    A deterministic backend pass extracts preferences, decisions, tasks, relationships, and stable facts. Transient chat is ignored.
                                </span>
                            </span>
                        </label>

                        <div className="max-w-xs">
                            <label htmlFor="auto-memory-max" className="block text-sm font-medium text-pulse-text-soft mb-1.5">Maximum memories per turn</label>
                            <input
                                id="auto-memory-max"
                                type="number"
                                min="0"
                                max="5"
                                value={autoMemoryMax}
                                onChange={(e) => setAutoMemoryMax(e.target.value)}
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-pulse-panel text-pulse-text"
                            />
                            <p className="text-xs text-pulse-faint mt-1">Set to 0 to keep extraction disabled even if the toggle is on.</p>
                        </div>

                        {autoMemoryStatus.type !== "idle" && (
                            <p className={`text-sm ${autoMemoryStatus.type === "success" ? "text-green-400" : "text-red-400"}`}>{autoMemoryStatus.message}</p>
                        )}

                        <button
                            type="submit"
                            disabled={savingAutoMemory}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                        >
                            {savingAutoMemory ? "Saving..." : "Save Automatic Memory"}
                        </button>
                    </form>
                </div>
            </Card>

            <Card>
                <CardHeader title="Memory & Embeddings" description="Give your agents long-term recall across conversations." />
                <div className="px-5 py-5 space-y-5">
                    <p className="text-sm text-pulse-text-soft leading-relaxed">
                        Your agents can remember important facts across conversations and recall them later. Connect an embedding provider to enable{" "}
                        <span className="font-semibold text-pulse-text">semantic</span> recall (matches by meaning). Without one, memory still works in{" "}
                        <span className="font-semibold text-pulse-text">keyword</span> mode.
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div
                            role="radiogroup"
                            aria-label="Embedding provider"
                            className="inline-flex items-center gap-1 rounded-lg border border-pulse-border bg-pulse-panel-alt p-1"
                        >
                            {(["openai", "minimax", "voyage"] as const).map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    role="radio"
                                    aria-checked={provider === p}
                                    onClick={() => setProvider(p)}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${provider === p
                                        ? "bg-indigo-600 text-white"
                                        : "text-pulse-text-soft hover:text-pulse-text hover:bg-pulse-hover"
                                        }`}
                                >
                                    {p === "openai" ? "OpenAI" : p === "minimax" ? "MiniMax" : "Voyage"}
                                </button>
                            ))}
                        </div>

                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pulse-muted">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true" />
                            {loadingConfig ? "Loading…" : `Active: ${activeProvider === "minimax" ? "MiniMax" : activeProvider === "voyage" ? "Voyage" : "OpenAI"}`}
                        </span>
                    </div>

                    {provider === "openai" ? (
                        <div className="space-y-5">
                            {openaiConfigured ? (
                                activeProvider === "openai" ? (
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
                                        <span className="text-sm font-medium text-green-400">Semantic memory active — OpenAI</span>
                                        <button
                                            type="button"
                                            onClick={handleRemove}
                                            disabled={busy}
                                            className="text-sm font-medium text-red-400 hover:text-red-300 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                        >
                                            {removing ? "Removing…" : "Remove"}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pulse-border bg-pulse-panel-alt px-4 py-3">
                                        <span className="text-sm font-medium text-pulse-text-soft">OpenAI key saved, but MiniMax is currently active</span>
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={handleUseOpenAI}
                                                disabled={busy}
                                                className="text-sm font-medium text-indigo-500 hover:text-indigo-400 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                            >
                                                {switching ? "Switching…" : "Use OpenAI"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleRemove}
                                                disabled={busy}
                                                className="text-sm font-medium text-red-400 hover:text-red-300 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                            >
                                                {removing ? "Removing…" : "Remove"}
                                            </button>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                                    <span className="text-sm font-medium text-amber-400">Keyword mode — add a key for semantic recall</span>
                                </div>
                            )}

                            <div>
                                <label htmlFor="embedding-key" className="block text-sm font-medium text-pulse-text-soft mb-1.5">OpenAI API key</label>
                                <div className="relative max-w-md">
                                    <input
                                        id="embedding-key"
                                        type={showKey ? "text" : "password"}
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder="sk-..."
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="w-full px-3 py-2 pr-10 border border-pulse-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-pulse-panel text-pulse-text placeholder:text-pulse-faint placeholder:font-sans"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowKey((v) => !v)}
                                        aria-label={showKey ? "Hide API key" : "Show API key"}
                                        className="absolute inset-y-0 right-0 flex items-center px-3 text-pulse-faint hover:text-pulse-text-soft cursor-pointer outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                    >
                                        {showKey ? <EyeSlashIcon className="w-4 h-4" aria-hidden="true" /> : <EyeIcon className="w-4 h-4" aria-hidden="true" />}
                                    </button>
                                </div>
                                <p className="text-xs text-pulse-muted mt-1.5">
                                    Model: <code className="font-mono text-xs bg-pulse-panel-alt px-1.5 py-0.5 rounded">text-embedding-3-small</code> — costs about $0.02 per million tokens (effectively free at this scale). Get a key at{" "}
                                    <a
                                        href="https://platform.openai.com/api-keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline hover:text-pulse-text-soft cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                    >
                                        platform.openai.com
                                    </a>
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleTestOpenAI}
                                    disabled={!apiKey.trim() || busy}
                                    className="px-4 py-2 border border-pulse-border text-pulse-text-soft text-sm font-medium rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                                >
                                    {testing ? "Testing…" : "Test key"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveOpenAI}
                                    disabled={!apiKey.trim() || busy}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                                >
                                    {saving ? "Saving…" : "Save"}
                                </button>
                            </div>
                        </div>
                    ) : provider === "minimax" ? (
                        <div className="space-y-5">
                            <p className="text-sm text-pulse-text-soft leading-relaxed">
                                Uses your connected MiniMax API key. Model: <code className="font-mono text-xs bg-pulse-panel-alt px-1.5 py-0.5 rounded">embo-01</code> (1536-dim). Requires your MiniMax GroupId.
                            </p>

                            {!minimaxKeyPresent && (
                                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                                    <span className="text-sm font-medium text-amber-400">
                                        Connect a MiniMax API key in{" "}
                                        <Link href="/dashboard/settings?tab=providers" className="underline hover:text-amber-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                                            AI Providers
                                        </Link>{" "}
                                        first.
                                    </span>
                                </div>
                            )}

                            {minimaxKeyPresent && activeProvider === "minimax" && (
                                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
                                    <span className="text-sm font-medium text-green-400">Semantic memory active — MiniMax</span>
                                </div>
                            )}

                            <div>
                                <label htmlFor="minimax-group-id" className="block text-sm font-medium text-pulse-text-soft mb-1.5">MiniMax GroupId</label>
                                <input
                                    id="minimax-group-id"
                                    type="text"
                                    value={groupId}
                                    onChange={(e) => setGroupId(e.target.value)}
                                    placeholder="e.g. 1234567890…"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="w-full max-w-md px-3 py-2 border border-pulse-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-pulse-panel text-pulse-text placeholder:text-pulse-faint placeholder:font-sans"
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleTestMinimax}
                                    disabled={!groupId.trim() || !minimaxKeyPresent || busy}
                                    className="px-4 py-2 border border-pulse-border text-pulse-text-soft text-sm font-medium rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                                >
                                    {testing ? "Testing…" : "Test"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveMinimax}
                                    disabled={!groupId.trim() || !minimaxKeyPresent || busy}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                                >
                                    {saving ? "Saving…" : "Save"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <p className="text-sm text-pulse-text-soft leading-relaxed">
                                Voyage AI — the embedding provider Anthropic recommends. Standalone (its own API key). 1024-dim.
                            </p>

                            {!voyageKeyPresent && (
                                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                                    <span className="text-sm font-medium text-amber-400">Keyword mode — add a Voyage key for semantic recall</span>
                                </div>
                            )}

                            {voyageKeyPresent && activeProvider === "voyage" && (
                                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
                                    <span className="text-sm font-medium text-green-400">Semantic memory active — Voyage</span>
                                </div>
                            )}

                            {voyageKeyPresent && activeProvider !== "voyage" && (
                                <div className="rounded-lg border border-pulse-border bg-pulse-panel-alt px-4 py-3">
                                    <span className="text-sm font-medium text-pulse-text-soft">Voyage key saved</span>
                                </div>
                            )}

                            <div>
                                <span className="block text-sm font-medium text-pulse-text-soft mb-1.5">Model</span>
                                <div
                                    role="radiogroup"
                                    aria-label="Voyage model"
                                    className="inline-flex items-center gap-1 rounded-lg border border-pulse-border bg-pulse-panel-alt p-1"
                                >
                                    {([
                                        { id: "voyage-3-large" as const, label: "voyage-3-large — best quality" },
                                        { id: "voyage-3-lite" as const, label: "voyage-3-lite — cheaper/faster" },
                                    ]).map((m) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={voyageModel === m.id}
                                            onClick={() => setVoyageModel(m.id)}
                                            className={`px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${voyageModel === m.id
                                                ? "bg-indigo-600 text-white"
                                                : "text-pulse-text-soft hover:text-pulse-text hover:bg-pulse-hover"
                                                }`}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label htmlFor="voyage-key" className="block text-sm font-medium text-pulse-text-soft mb-1.5">Voyage API key</label>
                                <div className="relative max-w-md">
                                    <input
                                        id="voyage-key"
                                        type={showVoyageKey ? "text" : "password"}
                                        value={voyageKey}
                                        onChange={(e) => setVoyageKey(e.target.value)}
                                        placeholder="pa-..."
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="w-full px-3 py-2 pr-10 border border-pulse-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-pulse-panel text-pulse-text placeholder:text-pulse-faint placeholder:font-sans"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowVoyageKey((v) => !v)}
                                        aria-label={showVoyageKey ? "Hide API key" : "Show API key"}
                                        className="absolute inset-y-0 right-0 flex items-center px-3 text-pulse-faint hover:text-pulse-text-soft cursor-pointer outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                    >
                                        {showVoyageKey ? <EyeSlashIcon className="w-4 h-4" aria-hidden="true" /> : <EyeIcon className="w-4 h-4" aria-hidden="true" />}
                                    </button>
                                </div>
                                <p className="text-xs text-pulse-muted mt-1.5">
                                    Get a key at{" "}
                                    <a
                                        href="https://dashboard.voyageai.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline hover:text-pulse-text-soft cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                                    >
                                        dashboard.voyageai.com
                                    </a>
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleTestVoyage}
                                    disabled={(!voyageKey.trim() && !voyageKeyPresent) || busy}
                                    className="px-4 py-2 border border-pulse-border text-pulse-text-soft text-sm font-medium rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                                >
                                    {testing ? "Testing…" : "Test"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveVoyageKey}
                                    disabled={!voyageKey.trim() || busy}
                                    className="px-4 py-2 border border-pulse-border text-pulse-text-soft text-sm font-medium rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                                >
                                    {saving ? "Saving…" : "Save key"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleUseVoyage}
                                    disabled={!voyageKeyPresent || busy}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                                >
                                    {switching ? "Switching…" : "Use Voyage"}
                                </button>
                            </div>

                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                                <span className="text-sm font-medium text-amber-400">
                                    Voyage uses a different vector size (1024) than OpenAI/MiniMax (1536). Switching will clear existing stored memories.
                                </span>
                            </div>
                        </div>
                    )}

                    {result.type !== "idle" && (
                        <p role="status" className={`text-sm ${messageColor}`}>{result.message}</p>
                    )}
                </div>
            </Card>
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
    const [apiError, setApiError] = useState<string | null>(null);

    const router = useRouter();

    const copy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleToggleCli = async () => {
        setToggling(true);
        setApiError(null);
        const newValue = !cliEnabled;
        const result = await toggleCliAccessAction(newValue);
        if (result.success) {
            setCliEnabled(newValue);
            router.refresh();
        } else {
            setApiError(result.message ?? "Failed to update CLI access.");
        }
        setToggling(false);
    };

    const handleConnect = async () => {
        setConnecting(true);
        setApiError(null);
        // Ensure dashboard client exists, then navigate to the consent page
        const result = await ensureDashboardClientAction();
        if (result.error || !result.clientId) {
            setApiError(result.error ?? "Failed to initialize. Please try again.");
            setConnecting(false);
            return;
        }
        // Navigate to the consent page with mode=connect for dashboard-initiated flow
        window.location.href = `/oauth/authorize?client_id=${result.clientId}&mode=connect`;
    };

    const handleGenerateApiToken = async () => {
        setGeneratingToken(true);
        setNewToken(null);
        setApiError(null);
        const { generateApiTokenAction } = await import("./actions");

        const fd = new FormData();
        fd.set("name", "Dashboard Token");
        const result = await generateApiTokenAction(fd);
        if (result.success && result.token) {
            setNewToken(result.token);
            router.refresh();
        } else {
            setApiError(result.message ?? "Failed to generate token.");
        }
        setGeneratingToken(false);
    };

    const handleRevokeToken = async () => {
        if (!revokeTokenId) return;
        setRevoking(revokeTokenId);
        setApiError(null);
        const { revokeApiTokenAction } = await import("./actions");
        const result = await revokeApiTokenAction(revokeTokenId);
        setRevokeTokenId(null);
        if (result.success) {
            router.refresh();
        } else {
            setApiError(result.message ?? "Failed to revoke token.");
        }
        setRevoking(null);
    };

    return (
        <div className="space-y-6">
            {apiError && (
                <div role="alert" className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm border border-red-500/30 mb-4">
                    {apiError}
                    <button onClick={() => setApiError(null)} aria-label="Dismiss error" className="ml-2 text-red-400 hover:text-red-300 font-bold cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">&times;</button>
                </div>
            )}
            {/* CLI Access Toggle */}
            <Card>
                <CardHeader
                    title="Third-Party CLI Access"
                    description="Allow developer tools like Claude Code, Cursor CLI, and Codex to authenticate with this workspace."
                    action={cliEnabled ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Enabled</span> : undefined}
                />
                <SettingRow
                    title="Enable CLI tool authentication"
                    description={
                        toggling
                            ? "Saving..."
                            : cliEnabled
                                ? "OAuth is active — CLI tools can discover and authenticate with this workspace."
                                : "Off — CLI tools cannot authenticate with this workspace."
                    }
                    control={<Toggle checked={cliEnabled} onChange={() => handleToggleCli()} disabled={toggling} label="Enable CLI tool authentication" />}
                />
            </Card>

            {/* Connect & Generate Token */}
            <Section
                title="Connect & Generate Token"
                description="Click the button below to authorize and generate an API token. You'll see a consent page to approve the connection."
            >
                <div className="space-y-4 max-w-lg">
                    {!cliEnabled ? (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                            <p className="text-xs text-amber-400">Enable CLI access above first before connecting.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <button
                                onClick={handleConnect}
                                disabled={connecting}
                                className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                {connecting ? "Preparing..." : "Connect & Authorize"}
                            </button>
                            <p className="text-xs text-pulse-muted">
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
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                        <p className="text-sm text-pulse-text-soft">Point the CLI tool at your API server URL below.</p>
                    </div>
                    <div className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                        <p className="text-sm text-pulse-text-soft">The CLI auto-discovers OAuth endpoints and opens your browser.</p>
                    </div>
                    <div className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                        <p className="text-sm text-pulse-text-soft">You see the same consent page — click <strong>Approve</strong> and the CLI receives a token automatically.</p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-pulse-border-subtle">
                        <p className="text-xs font-medium text-pulse-muted mb-2">API Server URL</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs bg-pulse-panel-alt border border-pulse-border-subtle rounded-lg px-3 py-2 font-mono text-pulse-text-soft truncate">{apiBaseUrl}</code>
                            <button
                                onClick={() => copy(apiBaseUrl, "api-url")}
                                className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-pulse-border-subtle rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none text-pulse-muted cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                        >
                            {generatingToken ? "Generating..." : "Generate New API Token"}
                        </button>
                    </div>

                    {newToken && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-2 relative">
                            <button
                                onClick={() => setNewToken(null)}
                                aria-label="Dismiss"
                                className="absolute top-2 right-2 text-pulse-faint hover:text-pulse-text-soft cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                            <p className="text-sm font-medium text-emerald-300">Your new API token</p>
                            <p className="text-xs text-emerald-400">Please copy this token now. You won&apos;t be able to see it again!</p>
                            <div className="flex items-center gap-2 mt-2">
                                <code className="flex-1 text-sm bg-pulse-panel border border-emerald-500/30 rounded-lg px-3 py-2 font-mono text-emerald-300">{newToken}</code>
                                <button
                                    onClick={() => copy(newToken, "new-token")}
                                    className="px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                >
                                    {copiedId === "new-token" ? "Copied!" : "Copy"}
                                </button>
                            </div>
                        </div>
                    )}

                    {apiTokens.length > 0 && (
                        <div className="space-y-3 mt-6">
                            {apiTokens.map(token => (
                                <div key={token.id} className="border border-pulse-border-subtle rounded-xl p-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-pulse-text">{token.name}</p>
                                        <div className="text-xs text-pulse-muted mt-1 space-y-0.5">
                                            <p>Created: {new Date(token.createdAt).toLocaleDateString()}</p>
                                            <p>Last used: {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleDateString() : "Never"}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setRevokeTokenId(token.id)}
                                        disabled={revoking === token.id}
                                        className="text-xs font-medium text-red-400 px-3 py-1.5 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                            <div key={client.clientId} className="border border-pulse-border-subtle rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-pulse-muted uppercase tracking-wider">{client.name}</span>
                                    <span className="text-xs text-pulse-faint">{new Date(client.createdAt).toLocaleDateString()}</span>
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
                theme="pulse"
                onConfirm={handleRevokeToken}
                onCancel={() => setRevokeTokenId(null)}
            />
        </div>
    );
}

// ─── Billing Tab ─────────────────────────────────────────────────────────────

function BillingTab({ credits }: { credits: number }) {
    const status = credits > 500 ? { label: "Healthy", cls: "bg-emerald-500/10 text-emerald-400" }
        : credits > 0 ? { label: "Low", cls: "bg-yellow-500/10 text-yellow-400" }
            : { label: "Empty", cls: "bg-red-500/10 text-red-400" };

    return (
        <div className="space-y-6">
            <Section title="Credit Balance" description="AI usage is charged in credits. 1 credit = ~1,500 input tokens.">
                <div className="flex items-center gap-4">
                    <div>
                        <p className="text-3xl font-bold text-pulse-text">{credits.toLocaleString()}</p>
                        <p className="text-sm text-pulse-muted mt-0.5">~{(credits * 1500).toLocaleString()} input tokens remaining</p>
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
                            className="flex flex-col p-4 rounded-xl border border-pulse-border-subtle text-left hover:border-indigo-500/40 hover:bg-indigo-500/10 transition-all motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <span className="text-xs font-semibold text-pulse-muted uppercase tracking-wider">{plan.label}</span>
                            <span className="text-xl font-bold text-pulse-text mt-1">{plan.price}</span>
                            <span className="text-xs text-pulse-faint mt-0.5">{plan.credits.toLocaleString()} credits</span>
                        </button>
                    ))}
                </div>
                <p className="text-xs text-pulse-faint mt-3">Contact your administrator to top up your balance.</p>
            </Section>
        </div>
    );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Section({ title, description, badge, children }: { title: string; description: string; badge?: string; children: React.ReactNode }) {
    const badgeNode = badge ? (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge === "Connected" ? "bg-emerald-500/10 text-emerald-400" : badge.includes("pending") ? "bg-red-500/10 text-red-400" : "bg-pulse-panel-alt text-pulse-muted"}`}>
            {badge}
        </span>
    ) : undefined;
    return (
        <Card>
            <CardHeader title={title} description={description} action={badgeNode} />
            <div className="px-5 py-5">{children}</div>
        </Card>
    );
}

function FormInput({ label, name, type, placeholder, mono }: { label: string; name: string; type: string; placeholder: string; mono?: boolean }) {
    return (
        <div>
            <label className="block text-sm font-medium text-pulse-text-soft mb-1.5">{label}</label>
            <input
                type={type}
                name={name}
                placeholder={placeholder}
                className={`w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-pulse-panel text-pulse-text placeholder:text-pulse-faint ${mono ? "font-mono placeholder:font-sans" : ""}`}
            />
        </div>
    );
}

// ─── Plugins Tab ─────────────────────────────────────────────────────────────

function PluginsTab({ plugins, savePluginCredentials }: { plugins: PluginData[]; savePluginCredentials: (formData: FormData) => Promise<void> }) {
    const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());
    const [saving, startTransition] = useTransition();

    const toggleExpand = (pluginId: string) => {
        setExpandedPlugins((prev) => {
            const next = new Set(prev);
            if (next.has(pluginId)) next.delete(pluginId);
            else next.add(pluginId);
            return next;
        });
    };

    return (
        <div>
            <h2 className="text-lg font-semibold text-pulse-text mb-1">Plugins</h2>
            <p className="text-sm text-pulse-muted mb-6">Configure credentials for each plugin to activate integrations.</p>

            {plugins.length === 0 ? (
                <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl p-12 text-center">
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-pulse-faint mx-auto mb-4" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
                    </svg>
                    <p className="text-pulse-muted text-sm">No plugins enabled. Contact your administrator to enable plugins.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {plugins.map((plugin) => {
                        const { config } = plugin;
                        const hasCredentials = config.credentialSchema.length > 0;
                        const isExpanded = expandedPlugins.has(plugin.id);
                        const allConfigured = config.credentialSchema.every((f) => f.configured);
                        const noneConfigured = config.credentialSchema.every((f) => !f.configured);

                        return (
                            <Card key={plugin.id}>
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1.5">
                                                <h3 className="text-base font-semibold text-pulse-text capitalize">{plugin.name}</h3>
                                                <span className="text-xs text-pulse-faint">v{plugin.version || "?"}</span>
                                            </div>
                                            <p className="text-sm text-pulse-muted mb-3">{config.description}</p>

                                            <div className="flex flex-wrap items-center gap-2">
                                                {config.toolCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/10 text-blue-400 rounded-full">
                                                        {config.toolCount} tool{config.toolCount !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {config.routeCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-emerald-500/10 text-emerald-400 rounded-full">
                                                        {config.routeCount} route{config.routeCount !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {hasCredentials && (
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full font-medium ${
                                                        allConfigured
                                                            ? "bg-green-500/10 text-green-400"
                                                            : noneConfigured
                                                            ? "bg-red-500/10 text-red-400"
                                                            : "bg-amber-500/10 text-amber-400"
                                                    }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                                            allConfigured ? "bg-green-500" : noneConfigured ? "bg-red-400" : "bg-amber-500"
                                                        }`} />
                                                        {allConfigured ? "Configured" : noneConfigured ? "Not configured" : "Partially configured"}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {hasCredentials && (
                                            <button
                                                onClick={() => toggleExpand(plugin.id)}
                                                className="ml-4 px-3 py-1.5 text-sm font-medium text-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                            >
                                                {isExpanded ? "Close" : "Configure"}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {isExpanded && hasCredentials && (
                                    <div className="border-t border-pulse-border-subtle bg-pulse-panel-alt px-5 py-4">
                                        <h4 className="text-sm font-medium text-pulse-text-soft mb-3">Credentials</h4>
                                        <form action={(formData) => startTransition(() => savePluginCredentials(formData))} className="space-y-4">
                                            <input type="hidden" name="pluginName" value={plugin.name} />
                                            <input type="hidden" name="credentialSchema" value={JSON.stringify(config.credentialSchema)} />

                                            <div className="space-y-3">
                                                {config.credentialSchema.map((field) => (
                                                    <div key={field.name} className="bg-pulse-panel rounded-lg border border-pulse-border-subtle p-4">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <label className="text-sm font-medium text-pulse-text-soft">{field.label}</label>
                                                            {field.required && <span className="text-red-400 text-xs">required</span>}
                                                            <span className={`ml-auto inline-flex items-center gap-1 text-xs ${
                                                                field.configured ? "text-green-400" : "text-pulse-faint"
                                                            }`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                                    field.configured ? "bg-green-500" : "bg-pulse-border-strong"
                                                                }`} />
                                                                {field.configured ? "Saved" : "Not set"}
                                                            </span>
                                                        </div>
                                                        {field.helpText && (
                                                            <p className="text-xs text-pulse-faint mb-2">{field.helpText}</p>
                                                        )}
                                                        <input
                                                            type={field.type === "secret" ? "password" : field.type === "url" ? "url" : "text"}
                                                            name={`cred_${field.name}`}
                                                            placeholder={field.configured ? "Leave empty to keep current value" : field.placeholder || ""}
                                                            className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                                        />
                                                        <p className="text-xs text-pulse-faint mt-1 font-mono">{field.name}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex items-center justify-between pt-2">
                                                <p className="text-xs text-pulse-faint">Encrypted with AES-256-GCM. Empty fields are skipped.</p>
                                                <button
                                                    type="submit"
                                                    disabled={saving}
                                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel-alt"
                                                >
                                                    {saving ? "Saving..." : "Save Credentials"}
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ─── Email Tab ──────────────────────────────────────────────────── */
function EmailTab({ config }: { config: { smtp?: any; imap?: any } | null }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const [smtpHost, setSmtpHost] = useState(config?.smtp?.host ?? "");
    const [smtpPort, setSmtpPort] = useState(config?.smtp?.port?.toString() ?? "587");
    const [smtpUsername, setSmtpUsername] = useState(config?.smtp?.username ?? "");
    const [smtpPassword, setSmtpPassword] = useState("");
    const [smtpTls, setSmtpTls] = useState(config?.smtp?.tls ?? true);
    const [smtpFrom, setSmtpFrom] = useState(config?.smtp?.fromAddress ?? "");

    const [imapHost, setImapHost] = useState(config?.imap?.host ?? "");
    const [imapPort, setImapPort] = useState(config?.imap?.port?.toString() ?? "993");
    const [imapUsername, setImapUsername] = useState(config?.imap?.username ?? "");
    const [imapPassword, setImapPassword] = useState("");
    const [imapTls, setImapTls] = useState(config?.imap?.tls ?? true);

    const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });
    const [testResult, setTestResult] = useState<{ type: "idle" | "testing" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });

    const hasExistingSmtpPass = !!config?.smtp?.encryptedPassword;
    const hasExistingImapPass = !!config?.imap?.encryptedPassword;

    function handleSave() {
        const fd = new FormData();
        fd.set("smtpHost", smtpHost);
        fd.set("smtpPort", smtpPort);
        fd.set("smtpUsername", smtpUsername);
        fd.set("smtpPassword", smtpPassword);
        fd.set("smtpTls", smtpTls.toString());
        fd.set("smtpFrom", smtpFrom);
        fd.set("imapHost", imapHost);
        fd.set("imapPort", imapPort);
        fd.set("imapUsername", imapUsername);
        fd.set("imapPassword", imapPassword);
        fd.set("imapTls", imapTls.toString());

        startTransition(async () => {
            const result = await saveEmailConfigAction(fd);
            setStatus({
                type: result.success ? "success" : "error",
                message: result.message ?? "",
            });
            if (result.success) router.refresh();
        });
    }

    function handleTest() {
        setTestResult({ type: "testing", message: "" });
        const fd = new FormData();
        fd.set("smtpHost", smtpHost);
        fd.set("smtpPort", smtpPort);
        fd.set("smtpUsername", smtpUsername);
        fd.set("smtpPassword", smtpPassword || "__existing__");
        fd.set("smtpTls", smtpTls.toString());
        fd.set("smtpFrom", smtpFrom);
        fd.set("imapHost", imapHost);
        fd.set("imapPort", imapPort);
        fd.set("imapUsername", imapUsername);
        fd.set("imapPassword", imapPassword || "__existing__");
        fd.set("imapTls", imapTls.toString());

        testEmailConnectionAction(fd).then((result) => {
            setTestResult({
                type: result.success ? "success" : "error",
                message: result.message ?? "",
            });
        });
    }

    return (
        <div className="space-y-6">
            {/* SMTP */}
            <Card>
                <CardHeader title="SMTP (Outgoing Email)" description="Configure SMTP for sending emails from your agents." />
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-pulse-text-soft mb-1">Host</label>
                        <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-pulse-panel text-pulse-text-soft placeholder:text-pulse-faint" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-pulse-text-soft mb-1">Port</label>
                        <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-pulse-panel text-pulse-text-soft placeholder:text-pulse-faint" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-pulse-text-soft mb-1">Username</label>
                        <input type="text" value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} placeholder="user@company.com" className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-pulse-panel text-pulse-text-soft placeholder:text-pulse-faint" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-pulse-text-soft mb-1">Password</label>
                        <input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder={hasExistingSmtpPass ? "••••••••" : "App password"} className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-pulse-panel text-pulse-text-soft placeholder:text-pulse-faint" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-pulse-text-soft mb-1">From Address</label>
                        <input type="email" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="agent@company.com" className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-pulse-panel text-pulse-text-soft placeholder:text-pulse-faint" />
                    </div>
                    <div className="flex items-center gap-2.5">
                        <Toggle checked={smtpTls} onChange={setSmtpTls} label="Use TLS for SMTP" />
                        <span className="text-sm text-pulse-text-soft">Use TLS</span>
                    </div>
                </div>
            </Card>

            {/* IMAP */}
            <Card>
                <CardHeader title="IMAP (Incoming Email)" description="Configure IMAP for reading emails. Optional — needed for email_read and email_list tools." />
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-pulse-text-soft mb-1">Host</label>
                        <input type="text" value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.gmail.com" className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-pulse-panel text-pulse-text-soft placeholder:text-pulse-faint" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-pulse-text-soft mb-1">Port</label>
                        <input type="number" value={imapPort} onChange={(e) => setImapPort(e.target.value)} placeholder="993" className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-pulse-panel text-pulse-text-soft placeholder:text-pulse-faint" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-pulse-text-soft mb-1">Username</label>
                        <input type="text" value={imapUsername} onChange={(e) => setImapUsername(e.target.value)} placeholder="user@company.com" className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-pulse-panel text-pulse-text-soft placeholder:text-pulse-faint" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-pulse-text-soft mb-1">Password</label>
                        <input type="password" value={imapPassword} onChange={(e) => setImapPassword(e.target.value)} placeholder={hasExistingImapPass ? "••••••••" : "App password"} className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-pulse-panel text-pulse-text-soft placeholder:text-pulse-faint" />
                    </div>
                    <div className="flex items-center gap-2.5">
                        <Toggle checked={imapTls} onChange={setImapTls} label="Use TLS for IMAP" />
                        <span className="text-sm text-pulse-text-soft">Use TLS</span>
                    </div>
                </div>
            </Card>

            {/* Actions */}
            <div className="flex items-center gap-3">
                <button onClick={handleSave} disabled={pending} className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel">
                    {pending ? "Saving..." : "Save Email Config"}
                </button>
                <button onClick={handleTest} disabled={testResult.type === "testing"} className="px-6 py-2.5 text-sm font-medium text-pulse-text-soft bg-pulse-panel-alt rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                    {testResult.type === "testing" ? "Testing..." : "Test Connection"}
                </button>
                {status.type === "success" && <span className="text-sm text-green-400">{status.message}</span>}
                {status.type === "error" && <span className="text-sm text-red-400">{status.message}</span>}
                {testResult.type === "success" && <span className="text-sm text-green-400">{testResult.message}</span>}
                {testResult.type === "error" && <span className="text-sm text-red-400">{testResult.message}</span>}
            </div>
        </div>
    );
}

function CredentialRow({ label, value, onCopy, copied, masked, hint }: { label: string; value: string; onCopy?: () => void; copied?: boolean; masked?: boolean; hint?: string }) {
    return (
        <div>
            <p className="text-xs font-medium text-pulse-faint mb-1">{label}</p>
            <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-pulse-panel-alt border border-pulse-border-subtle rounded-lg px-3 py-2 font-mono text-pulse-text-soft truncate">{value}</code>
                {onCopy && (
                    <button onClick={onCopy} className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-pulse-border-subtle rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none text-pulse-muted cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                        {copied ? "Copied!" : "Copy"}
                    </button>
                )}
                {masked && hint && <span className="text-xs text-pulse-faint flex-shrink-0">{hint}</span>}
            </div>
        </div>
    );
}
