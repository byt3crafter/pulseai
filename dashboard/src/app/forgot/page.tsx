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
        <div className="flex min-h-screen items-center justify-center bg-pulse-bg p-4">
            <div className="w-full max-w-[400px]">
                <h1 className="mb-1 text-[17px] font-semibold tracking-[-0.01em] text-pulse-text">Forgot password</h1>
                <p className="mb-8 text-[13px] text-pulse-muted">
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
                            <label htmlFor="forgot-email" className="mb-1.5 block text-[13px] font-medium text-pulse-soft">
                                Email Address
                            </label>
                            <input
                                id="forgot-email"
                                type="email"
                                required
                                autoComplete="email"
                                placeholder="you@yourcompany.com"
                                className="w-full rounded-lg border border-pulse-border bg-pulse-bg px-3 py-2.5 text-sm text-pulse-text placeholder:text-pulse-faint outline-none transition-shadow focus:border-pulse-accent focus:ring-2 focus:ring-pulse-accent/30"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={pending}
                            className="w-full cursor-pointer rounded-lg bg-pulse-accent py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-pulse-accent-hi disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {pending ? "Sending..." : "Send reset link"}
                        </button>
                    </form>
                )}

                <p className="mt-8 text-center text-[12px] text-pulse-faint">
                    <Link href="/login" className="transition-colors hover:text-pulse-muted">
                        ← Back to sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
