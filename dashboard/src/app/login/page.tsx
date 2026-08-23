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

    const BoltMark = ({ className }: { className?: string }) => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M13.5 2 4.5 13.2c-.4.5-.05 1.3.6 1.3H11l-1.4 7.1c-.1.7.8 1.1 1.2.5l9-11.2c.4-.5.05-1.3-.6-1.3H13l1.7-6.6c.2-.7-.7-1.1-1.2-.5Z" />
        </svg>
    );

    return (
        <div className="relative min-h-screen w-full overflow-hidden bg-[#070711] lg:grid lg:grid-cols-[1.05fr_1fr]">
            {/* ── Left: brand stage (lg+) ─────────────────────────────── */}
            <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">
                {/* layered background */}
                <div
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{ background: "radial-gradient(120% 120% at 15% 10%, #1e1b4b 0%, #0b0b1c 45%, #070711 100%)" }}
                />
                <div
                    aria-hidden="true"
                    className="absolute -left-24 top-1/3 h-[32rem] w-[32rem] rounded-full opacity-60 blur-3xl"
                    style={{ background: "radial-gradient(circle, rgba(99,102,241,0.55) 0%, rgba(139,92,246,0.18) 45%, transparent 70%)" }}
                />
                <div
                    aria-hidden="true"
                    className="absolute -bottom-32 right-0 h-[26rem] w-[26rem] rounded-full opacity-40 blur-3xl"
                    style={{ background: "radial-gradient(circle, rgba(56,189,248,0.35) 0%, transparent 70%)" }}
                />
                <div
                    aria-hidden="true"
                    className="absolute inset-0 opacity-[0.14]"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
                        backgroundSize: "56px 56px",
                        maskImage: "radial-gradient(120% 90% at 20% 20%, black 0%, transparent 75%)",
                        WebkitMaskImage: "radial-gradient(120% 90% at 20% 20%, black 0%, transparent 75%)",
                    }}
                />

                {/* content */}
                <Link href="/" className="relative z-10 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 shadow-lg shadow-indigo-900/40">
                        <BoltMark className="h-5 w-5 text-white" />
                    </span>
                    <span className="text-lg font-semibold tracking-tight text-white">Pulse</span>
                </Link>

                <div className="relative z-10 max-w-md">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-indigo-200 backdrop-blur">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> AI Workforce Platform
                    </span>
                    <h2 className="mt-6 text-[2.6rem] font-bold leading-[1.08] tracking-tight text-white">
                        Your AI workforce,
                        <br />
                        <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-sky-300 bg-clip-text text-transparent">ready to work.</span>
                    </h2>
                    <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-slate-400">
                        Sign in to orchestrate your agents, departments, and connected tools — all from one workspace.
                    </p>

                    <ul className="mt-9 space-y-4">
                        {[
                            "Purpose-built AI agents for every team",
                            "Departments that route work automatically",
                            "Secure, tenant-isolated by design",
                        ].map((line) => (
                            <li key={line} className="flex items-center gap-3 text-sm text-slate-300">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/30">
                                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-indigo-300">
                                        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.1 3.1 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                                    </svg>
                                </span>
                                {line}
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative z-10 text-xs text-slate-600">© {new Date().getFullYear()} Runstate Ltd</p>
            </div>

            {/* ── Right: form ─────────────────────────────────────────── */}
            <div className="relative z-10 flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 lg:min-h-0">
                <div className="w-full max-w-sm">
                    <div className="mb-10 flex items-center gap-2.5 lg:hidden">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 shadow-lg shadow-indigo-900/20">
                            <BoltMark className="h-5 w-5 text-white" />
                        </span>
                        <span className="text-base font-semibold text-slate-900">Pulse</span>
                    </div>

                    <h1 className="text-[1.7rem] font-bold tracking-tight text-slate-900">Welcome back</h1>
                    <p className="mt-1.5 text-sm text-slate-500">Sign in to your workspace to continue.</p>

                    {info && (
                        <div role="status" className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">{info}</div>
                    )}
                    {error && (
                        <div role="alert" className="mt-6 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</div>
                    )}

                    {ssoEnabled && (
                        <>
                            <button
                                type="button"
                                onClick={handleSsoSignIn}
                                disabled={ssoLoading}
                                className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {ssoLoading ? "Redirecting…" : `Continue with ${ssoName}`}
                            </button>
                            <div className="my-6 flex items-center gap-3">
                                <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                                <span className="text-xs font-medium text-slate-400">or</span>
                                <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                            </div>
                        </>
                    )}

                    <form onSubmit={handleSubmit} className={`space-y-4 ${ssoEnabled ? "" : "mt-7"}`}>
                        <div>
                            <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email address</label>
                            <input
                                id="login-email"
                                type="email"
                                required
                                autoComplete="email"
                                placeholder="you@yourcompany.com"
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">Password</label>
                                <Link href="/forgot" className="text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700">Forgot password?</Link>
                            </div>
                            <div className="relative">
                                <input
                                    id="login-password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    aria-pressed={showPassword}
                                    tabIndex={-1}
                                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition-colors hover:text-slate-600"
                                >
                                    {showPassword ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                        {totpRequired && (
                            <div>
                                <label htmlFor="login-totp" className="mb-1.5 block text-sm font-medium text-slate-700">Authentication code</label>
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
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center font-mono text-lg tracking-[0.5em] text-slate-900 shadow-sm outline-none transition-all placeholder:tracking-[0.5em] placeholder:text-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                                    value={totp}
                                    onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                />
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:shadow-indigo-600/30 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {loading ? (
                                <>
                                    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Signing in…
                                </>
                            ) : "Sign in"}
                        </button>
                    </form>

                    <p className="mt-8 text-center text-xs text-slate-400">
                        <Link href="/" className="transition-colors hover:text-slate-600">← Back to Pulse</Link>
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
