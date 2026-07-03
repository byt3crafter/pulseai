"use client";

import { useState } from "react";
import { updateTenantConfigAction } from "./actions";
import { ui, Panel } from "../../../../components/admin/ui";

interface TenantSettingsProps {
    tenantId: string;
    tenantName: string;
    config: {
        enable_third_party_cli?: boolean;
        heartbeat_enabled?: boolean;
        heartbeat_default_interval?: number;
        [key: string]: any;
    };
    clientId?: string;
}

export default function TenantSettingsClient({
    tenantId,
    tenantName,
    config,
    clientId,
}: TenantSettingsProps) {
    const [enableCli, setEnableCli] = useState(config.enable_third_party_cli ?? false);
    const [heartbeatEnabled, setHeartbeatEnabled] = useState(config.heartbeat_enabled ?? false);
    const [heartbeatInterval, setHeartbeatInterval] = useState((config.heartbeat_default_interval || 3600).toString());
    const [routingEnabled, setRoutingEnabled] = useState(config.multi_agent_routing_enabled ?? false);
    const [chatgptConnect, setChatgptConnect] = useState(config.chatgptConnectEnabled ?? false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        const result = await updateTenantConfigAction(tenantId, {
            enable_third_party_cli: enableCli,
            heartbeat_enabled: heartbeatEnabled,
            heartbeat_default_interval: parseInt(heartbeatInterval, 10) || 3600,
            multi_agent_routing_enabled: routingEnabled,
            chatgptConnectEnabled: chatgptConnect,
        });

        if (result.success) {
            setMessage("Settings saved successfully.");
        } else {
            setMessage(result.message || "Failed to save settings.");
        }
        setSaving(false);
    };

    return (
        <div className="space-y-4">
            {/* OAuth Settings */}
            <Panel bodyClassName="p-6">
                <h2 className="text-[15px] font-semibold text-pulse-text mb-1">OAuth / CLI Settings</h2>
                <p className="text-[13px] text-pulse-muted mb-4">Control whether third-party developer tools can authenticate with this tenant's workspace.</p>
                <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={enableCli}
                            onChange={(e) => setEnableCli(e.target.checked)}
                            className="w-4 h-4 text-pulse-accent border-pulse-border rounded focus:ring-pulse-accent"
                        />
                        <div>
                            <span className="text-[13px] font-medium text-pulse-text">Enable Third-Party CLI Access</span>
                            <p className="text-[11px] text-pulse-muted">Allow tools like Claude Code and Codex to authenticate via OAuth</p>
                        </div>
                    </label>
                    {clientId && (
                        <div className="mt-2 bg-pulse-panel-alt border border-pulse-border rounded-md p-3">
                            <div className={ui.metaMicro}>OAuth Client ID</div>
                            <code className="text-[13px] font-mono text-pulse-text-soft">{clientId}</code>
                        </div>
                    )}
                </div>
            </Panel>

            {/* Heartbeat Defaults */}
            <Panel bodyClassName="p-6">
                <h2 className="text-[15px] font-semibold text-pulse-text mb-1">Heartbeat Defaults</h2>
                <p className="text-[13px] text-pulse-muted mb-4">Set the default behavior for the automated pacemaker scheduler when new agents are created.</p>
                <div className="space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={heartbeatEnabled}
                            onChange={(e) => setHeartbeatEnabled(e.target.checked)}
                            className="w-4 h-4 text-pulse-accent border-pulse-border rounded focus:ring-pulse-accent"
                        />
                        <div>
                            <span className="text-[13px] font-medium text-pulse-text">Enable Heartbeat by Default</span>
                            <p className="text-[11px] text-pulse-muted">Automatically start the scheduler for new agents</p>
                        </div>
                    </label>
                    <div className={!heartbeatEnabled ? "opacity-50 pointer-events-none" : ""}>
                        <label className={ui.label}>
                            Default Interval (seconds)
                        </label>
                        <input
                            type="number"
                            min="60"
                            value={heartbeatInterval}
                            onChange={(e) => setHeartbeatInterval(e.target.value)}
                            className={`${ui.input} max-w-[200px]`}
                        />
                    </div>
                </div>
            </Panel>

            {/* Multi-Agent Routing */}
            <Panel bodyClassName="p-6">
                <h2 className="text-[15px] font-semibold text-pulse-text mb-1">Multi-Agent Routing</h2>
                <p className="text-[13px] text-pulse-muted mb-4">Allow this tenant to create routing rules that dispatch messages to different agents based on contact, group, keywords, or channel.</p>
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={routingEnabled}
                        onChange={(e) => setRoutingEnabled(e.target.checked)}
                        className="w-4 h-4 text-pulse-accent border-pulse-border rounded focus:ring-pulse-accent"
                    />
                    <div>
                        <span className="text-[13px] font-medium text-pulse-text">Enable Multi-Agent Routing</span>
                        <p className="text-[11px] text-pulse-muted">When disabled, all messages go to the channel&apos;s assigned agent</p>
                    </div>
                </label>
            </Panel>

            {/* ChatGPT Connect */}
            <Panel bodyClassName="p-6">
                <h2 className="text-[15px] font-semibold text-pulse-text mb-1">ChatGPT Account Connect</h2>
                <p className="text-[13px] text-pulse-muted mb-4">Let this customer connect their own ChatGPT (Plus/Pro/Max) account via OAuth, so their agents can run on their subscription. Off by default — enable per customer.</p>
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={chatgptConnect}
                        onChange={(e) => setChatgptConnect(e.target.checked)}
                        className="w-4 h-4 text-pulse-accent border-pulse-border rounded focus:ring-pulse-accent"
                    />
                    <div>
                        <span className="text-[13px] font-medium text-pulse-text">Enable ChatGPT Connect</span>
                        <p className="text-[11px] text-pulse-muted">Shows the &quot;Connect ChatGPT&quot; option in this customer&apos;s dashboard</p>
                    </div>
                </label>
            </Panel>

            <div className="bg-pulse-accent/10 border border-pulse-accent/40 rounded-lg p-4">
                <p className="text-[13px] text-pulse-accent">
                    Telegram policies (DM pairing, group access, allowlists) are managed by the tenant from their own dashboard under <span className="font-semibold">Settings &rarr; Telegram</span>.
                </p>
            </div>

            {/* Save Button */}
            <div className="flex items-center gap-4">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={ui.btnPrimary}
                >
                    {saving ? "Saving..." : "Save Settings"}
                </button>
                {message && (
                    <span className={`text-[13px] ${message.includes("success") ? "text-pulse-profit" : "text-pulse-loss"}`}>
                        {message}
                    </span>
                )}
            </div>
        </div>
    );
}
