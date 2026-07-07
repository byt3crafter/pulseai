"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateHeartbeatConfigAction } from "./actions";
import { InfoTip } from "../../../../components/dashboard/ui";

interface HeartbeatConfig {
    enabled?: boolean;
    every?: number;
    activeHours?: {
        enabled: boolean;
        start: string;
        end: string;
        timezone: string;
    };
}

export default function HeartbeatEditor({
    agentId,
    initialConfig,
}: {
    agentId: string;
    initialConfig: any;
}) {
    const config = (initialConfig as HeartbeatConfig) || {};

    const [enabled, setEnabled] = useState(config.enabled ?? false);
    const [everySecs, setEverySecs] = useState((config.every || 3600).toString());

    const [activeHoursEnabled, setActiveHoursEnabled] = useState(config.activeHours?.enabled ?? false);
    const [startHour, setStartHour] = useState(config.activeHours?.start || "09:00");
    const [endHour, setEndHour] = useState(config.activeHours?.end || "17:00");
    const [timezone, setTimezone] = useState(config.activeHours?.timezone || "UTC");

    const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });
    const router = useRouter();

    const handleSave = async () => {
        setStatus({ type: "saving", message: "" });
        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("enabled", enabled.toString());
        fd.set("every", everySecs);
        fd.set("activeHoursEnabled", activeHoursEnabled.toString());
        fd.set("activeHoursStart", startHour);
        fd.set("activeHoursEnd", endHour);
        fd.set("activeHoursTimezone", timezone);

        const result = await updateHeartbeatConfigAction(fd);
        setStatus({
            type: result.success ? "success" : "error",
            message: result.message ?? "",
        });
        if (result.success) {
            router.refresh();
        }
    };

    const isDirty =
        enabled !== (config.enabled ?? false) ||
        everySecs !== (config.every || 3600).toString() ||
        activeHoursEnabled !== (config.activeHours?.enabled ?? false) ||
        startHour !== (config.activeHours?.start || "09:00") ||
        endHour !== (config.activeHours?.end || "17:00") ||
        timezone !== (config.activeHours?.timezone || "UTC");

    // Quick conversion for display
    const everyNumber = parseInt(everySecs) || 3600;
    const everyMins = Math.floor(everyNumber / 60);

    return (
        <div className="bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-pulse-border-subtle flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h2 className="text-sm font-semibold text-pulse-text">Heartbeat Scheduler</h2>
                        <InfoTip text="Example: 'every morning, check overnight errors and post a summary.' Leave empty for none." />
                    </div>
                    <p className="text-xs text-pulse-faint mt-0.5">Instructions the agent runs on its own schedule, even when nobody messages it.</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-pulse-muted">Enabled</span>
                    <button
                        onClick={() => setEnabled(!enabled)}
                        className={`w-10 h-5 rounded-full transition-colors motion-reduce:transition-none flex items-center px-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel ${enabled ? "bg-indigo-600" : "bg-pulse-border-strong"
                            }`}
                    >
                        <div
                            className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transform transition-transform motion-reduce:transition-none ${enabled ? "translate-x-4.5" : "translate-x-0"
                                }`}
                        />
                    </button>
                </div>
            </div>

            <div className={`px-6 py-5 space-y-6 ${!enabled ? "opacity-50 pointer-events-none" : ""}`}>
                <div>
                    <label className="block text-sm font-medium text-pulse-text-soft mb-1">
                        Interval (seconds)
                    </label>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            min="60"
                            value={everySecs}
                            onChange={(e) => setEverySecs(e.target.value)}
                            className="w-40 px-4 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-pulse-text bg-pulse-panel placeholder:text-pulse-faint"
                        />
                        <span className="text-sm text-pulse-muted">
                            (Approx. {everyMins} minute{everyMins !== 1 && "s"})
                        </span>
                    </div>
                </div>

                <div className="border border-pulse-border-subtle rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-pulse-panel-alt border-b border-pulse-border-subtle flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-medium text-pulse-text-soft">Active Hours (Optional)</h3>
                            <p className="text-xs text-pulse-muted mt-0.5">Restrict heartbeats to specific times of day</p>
                        </div>
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={activeHoursEnabled}
                                onChange={(e) => setActiveHoursEnabled(e.target.checked)}
                                className="sr-only"
                            />
                            <div className={`w-9 h-5 rounded-full transition-colors motion-reduce:transition-none flex items-center px-0.5 ${activeHoursEnabled ? "bg-emerald-500" : "bg-pulse-border-strong"
                                }`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform motion-reduce:transition-none ${activeHoursEnabled ? "translate-x-4" : "translate-x-0"
                                    }`} />
                            </div>
                        </label>
                    </div>

                    {activeHoursEnabled && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Start Time</label>
                                <input
                                    type="time"
                                    value={startHour}
                                    onChange={(e) => setStartHour(e.target.value)}
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm outline-none text-pulse-text bg-pulse-panel"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">End Time</label>
                                <input
                                    type="time"
                                    value={endHour}
                                    onChange={(e) => setEndHour(e.target.value)}
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm outline-none text-pulse-text bg-pulse-panel"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-pulse-text-soft mb-1">Timezone</label>
                                <select
                                    value={timezone}
                                    onChange={(e) => setTimezone(e.target.value)}
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm outline-none text-pulse-text bg-pulse-panel"
                                >
                                    <option value="UTC">UTC</option>
                                    <option value="America/New_York">US Eastern (ET)</option>
                                    <option value="America/Chicago">US Central (CT)</option>
                                    <option value="America/Denver">US Mountain (MT)</option>
                                    <option value="America/Los_Angeles">US Pacific (PT)</option>
                                    <option value="Europe/London">London (GMT/BST)</option>
                                    <option value="Europe/Paris">Central Europe (CET)</option>
                                    <option value="Asia/Tokyo">Tokyo (JST)</option>
                                    <option value="Australia/Sydney">Sydney (AET)</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="px-6 py-4 bg-pulse-panel-alt border-t border-pulse-border-subtle flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={!isDirty || status.type === "saving"}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel-alt"
                >
                    Save Configuration
                </button>
                {status.type !== "idle" && (
                    <span className={`text-sm ${status.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                        {status.type === "saving" ? "Saving..." : status.message}
                    </span>
                )}
            </div>
        </div>
    );
}
