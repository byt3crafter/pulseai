"use client";

import { useId, useState, type ReactNode } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

/**
 * Shared visual primitives for the tenant dashboard — "Clerk-grade" flat
 * cards, settings-as-rows, and a refined pill toggle. Token-based (flips
 * with `data-theme`), accessible, and tiny. Compose these instead of
 * hand-rolling bordered boxes so every page reads as one system.
 *
 * Marked "use client" so `Toggle`'s event handler is always safe to render,
 * even from a Server Component page — the presentational pieces (PageHeader,
 * Card, CardHeader, SettingRow) have no interactivity and cost nothing extra.
 */

export function PageHeader({
    title,
    description,
    action,
}: {
    title: string;
    description?: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-pulse-text tracking-tight">{title}</h1>
                {description && <p className="text-sm text-pulse-muted mt-1">{description}</p>}
            </div>
            {action && <div className="flex-shrink-0">{action}</div>}
        </div>
    );
}

/** Flat card — border only, no drop shadow. The base surface for every grouped block. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
    return (
        <div className={`bg-pulse-panel border border-pulse-border-subtle rounded-xl overflow-hidden ${className}`}>
            {children}
        </div>
    );
}

/** Intro row for the top of a Card — title + muted description. */
export function CardHeader({
    title,
    description,
    action,
}: {
    title: string;
    description?: string;
    action?: ReactNode;
}) {
    return (
        <div className="px-5 py-4 border-b border-pulse-border-subtle flex items-center justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-sm font-semibold text-pulse-text">{title}</h2>
                {description && <p className="text-xs text-pulse-muted mt-0.5">{description}</p>}
            </div>
            {action && <div className="flex-shrink-0">{action}</div>}
        </div>
    );
}

/**
 * The key Clerk pattern: a title + description on the left, a control on the
 * right. Stack several inside one Card wrapped in a `divide-y
 * divide-pulse-border-subtle` container to get a divided settings list —
 * Tailwind's `divide-y` puts the border between rows automatically (none
 * before the first, none after the last), so rows don't need to know their
 * own position.
 *
 * @example
 * <Card>
 *   <CardHeader title="Profile" description="Your workspace account details." />
 *   <div className="divide-y divide-pulse-border-subtle">
 *     <SettingRow title="Name" control={<span>...</span>} />
 *     <SettingRow title="Email" control={<span>...</span>} />
 *   </div>
 * </Card>
 */
export function SettingRow({
    title,
    description,
    control,
    className = "",
}: {
    title: string;
    description?: string;
    control: ReactNode;
    className?: string;
}) {
    return (
        <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 ${className}`}>
            <div className="min-w-0">
                <p className="text-sm font-medium text-pulse-text">{title}</p>
                {description && <p className="text-xs text-pulse-muted mt-0.5">{description}</p>}
            </div>
            <div className="flex-shrink-0">{control}</div>
        </div>
    );
}

/** Refined pill switch — mirrors the toggle already used in agents/new/NewAgentClient.tsx. */
export function Toggle({
    checked,
    onChange,
    label,
    disabled = false,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label?: string;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex flex-shrink-0 h-6 w-11 items-center rounded-full transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel ${checked ? "bg-indigo-600" : "bg-pulse-border-strong"
                }`}
        >
            {label && <span className="sr-only">{label}</span>}
            <span
                aria-hidden="true"
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${checked ? "translate-x-6" : "translate-x-1"
                    }`}
            />
        </button>
    );
}

/**
 * Small "what does this do" info bubble for settings the user won't
 * necessarily understand at a glance. Opens on hover AND keyboard focus (not
 * click-only, so it's reachable via Tab), closes on blur/mouse-leave/Escape.
 * `aria-describedby` links the trigger to the bubble so screen readers
 * announce it as a description of the nearby control; the bubble itself is
 * `role="tooltip"`.
 *
 * @example
 * <div className="flex items-center gap-1.5">
 *   <p className="text-sm font-medium text-pulse-text">Self-configuration</p>
 *   <InfoTip text="Example: tell it 'be more concise' and it rewrites its own Soul/Memory." />
 * </div>
 */
export function InfoTip({ text, label = "More info" }: { text: string; label?: string }) {
    const id = useId();
    const [open, setOpen] = useState(false);

    return (
        <span className="relative inline-flex">
            <button
                type="button"
                aria-label={label}
                aria-describedby={open ? id : undefined}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") setOpen(false);
                }}
                className="inline-flex flex-shrink-0 text-pulse-faint hover:text-indigo-500 focus:text-indigo-500 outline-none rounded-full cursor-pointer transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
                <InformationCircleIcon className="w-4 h-4" aria-hidden="true" />
                <span className="sr-only">{label}</span>
            </button>
            {open && (
                <span
                    id={id}
                    role="tooltip"
                    className="absolute z-30 left-0 top-full mt-2 w-64 max-w-xs rounded-lg bg-pulse-panel border border-pulse-border text-pulse-text-soft text-xs leading-snug px-3 py-2 shadow-lg"
                >
                    {text}
                </span>
            )}
        </span>
    );
}

/** Muted one-line helper line under a setting/label — for short plain-language context. */
export function SettingHint({ children }: { children: ReactNode }) {
    return <p className="text-xs text-pulse-muted">{children}</p>;
}
