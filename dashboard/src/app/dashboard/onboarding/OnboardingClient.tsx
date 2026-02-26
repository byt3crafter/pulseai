"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { changePasswordAction, saveTelegramChannelAction } from "./actions";

type Step = "password" | "telegram" | "done";

export default function OnboardingClient() {
    const [step, setStep] = useState<Step>("password");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Password step
    const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        const fd = new FormData(e.currentTarget);
        const result = await changePasswordAction(fd);
        if (!result.success) {
            setError(result.message ?? "Something went wrong.");
        } else {
            setStep("telegram");
        }
        setLoading(false);
    };

    // Telegram step
    const handleTelegramSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        const fd = new FormData(e.currentTarget);
        const result = await saveTelegramChannelAction(fd);
        if (!result.success) {
            setError(result.message ?? "Invalid token.");
        } else {
            setStep("done");
        }
        setLoading(false);
    };

    const skipTelegram = () => setStep("done");

    const finishAndLogin = async () => {
        await signOut({ callbackUrl: "/login" });
    };

    return (
        <div className="w-full max-w-md px-4">
            {/* Logo */}
            <div className="flex items-center gap-2 justify-center mb-10">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-white">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                </div>
                <span className="text-lg font-bold text-slate-900">Pulse</span>
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2 mb-8">
                {["password", "telegram"].map((s, i) => (
                    <div key={s} className={`h-1.5 rounded-full transition-all ${step === s ? "w-6 bg-indigo-600" : (step === "done" || (step === "telegram" && i === 0)) ? "w-3 bg-indigo-300" : "w-3 bg-slate-200"}`} />
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* ── Step 1: Set Password ── */}
                {step === "password" && (
                    <>
                        <div className="px-8 pt-8 pb-6 border-b border-slate-100">
                            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Step 1 of 2</p>
                            <h1 className="text-xl font-bold text-slate-900">Set your password</h1>
                            <p className="text-sm text-slate-500 mt-1">You've been given a temporary password. Create a permanent one to continue.</p>
                        </div>
                        <form onSubmit={handlePasswordSubmit} className="px-8 py-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
                                <input
                                    type="password"
                                    name="newPassword"
                                    required
                                    minLength={8}
                                    placeholder="Min. 8 characters"
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm Password</label>
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    required
                                    placeholder="Repeat password"
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900"
                                />
                            </div>
                            {error && <p className="text-sm text-red-500">{error}</p>}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm mt-2"
                            >
                                {loading ? "Saving…" : "Set Password & Continue"}
                            </button>
                        </form>
                    </>
                )}

                {/* ── Step 2: Connect Telegram ── */}
                {step === "telegram" && (
                    <>
                        <div className="px-8 pt-8 pb-6 border-b border-slate-100">
                            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">Step 2 of 2</p>
                            <h1 className="text-xl font-bold text-slate-900">Connect a channel</h1>
                            <p className="text-sm text-slate-500 mt-1">Paste your Telegram Bot API token. Create one via <span className="font-medium text-slate-700">@BotFather</span> on Telegram.</p>
                        </div>
                        <form onSubmit={handleTelegramSubmit} className="px-8 py-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Bot API Token</label>
                                <input
                                    type="password"
                                    name="botToken"
                                    required
                                    placeholder="123456789:ABCdef…"
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900 placeholder:font-sans"
                                />
                            </div>
                            {error && <p className="text-sm text-red-500">{error}</p>}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm"
                            >
                                {loading ? "Validating…" : "Connect & Continue"}
                            </button>
                        </form>
                        <div className="px-8 pb-6">
                            <button
                                type="button"
                                onClick={skipTelegram}
                                className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                Skip for now — I'll set this up in Settings
                            </button>
                        </div>
                    </>
                )}

                {/* ── Done ── */}
                {step === "done" && (
                    <div className="px-8 py-10 text-center">
                        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-emerald-600">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        </div>
                        <h1 className="text-xl font-bold text-slate-900 mb-2">You're all set!</h1>
                        <p className="text-sm text-slate-500 mb-6">Your account is ready. Sign in with your new password to access the dashboard.</p>
                        <button
                            onClick={finishAndLogin}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                        >
                            Sign In to Dashboard →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
