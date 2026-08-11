"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon, CheckCircleIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { startChatgptConnect, completeChatgptConnect, disconnectChatgpt } from "./actions";

type Props = { enabled: boolean; connected: boolean; accountId: string | null; expiresAt: string | null };

export default function ChatGptClient({ enabled, connected, accountId, expiresAt }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [showPaste, setShowPaste] = useState(false);
    const [pastedUrl, setPastedUrl] = useState("");

    if (!enabled) {
        return (
            <div className="p-4 sm:p-5 lg:p-6 max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-pulse-text flex items-center gap-2">
                    <SparklesIcon className="h-7 w-7 text-indigo-500" /> ChatGPT Connect
                </h1>
                <div className="mt-6 bg-pulse-panel rounded-xl border border-pulse-border-subtle p-8 text-center">
                    <LockClosedIcon className="h-10 w-10 text-pulse-faint mx-auto mb-3" />
                    <p className="text-pulse-text-soft font-medium">Not enabled for your workspace</p>
                    <p className="text-sm text-pulse-faint mt-1">Ask your Pulse administrator to enable ChatGPT Connect for your account.</p>
                </div>
            </div>
        );
    }

    const connect = () => {
        setMsg(null);
        startTransition(async () => {
            const res = await startChatgptConnect();
            if (res.success && res.authUrl) {
                window.open(res.authUrl, "_blank", "noopener");
                setShowPaste(true);
            } else {
                setMsg({ ok: false, text: res.message || "Could not start the connection." });
            }
        });
    };

    const complete = () => {
        setMsg(null);
        startTransition(async () => {
            const res = await completeChatgptConnect(pastedUrl);
            setMsg({ ok: res.success, text: res.message || (res.success ? "Connected." : "Failed.") });
            if (res.success) { setShowPaste(false); setPastedUrl(""); router.refresh(); }
        });
    };

    const disconnect = () => {
        if (!confirm("Disconnect your ChatGPT account?")) return;
        startTransition(async () => {
            const res = await disconnectChatgpt();
            setMsg({ ok: res.success, text: res.message || "" });
            router.refresh();
        });
    };

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-pulse-text flex items-center gap-2">
                <SparklesIcon className="h-7 w-7 text-indigo-500" /> ChatGPT Connect
            </h1>
            <p className="text-sm text-pulse-muted mt-1">
                Connect your ChatGPT (Plus/Pro/Max) account so your agents can run on your own subscription.
            </p>

            {msg && (
                <div className={`mt-4 rounded-lg px-4 py-2 text-sm border ${msg.ok ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                    {msg.text}
                </div>
            )}

            {connected ? (
                <div className="mt-6 bg-pulse-panel rounded-xl border border-pulse-border-subtle p-6">
                    <div className="flex items-center gap-2 text-green-400">
                        <CheckCircleIcon className="h-6 w-6" />
                        <span className="font-semibold text-pulse-text">ChatGPT account connected</span>
                    </div>
                    {accountId && <p className="text-xs text-pulse-faint mt-2 font-mono">account: {accountId}</p>}
                    {expiresAt && <p className="text-xs text-pulse-faint mt-1">token expires: {new Date(expiresAt).toLocaleString()}</p>}
                    <div className="mt-4 flex gap-2">
                        <button onClick={connect} disabled={pending} className="text-sm font-medium text-indigo-500 hover:text-indigo-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">Reconnect</button>
                        <span className="text-pulse-border-strong">·</span>
                        <button onClick={disconnect} disabled={pending} className="text-sm font-medium text-red-400 hover:text-red-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">Disconnect</button>
                    </div>
                </div>
            ) : (
                <div className="mt-6 bg-pulse-panel rounded-xl border border-pulse-border-subtle p-6 space-y-4">
                    {!showPaste ? (
                        <>
                            <p className="text-sm text-pulse-text-soft">Click connect, sign in to OpenAI in the new tab, then copy the URL you land on back here.</p>
                            <button onClick={connect} disabled={pending} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors motion-reduce:transition-none">
                                {pending ? "Starting…" : "Connect ChatGPT Account"}
                            </button>
                        </>
                    ) : (
                        <>
                            <ol className="text-sm text-pulse-text-soft list-decimal ml-5 space-y-1">
                                <li>Sign in and approve in the OpenAI tab that just opened.</li>
                                <li>You&apos;ll land on a page that <strong>won&apos;t load</strong> (starts with <code className="text-xs">http://localhost:1455/…</code>). That&apos;s expected.</li>
                                <li><strong>Copy the full URL</strong> from that tab&apos;s address bar and paste it below.</li>
                            </ol>
                            <input
                                type="text"
                                value={pastedUrl}
                                onChange={(e) => setPastedUrl(e.target.value)}
                                placeholder="http://localhost:1455/auth/callback?code=…&state=…"
                                className="w-full border border-pulse-border rounded-lg px-3 py-2 text-sm font-mono bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <div className="flex flex-col-reverse sm:flex-row gap-2">
                                <button onClick={complete} disabled={pending || !pastedUrl.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors motion-reduce:transition-none">
                                    {pending ? "Connecting…" : "Complete Connection"}
                                </button>
                                <button onClick={() => setShowPaste(false)} className="text-pulse-muted hover:text-pulse-text text-sm font-medium rounded-lg px-3 py-2 cursor-pointer transition-colors motion-reduce:transition-none">Cancel</button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
