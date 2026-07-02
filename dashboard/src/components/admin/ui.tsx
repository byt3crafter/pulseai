import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Canonical admin UI primitives — the single source of truth for the Pulse
 * admin console. Every admin page composes these so headers, panels, tables,
 * badges, and buttons are pixel-identical across the whole console.
 * Dark surfaces, violet accent (#8B5CF6), Geist sans.
 */

export const ui = {
    // Page shell
    page: "px-6 py-6 space-y-5",

    // Buttons
    btnPrimary:
        "inline-flex items-center justify-center gap-1.5 bg-pulse-accent hover:bg-pulse-accent-hi text-white text-[13px] font-medium px-3.5 py-2 rounded-md transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pulse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-pulse-bg disabled:opacity-50 disabled:cursor-not-allowed",
    btnSecondary:
        "inline-flex items-center justify-center gap-1.5 border border-pulse-border text-pulse-text hover:bg-pulse-hover text-[13px] font-medium px-3.5 py-2 rounded-md transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pulse-accent",
    btnDanger:
        "inline-flex items-center justify-center gap-1.5 border border-pulse-loss/40 text-pulse-loss hover:bg-pulse-loss/10 text-[13px] font-medium px-3.5 py-2 rounded-md transition-colors",
    btnGhost:
        "text-[13px] font-medium text-pulse-accent hover:text-pulse-accent-hi transition-colors focus-visible:outline-none",

    // Form controls
    label: "block text-[13px] font-medium text-pulse-text-soft mb-1.5",
    input:
        "w-full bg-pulse-panel-alt border border-pulse-border rounded-md text-[13px] text-pulse-text placeholder:text-pulse-faint px-3 py-2 outline-none focus:ring-1 focus:ring-pulse-accent focus:border-pulse-accent transition-colors",

    // Tables
    table: "w-full text-[13px]",
    th: "text-left font-medium text-[11px] uppercase tracking-[0.08em] text-pulse-faint px-4 py-2.5 whitespace-nowrap",
    thRight: "text-right font-medium text-[11px] uppercase tracking-[0.08em] text-pulse-faint px-4 py-2.5 whitespace-nowrap",
    td: "px-4 py-3 text-[13px] text-pulse-text align-middle",
    tdRight: "px-4 py-3 text-[13px] text-pulse-text text-right tabular-nums align-middle",
    tdMuted: "px-4 py-3 text-[13px] text-pulse-muted align-middle",
    row: "border-t border-pulse-border-subtle hover:bg-pulse-panel-alt transition-colors motion-reduce:transition-none",

    // Text scale
    labelMicro: "text-[11px] uppercase tracking-[0.12em] text-pulse-muted",
    metaMicro: "text-[11px] uppercase tracking-[0.08em] text-pulse-faint",
    textPrimary: "text-pulse-text",
    textSecondary: "text-pulse-muted",
    textFaint: "text-pulse-faint",
};

export function PageHeader({
    title,
    subtitle,
    action,
}: {
    title: string;
    subtitle?: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <h1 className="text-lg font-semibold text-pulse-text tracking-tight">{title}</h1>
                {subtitle && <p className="text-[13px] text-pulse-muted mt-1">{subtitle}</p>}
            </div>
            {action && <div className="flex-shrink-0">{action}</div>}
        </div>
    );
}

export function Panel({
    label,
    meta,
    right,
    children,
    className = "",
    bodyClassName = "p-4",
}: {
    label?: string;
    meta?: string;
    right?: ReactNode;
    children: ReactNode;
    className?: string;
    bodyClassName?: string;
}) {
    const hasHeader = Boolean(label || meta || right);
    return (
        <div className={`border border-pulse-border-subtle bg-pulse-panel rounded-xl overflow-hidden ${className}`}>
            {hasHeader && (
                <div className="px-4 py-3 border-b border-pulse-border-subtle flex items-center justify-between gap-2">
                    {label && <span className="text-[11px] uppercase tracking-[0.12em] text-pulse-muted">{label}</span>}
                    {(meta || right) && (
                        <span className="text-[11px] uppercase tracking-[0.08em] text-pulse-faint flex items-center gap-2">
                            {meta}
                            {right}
                        </span>
                    )}
                </div>
            )}
            <div className={bodyClassName}>{children}</div>
        </div>
    );
}

type BadgeVariant = "success" | "danger" | "warn" | "neutral" | "accent";

export function Badge({ variant = "neutral", children }: { variant?: BadgeVariant; children: ReactNode }) {
    const map: Record<BadgeVariant, string> = {
        success: "bg-pulse-profit/10 text-pulse-profit border-pulse-profit/30",
        danger: "bg-pulse-loss/10 text-pulse-loss border-pulse-loss/30",
        warn: "bg-pulse-accent/10 text-pulse-accent border-pulse-accent/30",
        accent: "bg-pulse-accent/10 text-pulse-accent border-pulse-accent/30",
        neutral: "bg-pulse-hover text-pulse-muted border-pulse-border",
    };
    return (
        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${map[variant]}`}>
            {children}
        </span>
    );
}

/** A small status dot + label used in health / status contexts. */
export function StatusDot({ variant = "neutral", children }: { variant?: BadgeVariant; children?: ReactNode }) {
    const dot: Record<BadgeVariant, string> = {
        success: "bg-pulse-profit",
        danger: "bg-pulse-loss",
        warn: "bg-pulse-accent",
        accent: "bg-pulse-accent",
        neutral: "bg-pulse-faint",
    };
    return (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-pulse-text">
            <span className={`w-1.5 h-1.5 rounded-full ${dot[variant]}`} aria-hidden="true" />
            {children}
        </span>
    );
}

export { Link };
