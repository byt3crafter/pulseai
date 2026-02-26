"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateHeartbeatConfigAction } from "./actions";

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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold text-slate-900">Heartbeat Scheduler</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Automate agent execution on a recurring interval. Use this for agents that need to initiate conversations.</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">Enabled</span>
                    <button
                        onClick={() => setEnabled(!enabled)}
                        className={`w-10 h-5 rounded-full transition-colors flex items-center px-1 ${enabled ? "bg-indigo-600 focus:ring-4 focus:ring-indigo-100" : "bg-slate-300"
                            }`}
                    >
                        <div
                            className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transform transition-transform ${enabled ? "translate-x-4.5" : "translate-x-0"
                                }`}
                        />
                    </button>
                </div>
            </div>

            <div className={`px-6 py-5 space-y-6 ${!enabled ? "opacity-50 pointer-events-none" : ""}`}>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Interval (seconds)
                    </label>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            min="60"
                            value={everySecs}
                            onChange={(e) => setEverySecs(e.target.value)}
                            className="w-40 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900 bg-white"
                        />
                        <span className="text-sm text-slate-500">
                            (Approx. {everyMins} minute{everyMins !== 1 && "s"})
                        </span>
                    </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-medium text-slate-800">Active Hours (Optional)</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Restrict heartbeats to specific times of day</p>
                        </div>
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={activeHoursEnabled}
                                onChange={(e) => setActiveHoursEnabled(e.target.checked)}
                                className="sr-only"
                            />
                            <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${activeHoursEnabled ? "bg-emerald-500" : "bg-slate-300"
                                }`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${activeHoursEnabled ? "translate-x-4" : "translate-x-0"
                                    }`} />
                            </div>
                        </label>
                    </div>

                    {activeHoursEnabled && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Start Time</label>
                                <input
                                    type="time"
                                    value={startHour}
                                    onChange={(e) => setStartHour(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none text-slate-900 bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">End Time</label>
                                <input
                                    type="time"
                                    value={endHour}
                                    onChange={(e) => setEndHour(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none text-slate-900 bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Timezone</label>
                                <select
                                    value={timezone}
                                    onChange={(e) => setTimezone(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none text-slate-900 bg-white"
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

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={!isDirty || status.type === "saving"}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Save Configuration
                </button>
                {status.type !== "idle" && (
                    <span className={`text-sm ${status.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
                        {status.type === "saving" ? "Saving..." : status.message}
                    </span>
                )}
            </div>
        </div>
    );
}
