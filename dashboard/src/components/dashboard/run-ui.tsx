import type { ReactNode } from "react";

/** Colour tone per run status, using the app's status-chip convention. */
const STATUS_STYLE: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    running: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    failed: "bg-red-500/10 text-red-500 border-red-500/30",
    cancelled: "bg-pulse-panel-alt text-pulse-muted border-pulse-border",
    queued: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    waiting: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    blocked: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    retrying: "bg-amber-500/10 text-amber-500 border-amber-500/30",
};

export function RunStatusBadge({ status }: { status: string }) {
    const cls = STATUS_STYLE[status] ?? "bg-pulse-panel-alt text-pulse-muted border-pulse-border";
    return (
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>
            {status === "running" && (
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            )}
            {status}
        </span>
    );
}

const TRIGGER_LABEL: Record<string, string> = {
    chat: "Chat", api: "API", cron: "Scheduled", heartbeat: "Heartbeat",
    commitment: "Follow-up", standing_order: "Standing order",
    delegation: "Delegated", approval: "Approval", channel: "Channel",
};

export function triggerLabel(trigger: string): string {
    return TRIGGER_LABEL[trigger] ?? trigger;
}

/** Human duration: 820ms, 4.2s, 3m 12s. */
export function formatDuration(ms: number | null | undefined): string {
    if (ms == null) return "—";
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${Math.round(s - m * 60)}s`;
}

/** Relative time: "just now", "3m ago", "2h ago", else a date. */
export function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(iso).toLocaleDateString();
}

export function TokenCount({ input, output }: { input: number; output: number }): ReactNode {
    const total = input + output;
    if (total === 0) return <span className="text-pulse-faint">—</span>;
    return <span className="tabular-nums">{total.toLocaleString()}</span>;
}
