"use client";

import { useEffect, useState } from "react";
import type { AdminStatus } from "../../app/admin/overview-data";

/**
 * Terminal-style status footer with a live UTC clock — the console's signature.
 * Fixed to the bottom of the admin shell. Indicators are fed from the server;
 * the clock ticks client-side (starts blank to avoid hydration mismatch).
 */

function dotColor(state: "operational" | "degraded" | "unknown") {
    if (state === "operational") return "bg-pulse-profit";
    if (state === "degraded") return "bg-pulse-accent";
    return "bg-pulse-faint";
}

function Indicator({ label, state }: { label: string; state: "operational" | "degraded" | "unknown" }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor(state)}`} aria-hidden="true" />
            <span className="text-pulse-muted">{label}</span>
            <span className={state === "operational" ? "text-pulse-profit" : state === "degraded" ? "text-pulse-accent" : "text-pulse-faint"}>
                {state === "operational" ? "OK" : state === "degraded" ? "DEGRADED" : "—"}
            </span>
        </span>
    );
}

export default function StatusBar({ status }: { status: AdminStatus }) {
    const [clock, setClock] = useState<string>("--:--:--");

    useEffect(() => {
        const tick = () => {
            const d = new Date();
            const p = (n: number) => String(n).padStart(2, "0");
            setClock(`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <footer className="h-7 flex-shrink-0 border-t border-pulse-border bg-pulse-panel px-4 flex items-center gap-5 text-[11px] tracking-wide text-pulse-muted font-sans select-none">
            <span className="text-pulse-faint">[SYS]</span>
            <Indicator label="GATEWAY" state={status.gateway} />
            <Indicator label="DB" state={status.db} />
            <span className="hidden sm:inline">
                TENANTS <span className="text-pulse-text">{status.tenants}</span>
            </span>
            <span className="hidden sm:inline">
                MSGS/24H <span className="text-pulse-text">{status.messages24h.toLocaleString()}</span>
            </span>
            <span className="ml-auto flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-pulse-profit motion-safe:animate-pulse" aria-hidden="true" />
                <span className="text-pulse-faint">UTC</span>
                <span className="text-pulse-text tabular-nums">{clock}</span>
            </span>
        </footer>
    );
}
