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
            <div className="p-8 max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <SparklesIcon className="h-7 w-7 text-indigo-600" /> ChatGPT Connect
                </h1>
                <div className="mt-6 bg-white rounded-xl border border-slate-200 p-8 text-center">
                    <LockClosedIcon className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 font-medium">Not enabled for your workspace</p>
                    <p className="text-sm text-slate-400 mt-1">Ask your Pulse administrator to enable ChatGPT Connect for your account.</p>
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
        <div className="p-8 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <SparklesIcon className="h-7 w-7 text-indigo-600" /> ChatGPT Connect
            </h1>
            <p className="text-sm text-slate-500 mt-1">
                Connect your ChatGPT (Plus/Pro/Max) account so your agents can run on your own subscription.
            </p>

            {msg && (
                <div className={`mt-4 rounded-lg px-4 py-2 text-sm border ${msg.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {msg.text}
                </div>
            )}

            {connected ? (
                <div className="mt-6 bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-center gap-2 text-green-600">
                        <CheckCircleIcon className="h-6 w-6" />
                        <span className="font-semibold text-slate-900">ChatGPT account connected</span>
                    </div>
                    {accountId && <p className="text-xs text-slate-400 mt-2 font-mono">account: {accountId}</p>}
                    {expiresAt && <p className="text-xs text-slate-400 mt-1">token expires: {new Date(expiresAt).toLocaleString()}</p>}
                    <div className="mt-4 flex gap-2">
                        <button onClick={connect} disabled={pending} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">Reconnect</button>
                        <span className="text-slate-300">·</span>
                        <button onClick={disconnect} disabled={pending} className="text-sm font-medium text-red-600 hover:text-red-700">Disconnect</button>
                    </div>
                </div>
            ) : (
                <div className="mt-6 bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    {!showPaste ? (
                        <>
                            <p className="text-sm text-slate-600">Click connect, sign in to OpenAI in the new tab, then copy the URL you land on back here.</p>
                            <button onClick={connect} disabled={pending} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50">
                                {pending ? "Starting…" : "Connect ChatGPT Account"}
                            </button>
                        </>
                    ) : (
                        <>
                            <ol className="text-sm text-slate-600 list-decimal ml-5 space-y-1">
                                <li>Sign in and approve in the OpenAI tab that just opened.</li>
                                <li>You&apos;ll land on a page that <strong>won&apos;t load</strong> (starts with <code className="text-xs">http://localhost:1455/…</code>). That&apos;s expected.</li>
                                <li><strong>Copy the full URL</strong> from that tab&apos;s address bar and paste it below.</li>
                            </ol>
                            <input
                                type="text"
                                value={pastedUrl}
                                onChange={(e) => setPastedUrl(e.target.value)}
                                placeholder="http://localhost:1455/auth/callback?code=…&state=…"
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <div className="flex gap-2">
                                <button onClick={complete} disabled={pending || !pastedUrl.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50">
                                    {pending ? "Connecting…" : "Complete Connection"}
                                </button>
                                <button onClick={() => setShowPaste(false)} className="text-slate-500 hover:text-slate-800 text-sm font-medium rounded-lg px-3 py-2">Cancel</button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
