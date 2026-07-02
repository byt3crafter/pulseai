"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { preAuthCheck } from "../../account/two-factor/actions";

export default function AdminLoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [ssoEnabled, setSsoEnabled] = useState(false);
    const [ssoName, setSsoName] = useState("SSO");
    const [ssoLoading, setSsoLoading] = useState(false);
    const [totpRequired, setTotpRequired] = useState(false);
    const [totp, setTotp] = useState("");
    const [info, setInfo] = useState("");
    const totpInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (totpRequired) totpInputRef.current?.focus();
    }, [totpRequired]);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/sso-status")
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) return;
                setSsoEnabled(!!data?.enabled);
                setSsoName(data?.name || "SSO");
            })
            .catch(() => {
                /* SSO status unavailable — keep default (hidden) */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const handleSsoSignIn = () => {
        setSsoLoading(true);
        signIn("sso", { callbackUrl: "/admin" });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setInfo("");

        const result = await signIn("credentials", {
            email,
            password,
            loginType: "admin",
            totp: totp || undefined,
            redirect: false,
        });

        if (result?.error) {
            if (!totpRequired) {
                const check = await preAuthCheck(email, password);
                if (check.rateLimited) {
                    setError("Too many attempts. Please wait a moment and try again.");
                } else if (check.valid && check.needs2fa) {
                    setTotpRequired(true);
                    setInfo("Enter the 6-digit code from your authenticator app.");
                } else {
                    setError("Invalid credentials. Only admin accounts can sign in here.");
                }
            } else {
                setError("Invalid authentication code.");
            }
            setLoading(false);
        } else {
            window.location.href = "/admin";
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-sm">
                <div className="flex items-center gap-2 mb-8 justify-center">
                    <div className="w-7 h-7 bg-pulse-accent rounded-lg flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-white">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                    </div>
                    <span className="text-base font-bold text-white">Pulse</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                    <div className="flex items-center gap-2 mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                        <h1 className="text-lg font-semibold text-white">Platform Administration</h1>
                    </div>

                    {info && (
                        <div role="status" className="bg-slate-800 text-slate-300 p-3 rounded-lg text-sm mb-5 border border-slate-700">{info}</div>
                    )}
                    {error && (
                        <div role="alert" className="bg-red-950/60 text-red-400 p-3 rounded-lg text-sm mb-5 border border-red-900/60">{error}</div>
                    )}

                    {ssoEnabled && (
                        <>
                            <button
                                type="button"
                                onClick={handleSsoSignIn}
                                disabled={ssoLoading}
                                className="w-full flex items-center justify-center gap-2 border border-slate-700 hover:bg-slate-800 text-slate-200 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                            >
                                {ssoLoading ? "Redirecting…" : `Sign in with ${ssoName}`}
                            </button>
                            <div className="flex items-center gap-3 my-5">
                                <span className="h-px flex-1 bg-slate-800" aria-hidden="true" />
                                <span className="text-xs text-slate-600">or</span>
                                <span className="h-px flex-1 bg-slate-800" aria-hidden="true" />
                            </div>
                        </>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="admin-login-email" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
                            <input
                                id="admin-login-email"
                                type="email"
                                required
                                autoComplete="email"
                                placeholder="admin@runstate.com"
                                className="w-full px-3 py-2.5 border border-slate-700 rounded-lg bg-slate-800 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-pulse-accent focus:border-pulse-accent outline-none text-sm"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label htmlFor="admin-login-password" className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Password</label>
                                <Link href="/forgot" className="text-xs font-medium text-pulse-accent hover:text-pulse-accent-hi normal-case tracking-normal">Forgot password?</Link>
                            </div>
                            <input
                                id="admin-login-password"
                                type="password"
                                required
                                autoComplete="current-password"
                                placeholder="••••••••"
                                className="w-full px-3 py-2.5 border border-slate-700 rounded-lg bg-slate-800 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-pulse-accent focus:border-pulse-accent outline-none text-sm"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        {totpRequired && (
                            <div>
                                <label htmlFor="admin-login-totp" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Authentication Code</label>
                                <input
                                    ref={totpInputRef}
                                    id="admin-login-totp"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    required
                                    placeholder="123456"
                                    className="w-full px-3 py-2.5 border border-slate-700 rounded-lg bg-slate-800 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-pulse-accent focus:border-pulse-accent outline-none text-sm font-mono tracking-widest"
                                    value={totp}
                                    onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                />
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-pulse-accent hover:bg-pulse-accent-hi text-white font-semibold py-2.5 rounded-lg transition-colors mt-2 disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Signing in...
                                </>
                            ) : "Sign In"}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-slate-700 mt-6">Internal access only — not for customers</p>
            </div>
        </div>
    );
}
