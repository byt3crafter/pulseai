"use client";

import { useState, useTransition } from "react";
import { saveRoiMinutesAction } from "./actions";

/**
 * The ROI assumption control. "Hours/money saved" are estimates built on this
 * number, so it's editable right where it's used — the customer owns it.
 */
export default function AssumptionsBar({ minutesPerTask }: { minutesPerTask: number }) {
    const [value, setValue] = useState(String(minutesPerTask));
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<string | null>(null);

    function save() {
        setMsg(null);
        startTransition(async () => {
            const res = await saveRoiMinutesAction(Number(value));
            setMsg(res.success ? "Saved" : res.message);
        });
    }

    return (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-pulse-border-subtle bg-pulse-panel-alt/50 px-4 py-3 text-sm">
            <span className="text-pulse-muted">Assume each completed task saves</span>
            <input
                type="number"
                min={0}
                max={480}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-20 rounded-lg border border-pulse-border bg-pulse-panel px-2 py-1 text-center tabular-nums text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-pulse-muted">minutes of human work. Money saved uses each agent's hourly value.</span>
            <button
                type="button"
                onClick={save}
                disabled={pending || value === String(minutesPerTask)}
                className="rounded-lg bg-pulse-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-pulse-accent-hi disabled:opacity-50"
            >
                {pending ? "Saving…" : "Apply"}
            </button>
            {msg && <span className="text-xs text-pulse-muted">{msg}</span>}
        </div>
    );
}
