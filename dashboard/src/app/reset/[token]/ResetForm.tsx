"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetPasswordWithTokenAction } from "./actions";

export default function ResetForm({ token }: { token: string }) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [pending, startTransition] = useTransition();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        setError("");
        const formData = new FormData();
        formData.set("token", token);
        formData.set("password", password);
        formData.set("confirmPassword", confirmPassword);
        startTransition(async () => {
            const result = await resetPasswordWithTokenAction(formData);
            if (result.success) {
                setMessage(result.message);
            } else {
                setError(result.message);
            }
        });
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
            <div className="w-full max-w-sm">
                <h1 className="text-2xl font-bold text-slate-900 mb-1">Set a new password</h1>
                <p className="text-sm text-slate-500 mb-8">Choose a strong password for your Pulse account.</p>

                {message && (
                    <div role="status" className="bg-green-50 text-green-700 p-3 rounded-lg text-sm mb-6 border border-green-100">
                        {message}
                    </div>
                )}
                {error && (
                    <div role="alert" className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-100">
                        {error}
                    </div>
                )}

                {message ? (
                    <Link
                        href="/login"
                        className="block w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-sm"
                    >
                        Go to sign in
                    </Link>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                                New Password
                            </label>
                            <input
                                id="new-password"
                                type="password"
                                required
                                minLength={8}
                                autoComplete="new-password"
                                placeholder="••••••••"
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 bg-white text-sm"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                                Confirm Password
                            </label>
                            <input
                                id="confirm-password"
                                type="password"
                                required
                                minLength={8}
                                autoComplete="new-password"
                                placeholder="••••••••"
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 bg-white text-sm"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={pending}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {pending ? "Saving..." : "Set password"}
                        </button>
                    </form>
                )}

                <p className="text-center text-xs text-slate-400 mt-8">
                    <Link href="/login" className="hover:text-slate-600 transition-colors">
                        ← Back to sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
