"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAgentTelegramBotAction, disconnectAgentTelegramBotAction } from "./actions";
import { Card, CardHeader, SettingHint } from "../../../../components/dashboard/ui";

interface Props {
    agentId: string;
    agentName: string;
    connected: boolean;
    botUsername: string | null;
}

export default function TelegramConfigEditor({ agentId, agentName, connected, botUsername }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [token, setToken] = useState("");
    const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string }>({
        type: "idle",
        message: "",
    });

    function handleSave() {
        if (!token.trim()) {
            setStatus({ type: "error", message: "Enter a bot token first." });
            return;
        }

        const fd = new FormData();
        fd.set("agentId", agentId);
        fd.set("telegramToken", token.trim());

        startTransition(async () => {
            const result = await saveAgentTelegramBotAction(fd);
            setStatus({ type: result.success ? "success" : "error", message: result.message ?? "" });
            if (result.success) {
                setToken("");
                router.refresh();
            }
        });
    }

    function handleDisconnect() {
        const fd = new FormData();
        fd.set("agentId", agentId);

        startTransition(async () => {
            const result = await disconnectAgentTelegramBotAction(fd);
            setStatus({ type: result.success ? "success" : "error", message: result.message ?? "" });
            if (result.success) {
                router.refresh();
            }
        });
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader
                    title="Telegram Bot"
                    description={`Connect a dedicated Telegram bot that always replies as ${agentName}. Separate from the company-wide bot in Settings → Telegram.`}
                />
                <div className="p-4 sm:p-6 space-y-4">
                    {connected ? (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 rounded-lg border border-pulse-border-subtle bg-pulse-tint">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-pulse-text">
                                    Connected{botUsername ? <> — @{botUsername}</> : null}
                                </p>
                                <p className="text-xs text-pulse-muted mt-0.5">
                                    This bot responds to DMs and mentions as {agentName}.
                                </p>
                            </div>
                            <button
                                onClick={handleDisconnect}
                                disabled={pending}
                                className="px-4 py-2 text-sm font-medium text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500 flex-shrink-0"
                            >
                                {pending ? "Disconnecting..." : "Disconnect"}
                            </button>
                        </div>
                    ) : (
                        <p className="text-xs text-pulse-faint">No dedicated bot connected yet — this agent only responds through the company-wide bot (if any) or other channels.</p>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-pulse-text-soft mb-1">
                            {connected ? "Replace bot token" : "Bot token"}
                        </label>
                        <input
                            type="password"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                            className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                        />
                        <SettingHint>Get a token from @BotFather on Telegram, then paste it here.</SettingHint>
                    </div>

                    <div className="rounded-lg border border-pulse-border-subtle bg-pulse-panel px-4 py-3">
                        <p className="text-xs text-pulse-muted">
                            Add the bot to your group and it responds per your Telegram group policy
                            (Settings → Telegram). Groups are identified automatically — no group id needed.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleSave}
                            disabled={pending}
                            className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            {pending ? "Saving..." : connected ? "Update Bot Token" : "Connect Bot"}
                        </button>
                        {status.type === "success" && (
                            <span className="text-sm text-green-400">{status.message || "Saved!"}</span>
                        )}
                        {status.type === "error" && (
                            <span className="text-sm text-red-400">{status.message || "Failed to save."}</span>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}
