"use client";

import { useState, useTransition } from "react";
import { changeMyPassword } from "../app/account/two-factor/actions";

type Variant = "light" | "pulse";

const V = {
    card: {
        light: "bg-white border-slate-200",
        pulse: "bg-pulse-panel border-pulse-border",
    },
    title: { light: "text-slate-900", pulse: "text-pulse-text" },
    sub: { light: "text-slate-500", pulse: "text-pulse-muted" },
    label: { light: "text-slate-700", pulse: "text-pulse-text-soft" },
    input: {
        light: "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500",
        pulse: "w-full px-3 py-2 border border-pulse-border rounded-md text-[13px] text-pulse-text bg-pulse-panel-alt outline-none focus:ring-1 focus:ring-pulse-accent focus:border-pulse-accent",
    },
    btn: {
        light: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50",
        pulse: "bg-pulse-accent hover:bg-pulse-accent-hi text-white text-[13px] font-medium px-3.5 py-2 rounded-md transition-colors disabled:opacity-50",
    },
} as const;

export default function ChangePasswordCard({ variant = "light" }: { variant?: Variant }) {
    const v = <K extends keyof typeof V>(k: K) => V[k][variant];
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
    const [pending, start] = useTransition();

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setMsg(null);
        if (next !== confirm) {
            setMsg({ type: "err", text: "New passwords do not match." });
            return;
        }
        start(async () => {
            const res = await changeMyPassword(current, next);
            if (res.success) {
                setMsg({ type: "ok", text: "Password changed." });
                setCurrent(""); setNext(""); setConfirm("");
            } else {
                setMsg({ type: "err", text: res.message || "Failed to change password." });
            }
        });
    };

    return (
        <div className={`rounded-lg border p-5 ${v("card")}`}>
            <h3 className={`text-sm font-semibold ${v("title")}`}>Change Password</h3>
            <p className={`text-[13px] mt-0.5 ${v("sub")}`}>Update the password for your own account.</p>

            {msg && (
                <p className={`text-[13px] mt-3 ${msg.type === "ok" ? "text-pulse-profit" : "text-pulse-loss"}`} role="status">
                    {msg.text}
                </p>
            )}

            <form onSubmit={submit} className="mt-4 space-y-3 max-w-sm">
                <div>
                    <label className={`block text-[13px] font-medium mb-1.5 ${v("label")}`}>Current password</label>
                    <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={v("input")} />
                </div>
                <div>
                    <label className={`block text-[13px] font-medium mb-1.5 ${v("label")}`}>New password</label>
                    <input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={v("input")} />
                </div>
                <div>
                    <label className={`block text-[13px] font-medium mb-1.5 ${v("label")}`}>Confirm new password</label>
                    <input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={v("input")} />
                </div>
                <button type="submit" disabled={pending} className={v("btn")}>
                    {pending ? "Saving…" : "Change password"}
                </button>
            </form>
        </div>
    );
}
