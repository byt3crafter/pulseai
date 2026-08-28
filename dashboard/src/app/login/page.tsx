"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { preAuthCheck } from "../account/two-factor/actions";
import { useBranding, accentStyle } from "../../utils/use-branding";

function LoginForm() {
    const searchParams = useSearchParams();
    const message = searchParams.get("message");
    const branding = useBranding();

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
        /*
         * A single centred card — the shape Clerk uses for hosted sign-in.
         *
         * This replaced a split marketing panel whose form was hardcoded LIGHT
         * (bg-slate-50, text-slate-900), so the login ignored the theme
         * entirely: a workspace on dark mode still got a white form. It also
         * carried a fixed company name in the footer, which is the wrong name
         * to show on a white-labelled deployment.
         *
         * Everything here is on --pulse-* tokens, so it follows both the theme
         * and per-tenant branding.
         */
        <div className="flex min-h-screen items-center justify-center bg-pulse-bg p-4" style={accentStyle(branding?.accent)}>
            <div className="w-full max-w-[400px]">
                <Link href="/" className="mb-7 flex items-center justify-center gap-2.5">
                    {branding?.logoDataUrl ? (
                        <img src={branding.logoDataUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
                    ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pulse-accent">
                            <BoltMark className="h-4 w-4 text-white" />
                        </span>
                    )}
                    <span className="text-[17px] font-bold tracking-[-0.01em] text-pulse-text">{branding?.productName ?? "Pulse AI"}</span>
                </Link>

                <div className="rounded-2xl border border-pulse-border bg-pulse-panel px-7 py-8 shadow-xl shadow-black/25 sm:px-8">
                    <div className="mb-6 text-center">
                        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-pulse-text">Welcome back</h1>
                        <p className="mt-1.5 text-[13.5px] text-pulse-muted">Sign in to continue to {branding?.productName ?? "your workspace"}</p>
                    </div>

                    {info && (
                        <div role="status" className="mb-5 rounded-lg border border-pulse-border bg-pulse-panel-alt p-3 text-[13px] text-pulse-soft">{info}</div>
                    )}
                    {error && (
                        <div role="alert" className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-400">{error}</div>
                    )}

                    {ssoEnabled && (
                        <>
                            <button
                                type="button"
                                onClick={handleSsoSignIn}
                                disabled={ssoLoading}
                                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-pulse-border bg-pulse-panel-alt py-2.5 text-[13.5px] font-medium text-pulse-text transition-colors hover:bg-pulse-hover disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {ssoLoading ? "Redirecting…" : `Sign in with ${ssoName}`}
                            </button>
                            <div className="my-5 flex items-center gap-3">
                                <span className="h-px flex-1 bg-pulse-border-subtle" aria-hidden="true" />
                                <span className="text-[11px] uppercase tracking-wider text-pulse-faint">or</span>
                                <span className="h-px flex-1 bg-pulse-border-subtle" aria-hidden="true" />
                            </div>
                        </>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-medium text-pulse-soft">Email address</label>
                            <input
                                id="login-email"
                                type="email"
                                required
                                autoComplete="email"
                                placeholder="you@company.com"
                                className="w-full rounded-lg border border-pulse-border bg-pulse-bg px-3 py-2.5 text-sm text-pulse-text placeholder:text-pulse-faint outline-none transition-shadow focus:border-pulse-accent focus:ring-2 focus:ring-pulse-accent/30"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <label htmlFor="login-password" className="block text-[13px] font-medium text-pulse-soft">Password</label>
                                <Link href="/forgot" className="text-[12.5px] font-medium text-pulse-accent hover:underline">Forgot password?</Link>
                            </div>
                            <div className="relative">
                                <input
                                    id="login-password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    className="w-full rounded-lg border border-pulse-border bg-pulse-bg px-3 py-2.5 pr-11 text-sm text-pulse-text placeholder:text-pulse-faint outline-none transition-shadow focus:border-pulse-accent focus:ring-2 focus:ring-pulse-accent/30"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    aria-pressed={showPassword}
                                    tabIndex={-1}
                                    className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-pulse-faint transition-colors hover:text-pulse-text"
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
                                <label htmlFor="login-totp" className="mb-1.5 block text-[13px] font-medium text-pulse-soft">Authentication code</label>
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
                                    className="w-full rounded-lg border border-pulse-border bg-pulse-bg px-3 py-2.5 font-mono text-sm tracking-widest text-pulse-text placeholder:text-pulse-faint outline-none transition-shadow focus:border-pulse-accent focus:ring-2 focus:ring-pulse-accent/30"
                                    value={totp}
                                    onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                />
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-pulse-accent py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-pulse-accent-hi disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loading ? (
                                <>
                                    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Signing in…
                                </>
                            ) : (
                                <>
                                    Sign in
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                                        <path fillRule="evenodd" d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <p className="mt-5 text-center text-[12px] text-pulse-faint">
                    <Link href="/" className="transition-colors hover:text-pulse-muted">← Back to {branding?.productName ?? "Pulse"}</Link>
                </p>
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
