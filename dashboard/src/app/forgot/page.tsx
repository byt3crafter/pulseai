"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "./actions";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [pending, startTransition] = useTransition();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        setError("");
        const formData = new FormData();
        formData.set("email", email);
        startTransition(async () => {
            const result = await requestPasswordResetAction(formData);
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
                <h1 className="text-2xl font-bold text-slate-900 mb-1">Forgot password</h1>
                <p className="text-sm text-slate-500 mb-8">
                    Enter your email and we&apos;ll send you a link to reset your password.
                </p>

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

                {!message && (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                                Email Address
                            </label>
                            <input
                                id="forgot-email"
                                type="email"
                                required
                                autoComplete="email"
                                placeholder="you@yourcompany.com"
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 bg-white text-sm"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={pending}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {pending ? "Sending..." : "Send reset link"}
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
