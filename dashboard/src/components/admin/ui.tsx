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
        "inline-flex items-center justify-center gap-1.5 bg-[#8B5CF6] hover:bg-[#A78BFA] text-white text-[13px] font-medium px-3.5 py-2 rounded-md transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#8B5CF6] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0A0A0B] disabled:opacity-50 disabled:cursor-not-allowed",
    btnSecondary:
        "inline-flex items-center justify-center gap-1.5 border border-[#242429] text-[#EDEDED] hover:bg-[#141417] text-[13px] font-medium px-3.5 py-2 rounded-md transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#8B5CF6]",
    btnDanger:
        "inline-flex items-center justify-center gap-1.5 border border-[#F0503C]/40 text-[#F0503C] hover:bg-[#F0503C]/10 text-[13px] font-medium px-3.5 py-2 rounded-md transition-colors",
    btnGhost:
        "text-[13px] font-medium text-[#8B5CF6] hover:text-[#A78BFA] transition-colors focus-visible:outline-none",

    // Form controls
    label: "block text-[13px] font-medium text-[#B5B5BA] mb-1.5",
    input:
        "w-full bg-[#101012] border border-[#242429] rounded-md text-[13px] text-[#EDEDED] placeholder:text-[#5A5A61] px-3 py-2 outline-none focus:ring-1 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-colors",

    // Tables
    table: "w-full text-[13px]",
    th: "text-left font-medium text-[11px] uppercase tracking-[0.08em] text-[#5A5A61] px-4 py-2.5 whitespace-nowrap",
    thRight: "text-right font-medium text-[11px] uppercase tracking-[0.08em] text-[#5A5A61] px-4 py-2.5 whitespace-nowrap",
    td: "px-4 py-3 text-[13px] text-[#EDEDED] align-middle",
    tdRight: "px-4 py-3 text-[13px] text-[#EDEDED] text-right tabular-nums align-middle",
    tdMuted: "px-4 py-3 text-[13px] text-[#8A8A90] align-middle",
    row: "border-t border-[#1C1C1F] hover:bg-[#101012] transition-colors motion-reduce:transition-none",

    // Text scale
    labelMicro: "text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]",
    metaMicro: "text-[11px] uppercase tracking-[0.08em] text-[#5A5A61]",
    textPrimary: "text-[#EDEDED]",
    textSecondary: "text-[#8A8A90]",
    textFaint: "text-[#5A5A61]",
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
                <h1 className="text-lg font-semibold text-[#EDEDED] tracking-tight">{title}</h1>
                {subtitle && <p className="text-[13px] text-[#8A8A90] mt-1">{subtitle}</p>}
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
        <div className={`border border-[#242429] bg-[#0C0C0E] rounded-lg overflow-hidden ${className}`}>
            {hasHeader && (
                <div className="px-4 py-3 border-b border-[#242429] flex items-center justify-between gap-2">
                    {label && <span className="text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]">{label}</span>}
                    {(meta || right) && (
                        <span className="text-[11px] uppercase tracking-[0.08em] text-[#5A5A61] flex items-center gap-2">
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
        success: "bg-[#3FB950]/10 text-[#3FB950] border-[#3FB950]/30",
        danger: "bg-[#F0503C]/10 text-[#F0503C] border-[#F0503C]/30",
        warn: "bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/30",
        accent: "bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/30",
        neutral: "bg-[#141417] text-[#8A8A90] border-[#242429]",
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
        success: "bg-[#3FB950]",
        danger: "bg-[#F0503C]",
        warn: "bg-[#8B5CF6]",
        accent: "bg-[#8B5CF6]",
        neutral: "bg-[#5A5A61]",
    };
    return (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-[#EDEDED]">
            <span className={`w-1.5 h-1.5 rounded-full ${dot[variant]}`} aria-hidden="true" />
            {children}
        </span>
    );
}

export { Link };
