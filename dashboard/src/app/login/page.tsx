"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { preAuthCheck } from "../account/two-factor/actions";

function LoginForm() {
    const searchParams = useSearchParams();
    const message = searchParams.get("message");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [info, setInfo] = useState(message || "");
    const [loading, setLoading] = useState(false);
    const [ssoEnabled, setSsoEnabled] = useState(false);
    const [ssoName, setSsoName] = useState("SSO");
    const [ssoLoading, setSsoLoading] = useState(false);
    const [totpRequired, setTotpRequired] = useState(false);
    const [totp, setTotp] = useState("");
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
        signIn("sso", { callbackUrl: "/dashboard" });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setInfo("");

        const result = await signIn("credentials", {
            email,
            password,
            loginType: "tenant",
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
                    setError("Invalid email or password. If you are an admin, use the admin login page.");
                }
            } else {
                setError("Invalid authentication code.");
            }
            setLoading(false);
        } else {
            window.location.href = "/dashboard";
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Left branding panel */}
            <div className="hidden lg:flex w-1/2 bg-slate-950 flex-col justify-between p-12">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-white">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                    </div>
                    <span className="text-lg font-bold text-white tracking-tight">Pulse</span>
                </Link>
                <div>
                    <p className="text-3xl font-bold text-white leading-tight mb-4">
                        Your AI workforce,<br />ready to work.
                    </p>
                    <p className="text-slate-400 text-sm">
                        Sign in to manage your agents, departments, and connected tools.
                    </p>
                </div>
                <p className="text-xs text-slate-700">© {new Date().getFullYear()} Runstate Ltd</p>
            </div>

            {/* Right login panel */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-sm">
                    <div className="lg:hidden flex items-center gap-2 mb-8">
                        <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-white">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                            </svg>
                        </div>
                        <span className="text-base font-bold text-slate-900">Pulse</span>
                    </div>

                    <h1 className="text-2xl font-bold text-slate-900 mb-1">Workspace Login</h1>
                    <p className="text-sm text-slate-500 mb-8">Enter your credentials to access your dashboard.</p>

                    {info && (
                        <div role="status" className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm mb-6 border border-blue-100">{info}</div>
                    )}
                    {error && (
                        <div role="alert" className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-100">{error}</div>
                    )}

                    {ssoEnabled && (
                        <>
                            <button
                                type="button"
                                onClick={handleSsoSignIn}
                                disabled={ssoLoading}
                                className="w-full flex items-center justify-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                            >
                                {ssoLoading ? "Redirecting…" : `Sign in with ${ssoName}`}
                            </button>
                            <div className="flex items-center gap-3 my-5">
                                <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                                <span className="text-xs text-slate-400">or</span>
                                <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                            </div>
                        </>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                            <input
                                id="login-email"
                                type="email"
                                required
                                autoComplete="email"
                                placeholder="you@yourcompany.com"
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 bg-white text-sm"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">Password</label>
                                <Link href="/forgot" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Forgot password?</Link>
                            </div>
                            <div className="relative">
                                <input
                                    id="login-password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    className="w-full px-4 py-2.5 pr-11 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 bg-white text-sm"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    aria-pressed={showPassword}
                                    tabIndex={-1}
                                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    {showPassword ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                        {totpRequired && (
                            <div>
                                <label htmlFor="login-totp" className="block text-sm font-medium text-slate-700 mb-1.5">Authentication Code</label>
                                <input
                                    ref={totpInputRef}
                                    id="login-totp"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    required
                                    placeholder="123456"
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 bg-white text-sm font-mono tracking-widest"
                                    value={totp}
                                    onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                />
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors mt-2 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

                    <p className="text-center text-xs text-slate-400 mt-8">
                        <Link href="/" className="hover:text-slate-600 transition-colors">← Back to Pulse</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}
