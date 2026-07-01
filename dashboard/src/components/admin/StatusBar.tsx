"use client";

import { useEffect, useState } from "react";
import type { AdminStatus } from "../../app/admin/overview-data";

/**
 * Terminal-style status footer with a live UTC clock — the console's signature.
 * Fixed to the bottom of the admin shell. Indicators are fed from the server;
 * the clock ticks client-side (starts blank to avoid hydration mismatch).
 */

function dotColor(state: "operational" | "degraded" | "unknown") {
    if (state === "operational") return "bg-[#3FB950]";
    if (state === "degraded") return "bg-[#8B5CF6]";
    return "bg-[#5A5A61]";
}

function Indicator({ label, state }: { label: string; state: "operational" | "degraded" | "unknown" }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor(state)}`} aria-hidden="true" />
            <span className="text-[#8A8A90]">{label}</span>
            <span className={state === "operational" ? "text-[#3FB950]" : state === "degraded" ? "text-[#8B5CF6]" : "text-[#5A5A61]"}>
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
        <footer className="h-7 flex-shrink-0 border-t border-[#242429] bg-[#0C0C0E] px-4 flex items-center gap-5 text-[11px] tracking-wide text-[#8A8A90] font-sans select-none">
            <span className="text-[#5A5A61]">[SYS]</span>
            <Indicator label="GATEWAY" state={status.gateway} />
            <Indicator label="DB" state={status.db} />
            <span className="hidden sm:inline">
                TENANTS <span className="text-[#EDEDED]">{status.tenants}</span>
            </span>
            <span className="hidden sm:inline">
                MSGS/24H <span className="text-[#EDEDED]">{status.messages24h.toLocaleString()}</span>
            </span>
            <span className="ml-auto flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950] motion-safe:animate-pulse" aria-hidden="true" />
                <span className="text-[#5A5A61]">UTC</span>
                <span className="text-[#EDEDED] tabular-nums">{clock}</span>
            </span>
        </footer>
    );
}
