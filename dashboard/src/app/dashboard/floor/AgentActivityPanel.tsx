"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAgentActivityAction, type AgentActivityDetail } from "./actions";

/** "3m ago", "2h ago", "in 15m" — short enough to sit in a dense list. */
function rel(ms: number | null): string {
    if (!ms) return "—";
    const diff = ms - Date.now();
    const ahead = diff > 0;
    const mins = Math.round(Math.abs(diff) / 60000);
    const body = mins < 1 ? "now" : mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
    if (body === "now") return "just now";
    return ahead ? `in ${body}` : `${body} ago`;
}

/** Plain words for a trigger — "cron" means nothing to someone reading this. */
const TRIGGER_LABEL: Record<string, string> = {
    chat: "You asked",
    api: "API",
    channel: "Department",
    cron: "Scheduled",
    heartbeat: "Routine check",
    standing_order: "Standing order",
    commitment: "Follow-up",
    delegation: "Delegated",
    approval: "Approval",
};

function StatusDot({ status }: { status: string }) {
    const cls = status === "failed" ? "bg-red-500"
        : status === "running" ? "bg-amber-500"
            : "bg-emerald-500";
    return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}

/**
 * What an agent has been doing — the past and future tense the floor itself
 * deliberately leaves out. Loaded on demand when a desk is clicked.
 */
export default function AgentActivityPanel({ agentId, agentName }: { agentId: string; agentName: string }) {
    const [data, setData] = useState<AgentActivityDetail | null>(null);
    const [tab, setTab] = useState<"runs" | "jobs" | "followups">("runs");

    useEffect(() => {
        let cancelled = false;
        setData(null);
        void getAgentActivityAction(agentId).then((d) => { if (!cancelled) setData(d); });
        return () => { cancelled = true; };
    }, [agentId]);

    if (!data) {
        return <p className="px-1 py-3 text-xs text-pulse-faint">Loading {agentName}&rsquo;s activity…</p>;
    }

    const brokenJobs = data.jobs.filter((j) => j.lastStatus === "failed");

    const TABS = [
        { id: "runs" as const, label: "Recent work", count: data.recentRuns.length },
        { id: "jobs" as const, label: "Scheduled", count: data.jobs.length },
        { id: "followups" as const, label: "Follow-ups", count: data.commitments.filter((c) => c.status === "pending").length },
    ];

    return (
        <div className="mt-3 border-t border-pulse-border-subtle pt-3">
            {brokenJobs.length > 0 && (
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    <strong>{brokenJobs.length}</strong>{" "}
                    {brokenJobs.length === 1 ? "scheduled job is" : "scheduled jobs are"} failing —{" "}
                    {brokenJobs[0].lastError || "no error recorded"}
                </div>
            )}

            <div className="mb-2 flex gap-1">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                            tab === t.id
                                ? "bg-pulse-tint text-pulse-accent-hi"
                                : "text-pulse-muted hover:bg-pulse-hover"
                        }`}
                    >
                        {t.label} <span className="text-pulse-faint">{t.count}</span>
                    </button>
                ))}
            </div>

            <div className="max-h-56 overflow-y-auto pr-1">
                {tab === "runs" && (
                    data.recentRuns.length === 0
                        ? <p className="py-2 text-xs text-pulse-faint">Nothing yet.</p>
                        : <ul className="space-y-1">
                            {data.recentRuns.map((r) => (
                                <li key={r.id} className="flex items-start gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-pulse-hover">
                                    <span className="mt-1.5"><StatusDot status={r.status} /></span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-pulse-text-soft">
                                            {r.title || TRIGGER_LABEL[r.trigger] || r.trigger}
                                        </span>
                                        {r.error && <span className="block truncate text-red-400">{r.error}</span>}
                                    </span>
                                    <span className="shrink-0 text-pulse-faint">{TRIGGER_LABEL[r.trigger] || r.trigger}</span>
                                    <span className="w-14 shrink-0 text-right text-pulse-faint">{rel(r.at)}</span>
                                </li>
                            ))}
                        </ul>
                )}

                {tab === "jobs" && (
                    data.jobs.length === 0
                        ? <p className="py-2 text-xs text-pulse-faint">
                            No scheduled work.{" "}
                            <Link href="/dashboard/tasks" className="text-pulse-accent hover:underline">Schedule something →</Link>
                        </p>
                        : <ul className="space-y-1">
                            {data.jobs.map((j) => (
                                <li key={j.id} className="flex items-start gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-pulse-hover">
                                    <span className="mt-1.5"><StatusDot status={j.lastStatus ?? (j.enabled ? "completed" : "paused")} /></span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-pulse-text-soft">{j.name}</span>
                                        <span className="block truncate text-pulse-faint">
                                            {j.schedule}{!j.enabled && " · paused"}
                                        </span>
                                        {j.lastError && <span className="block truncate text-red-400">{j.lastError}</span>}
                                    </span>
                                    <span className="w-20 shrink-0 text-right text-pulse-faint">
                                        {j.nextRunAt ? rel(j.nextRunAt) : `ran ${rel(j.lastRunAt)}`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                )}

                {tab === "followups" && (
                    data.commitments.length === 0
                        ? <p className="py-2 text-xs text-pulse-faint">Nothing promised.</p>
                        : <ul className="space-y-1">
                            {data.commitments.map((c) => (
                                <li key={c.id} className="flex items-start gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-pulse-hover">
                                    <span className="mt-1.5"><StatusDot status={c.status === "pending" ? "running" : "completed"} /></span>
                                    <span className="min-w-0 flex-1 truncate text-pulse-text-soft">{c.summary}</span>
                                    <span className="shrink-0 text-pulse-faint">{c.status}</span>
                                    <span className="w-16 shrink-0 text-right text-pulse-faint">{rel(c.dueAt)}</span>
                                </li>
                            ))}
                        </ul>
                )}
            </div>
        </div>
    );
}
