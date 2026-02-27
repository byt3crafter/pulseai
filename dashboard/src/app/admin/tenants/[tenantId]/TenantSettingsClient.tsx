"use client";

import { useState } from "react";
import { updateTenantConfigAction } from "./actions";

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
        });

        if (result.success) {
            setMessage("Settings saved successfully.");
        } else {
            setMessage(result.message || "Failed to save settings.");
        }
        setSaving(false);
    };

    return (
        <div className="space-y-8">
            {/* OAuth Settings */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">OAuth / CLI Settings</h2>
                <p className="text-xs text-gray-500 mb-4">Control whether third-party developer tools can authenticate with this tenant's workspace.</p>
                <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={enableCli}
                            onChange={(e) => setEnableCli(e.target.checked)}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <div>
                            <span className="text-sm font-medium text-gray-900">Enable Third-Party CLI Access</span>
                            <p className="text-xs text-gray-500">Allow tools like Claude Code and Codex to authenticate via OAuth</p>
                        </div>
                    </label>
                    {clientId && (
                        <div className="mt-2 bg-gray-50 rounded-lg p-3">
                            <div className="text-xs text-gray-500">OAuth Client ID</div>
                            <code className="text-sm font-mono text-gray-800">{clientId}</code>
                        </div>
                    )}
                </div>
            </section>

            {/* Heartbeat Defaults */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Heartbeat Defaults</h2>
                <p className="text-xs text-gray-500 mb-4">Set the default behavior for the automated pacemaker scheduler when new agents are created.</p>
                <div className="space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={heartbeatEnabled}
                            onChange={(e) => setHeartbeatEnabled(e.target.checked)}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <div>
                            <span className="text-sm font-medium text-gray-900">Enable Heartbeat by Default</span>
                            <p className="text-xs text-gray-500">Automatically start the scheduler for new agents</p>
                        </div>
                    </label>
                    <div className={!heartbeatEnabled ? "opacity-50 pointer-events-none" : ""}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Default Interval (seconds)
                        </label>
                        <input
                            type="number"
                            min="60"
                            value={heartbeatInterval}
                            onChange={(e) => setHeartbeatInterval(e.target.value)}
                            className="w-full max-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>
            </section>

            {/* Multi-Agent Routing */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Multi-Agent Routing</h2>
                <p className="text-xs text-gray-500 mb-4">Allow this tenant to create routing rules that dispatch messages to different agents based on contact, group, keywords, or channel.</p>
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={routingEnabled}
                        onChange={(e) => setRoutingEnabled(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <div>
                        <span className="text-sm font-medium text-gray-900">Enable Multi-Agent Routing</span>
                        <p className="text-xs text-gray-500">When disabled, all messages go to the channel&apos;s assigned agent</p>
                    </div>
                </label>
            </section>

            <section className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800">
                    Telegram policies (DM pairing, group access, allowlists) are managed by the tenant from their own dashboard under <span className="font-semibold">Settings &rarr; Telegram</span>.
                </p>
            </section>

            {/* Save Button */}
            <div className="flex items-center gap-4">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                    {saving ? "Saving..." : "Save Settings"}
                </button>
                {message && (
                    <span className={`text-sm ${message.includes("success") ? "text-green-600" : "text-red-600"}`}>
                        {message}
                    </span>
                )}
            </div>
        </div>
    );
}
