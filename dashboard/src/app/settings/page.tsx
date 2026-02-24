"use client";

import { useState } from "react";

export default function SettingsPage() {
    const [enableThirdPartyCli, setEnableThirdPartyCli] = useState(false);

    const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        setEnableThirdPartyCli(checked);

        // TODO: Send API request to /api/tenants/settings to update `config.enable_third_party_cli` in the PostgreSQL database.
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col p-8">
            <div className="max-w-4xl w-full mx-auto bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Tenant Settings</h1>

                <div className="space-y-8">
                    {/* Security & Access Section */}
                    <section>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Developer & API Access</h2>

                        <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="max-w-xl">
                                <h3 className="font-medium text-gray-900">Enable Third-Party CLI Integrations</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Allow developer tools (e.g., Claude Code, Cursor, Codex) to authenticate with this tenant using Pulse as an OAuth 2.0 provider. If disabled, local agents cannot connect to this environment.
                                </p>
                            </div>

                            <div className="flex items-center h-full pt-2">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={enableThirdPartyCli}
                                        onChange={handleToggle}
                                    />
                                    <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-300 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                                </label>
                            </div>
                        </div>
                    </section>

                    {/* Billing & Credits Section */}
                    <section>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Billing & Credits</h2>
                        <div className="p-4 bg-blue-50 text-blue-800 rounded-lg text-sm">
                            <p>Your current AI Gateway balance is <strong>0.00 Credits</strong>.</p>
                            <button className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">
                                Top Up Balance
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
