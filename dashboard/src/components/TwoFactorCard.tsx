"use client";

import { useState, useEffect, useId } from "react";
import {
    getTwoFactorStatus,
    startTwoFactorSetup,
    confirmTwoFactor,
    disableTwoFactor,
} from "../app/account/two-factor/actions";

type Variant = "light" | "pulse";

interface TwoFactorCardProps {
    variant?: Variant;
}

type Phase = "loading" | "disabled" | "setup" | "enabled" | "disabling";

// Per-variant class sets — "pulse" uses the theme-aware admin token layer,
// "light" uses the tenant-side slate/indigo palette. Mirrors the pattern in
// SidebarUserMenu.tsx.
const V = {
    card: {
        light: "bg-white border-slate-200",
        pulse: "bg-pulse-panel border-pulse-border",
    },
    title: { light: "text-slate-900", pulse: "text-pulse-text" },
    desc: { light: "text-slate-500", pulse: "text-pulse-muted" },
    label: { light: "text-slate-700", pulse: "text-pulse-text-soft" },
    input: {
        light: "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-indigo-500 focus:border-indigo-500",
        pulse: "border-pulse-border bg-pulse-panel-alt text-pulse-text placeholder:text-pulse-faint focus:ring-pulse-accent focus:border-pulse-accent",
    },
    btnPrimary: {
        light: "bg-indigo-600 hover:bg-indigo-700 text-white",
        pulse: "bg-pulse-accent hover:bg-pulse-accent-hi text-white",
    },
    btnSecondary: {
        light: "border border-slate-300 text-slate-700 hover:bg-slate-50",
        pulse: "border border-pulse-border text-pulse-text hover:bg-pulse-hover",
    },
    btnDanger: {
        light: "border border-red-200 text-red-600 hover:bg-red-50",
        pulse: "border border-pulse-loss/40 text-pulse-loss hover:bg-pulse-loss/10",
    },
    successBox: {
        light: "bg-emerald-50 border-emerald-200",
        pulse: "bg-pulse-profit/10 border-pulse-profit/30",
    },
    successDot: { light: "bg-emerald-400", pulse: "bg-pulse-profit" },
    successText: { light: "text-emerald-800", pulse: "text-pulse-profit" },
    successSub: { light: "text-emerald-600", pulse: "text-pulse-profit/80" },
    errorText: { light: "text-red-600", pulse: "text-pulse-loss" },
    infoText: { light: "text-slate-500", pulse: "text-pulse-muted" },
    mono: {
        light: "bg-slate-50 border-slate-200 text-slate-700",
        pulse: "bg-pulse-panel-alt border-pulse-border text-pulse-text",
    },
    divider: { light: "border-slate-100", pulse: "border-pulse-border" },
    ring: { light: "focus-visible:ring-indigo-500", pulse: "focus-visible:ring-pulse-accent" },
} as const;

export default function TwoFactorCard({ variant = "light" }: TwoFactorCardProps) {
    const v = <K extends keyof typeof V>(k: K) => V[k][variant];
    const uid = useId();

    const [phase, setPhase] = useState<Phase>("loading");
    const [secret, setSecret] = useState<string>("");
    const [qr, setQr] = useState<string>("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getTwoFactorStatus()
            .then((res) => {
                if (cancelled) return;
                setPhase(res.enabled ? "enabled" : "disabled");
            })
            .catch(() => {
                if (!cancelled) setPhase("disabled");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const resetMessages = () => {
        setError("");
        setNotice("");
    };

    const handleStartSetup = async () => {
        resetMessages();
        setBusy(true);
        const result = await startTwoFactorSetup();
        setBusy(false);
        if (result.success && result.qr && result.secret) {
            setQr(result.qr);
            setSecret(result.secret);
            setCode("");
            setPhase("setup");
        } else {
            setError(result.message || "Failed to start setup. Try again.");
        }
    };

    const handleCancelSetup = () => {
        resetMessages();
        setQr("");
        setSecret("");
        setCode("");
        setPhase("disabled");
    };

    const handleConfirm = async () => {
        if (!code.trim()) {
            setError("Enter the 6-digit code from your authenticator app.");
            return;
        }
        resetMessages();
        setBusy(true);
        const result = await confirmTwoFactor(code.trim());
        setBusy(false);
        if (result.success) {
            setQr("");
            setSecret("");
            setCode("");
            setPhase("enabled");
            setNotice("Two-factor authentication is now enabled.");
        } else {
            setError(result.message || "Invalid code. Try again.");
        }
    };

    const handleStartDisable = () => {
        resetMessages();
        setCode("");
        setPhase("disabling");
    };

    const handleCancelDisable = () => {
        resetMessages();
        setCode("");
        setPhase("enabled");
    };

    const handleDisable = async () => {
        if (!code.trim()) {
            setError("Enter your current 6-digit code to confirm.");
            return;
        }
        resetMessages();
        setBusy(true);
        const result = await disableTwoFactor(code.trim());
        setBusy(false);
        if (result.success) {
            setCode("");
            setPhase("disabled");
            setNotice("Two-factor authentication has been disabled.");
        } else {
            setError(result.message || "Invalid code. Try again.");
        }
    };

    const handleCopySecret = async () => {
        if (!secret) return;
        try {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard unavailable — ignore */
        }
    };

    return (
        <div className={`rounded-xl border p-5 ${v("card")}`}>
            <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                    <h3 className={`text-sm font-semibold ${v("title")}`}>Two-Factor Authentication</h3>
                    <p className={`text-xs mt-0.5 ${v("desc")}`}>
                        Add an extra layer of security to your account with an authenticator app.
                    </p>
                </div>
            </div>

            {phase === "loading" && (
                <p className={`text-xs mt-4 ${v("infoText")}`}>Checking status…</p>
            )}

            {phase === "disabled" && (
                <div className="mt-4">
                    {notice && (
                        <p role="status" className={`text-xs mb-3 ${v("successSub")}`}>{notice}</p>
                    )}
                    <button
                        type="button"
                        onClick={handleStartSetup}
                        disabled={busy}
                        className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${v("btnPrimary")} ${v("ring")}`}
                    >
                        {busy ? "Starting…" : "Enable Two-Factor Authentication"}
                    </button>
                    {error && (
                        <p role="alert" className={`text-xs mt-2 ${v("errorText")}`}>{error}</p>
                    )}
                </div>
            )}

            {phase === "setup" && (
                <div className="mt-4 space-y-4">
                    <p className={`text-xs ${v("desc")}`}>
                        Scan the QR code with your authenticator app (e.g. Google Authenticator, 1Password, Authy),
                        or enter the setup key manually.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 items-start">
                        {qr && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={qr}
                                alt="QR code to scan with your authenticator app"
                                width={168}
                                height={168}
                                className={`rounded-lg border p-2 bg-white ${variant === "pulse" ? "border-pulse-border" : "border-slate-200"}`}
                            />
                        )}
                        <div className="flex-1 min-w-0 w-full">
                            <label htmlFor={`${uid}-secret`} className={`block text-xs font-medium mb-1.5 ${v("label")}`}>
                                Manual entry key
                            </label>
                            <div className="flex gap-2">
                                <code
                                    id={`${uid}-secret`}
                                    className={`flex-1 min-w-0 text-xs font-mono px-3 py-2 rounded-lg border break-all ${v("mono")}`}
                                >
                                    {secret}
                                </code>
                                <button
                                    type="button"
                                    onClick={handleCopySecret}
                                    className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 ${v("btnSecondary")} ${v("ring")}`}
                                >
                                    {copied ? "Copied" : "Copy"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={`pt-3 border-t ${v("divider")}`}>
                        <label htmlFor={`${uid}-confirm-code`} className={`block text-xs font-medium mb-1.5 ${v("label")}`}>
                            6-digit code from your app
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2 max-w-xs">
                            <input
                                id={`${uid}-confirm-code`}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                pattern="[0-9]*"
                                maxLength={6}
                                placeholder="123456"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-mono outline-none focus:ring-2 transition-all ${v("input")}`}
                            />
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                            <button
                                type="button"
                                onClick={handleConfirm}
                                disabled={busy}
                                className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${v("btnPrimary")} ${v("ring")}`}
                            >
                                {busy ? "Verifying…" : "Verify & Enable"}
                            </button>
                            <button
                                type="button"
                                onClick={handleCancelSetup}
                                disabled={busy}
                                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 ${v("btnSecondary")} ${v("ring")}`}
                            >
                                Cancel
                            </button>
                        </div>
                        {error && (
                            <p role="alert" className={`text-xs mt-2 ${v("errorText")}`}>{error}</p>
                        )}
                    </div>
                </div>
            )}

            {(phase === "enabled" || phase === "disabling") && (
                <div className="mt-4">
                    <div className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 ${v("successBox")}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${v("successDot")}`} aria-hidden="true" />
                        <p className={`text-sm font-medium ${v("successText")}`}>Two-factor authentication is on</p>
                    </div>

                    {notice && phase === "enabled" && (
                        <p role="status" className={`text-xs mt-2 ${v("successSub")}`}>{notice}</p>
                    )}

                    {phase === "enabled" && (
                        <button
                            type="button"
                            onClick={handleStartDisable}
                            className={`mt-3 text-sm font-medium px-4 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 ${v("btnDanger")} ${v("ring")}`}
                        >
                            Disable
                        </button>
                    )}

                    {phase === "disabling" && (
                        <div className={`mt-3 pt-3 border-t ${v("divider")}`}>
                            <label htmlFor={`${uid}-disable-code`} className={`block text-xs font-medium mb-1.5 ${v("label")}`}>
                                Enter your current 6-digit code to confirm
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2 max-w-xs">
                                <input
                                    id={`${uid}-disable-code`}
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    placeholder="123456"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-mono outline-none focus:ring-2 transition-all ${v("input")}`}
                                />
                            </div>
                            <div className="flex items-center gap-2 mt-3">
                                <button
                                    type="button"
                                    onClick={handleDisable}
                                    disabled={busy}
                                    className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${v("btnDanger")} ${v("ring")}`}
                                >
                                    {busy ? "Disabling…" : "Confirm Disable"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCancelDisable}
                                    disabled={busy}
                                    className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 ${v("btnSecondary")} ${v("ring")}`}
                                >
                                    Cancel
                                </button>
                            </div>
                            {error && (
                                <p role="alert" className={`text-xs mt-2 ${v("errorText")}`}>{error}</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
