"use client";

import {
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type ForwardRefExoticComponent,
    type ReactNode,
    type RefAttributes,
    type SVGProps,
} from "react";
import { CheckIcon, ChevronUpDownIcon, InformationCircleIcon } from "@heroicons/react/24/outline";

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

/**
 * Flat card — border only, no drop shadow. The base surface for every
 * grouped block. Pass `tint` for the rare "highlighted" variant (e.g. an
 * AI-build panel) — a subtle accent wash fading into the panel surface
 * (a solid --pulse-tint fill read as a heavy violet slab in dark mode),
 * border/radius so it still reads as a Card, not a different component.
 */
export function Card({
    children,
    className = "",
    tint = false,
}: {
    children: ReactNode;
    className?: string;
    tint?: boolean;
}) {
    return (
        <div className={`${tint ? "bg-gradient-to-b from-pulse-tint/45 to-pulse-panel border-pulse-border" : "bg-pulse-panel border-pulse-border-subtle"} border rounded-xl overflow-hidden ${className}`}>
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

/** Shape shared by every @heroicons/react/24/outline icon component. */
type HeroIcon = ForwardRefExoticComponent<
    Omit<SVGProps<SVGSVGElement>, "ref"> & {
        title?: string;
        titleId?: string;
    } & RefAttributes<SVGSVGElement>
>;

/**
 * Standard "nothing here yet" state — muted icon, one-line title + hint,
 * optional CTA. Render it inside a `Card` (it supplies its own vertical
 * rhythm, not a border) so every empty list/table in the dashboard — Routing,
 * Custom Tools, MCP Servers, People, Agents, Departments, Conversations —
 * reads as the same component instead of a bespoke bordered box or bare
 * paragraph.
 *
 * @example
 * <Card>
 *   {items.length === 0 ? (
 *     <EmptyState icon={InboxIcon} title="No items yet" description="…" />
 *   ) : ( ...table... )}
 * </Card>
 */
export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: HeroIcon;
    title: string;
    description?: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center text-center px-6 py-16">
            <Icon className="w-10 h-10 text-pulse-faint mb-3" aria-hidden="true" />
            <p className="text-sm font-medium text-pulse-text">{title}</p>
            {description && <p className="text-sm text-pulse-muted mt-1 max-w-sm">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
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

export interface SelectMenuOption {
    value: string;
    label: string;
    /** Small muted chip rendered at the right edge of the option row (e.g. a category tag). */
    badge?: string;
}

export interface SelectMenuGroup {
    /** Group heading — also doubles as the badge shown on the closed trigger for the selected option. */
    label: string;
    options: SelectMenuOption[];
}

/**
 * Accessible custom listbox styled to match the rest of the token-driven UI —
 * a drop-in replacement for a native `<select>`/`<optgroup>` (which render as
 * unstyled OS dropdowns nobody can theme). Renders a hidden
 * `<input type="hidden" name={name}>` alongside the trigger so it drops
 * straight into a `<form>` exactly like a native select would — no change to
 * surrounding form-handling code needed.
 *
 * Keyboard: ArrowUp/Down move the highlight, Home/End jump to the ends,
 * Enter/Space commit, Escape closes. Closes on outside click; focus returns
 * to the trigger button on close, and moves to the listbox on open.
 *
 * @example
 * <SelectMenu
 *   id="agent-model"
 *   name="modelId"
 *   ariaLabel="Model"
 *   value={modelId}
 *   onChange={setModelId}
 *   groups={PROVIDERS.map((p) => ({
 *     label: p.name,
 *     options: p.models.map((m) => ({ value: m.id, label: m.displayName, badge: m.category })),
 *   }))}
 * />
 */
export function SelectMenu({
    id,
    name,
    value,
    onChange,
    groups,
    placeholder = "Select…",
    ariaLabel,
    disabled = false,
}: {
    id?: string;
    name?: string;
    value: string;
    onChange: (value: string) => void;
    groups: SelectMenuGroup[];
    placeholder?: string;
    ariaLabel?: string;
    disabled?: boolean;
}) {
    const reactId = useId();
    const baseId = id ?? reactId;
    const buttonId = `${baseId}-button`;
    const listboxId = `${baseId}-listbox`;

    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const optionRefs = useRef<Record<string, HTMLLIElement | null>>({});

    const flat = useMemo(
        () => groups.flatMap((g) => g.options.map((o) => ({ ...o, groupLabel: g.label }))),
        [groups]
    );
    const selectedIndex = flat.findIndex((o) => o.value === value);
    const selected = selectedIndex >= 0 ? flat[selectedIndex] : undefined;

    const close = (focusButton = true) => {
        setOpen(false);
        if (focusButton) requestAnimationFrame(() => document.getElementById(buttonId)?.focus());
    };

    const openList = () => {
        if (disabled || flat.length === 0) return;
        setHighlighted(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
        requestAnimationFrame(() => listRef.current?.focus());
    };

    const commit = (index: number) => {
        const opt = flat[index];
        if (!opt) return;
        onChange(opt.value);
        close();
    };

    // Close on outside click.
    useEffect(() => {
        if (!open) return;
        const onDocMouseDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) close(false);
        };
        document.addEventListener("mousedown", onDocMouseDown);
        return () => document.removeEventListener("mousedown", onDocMouseDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Keep the highlighted option scrolled into view as it changes.
    useEffect(() => {
        if (!open) return;
        const opt = flat[highlighted];
        if (opt) optionRefs.current[opt.value]?.scrollIntoView({ block: "nearest" });
    }, [highlighted, open, flat]);

    const handleListKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setHighlighted((i) => Math.min(flat.length - 1, i + 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setHighlighted((i) => Math.max(0, i - 1));
                break;
            case "Home":
                e.preventDefault();
                setHighlighted(0);
                break;
            case "End":
                e.preventDefault();
                setHighlighted(flat.length - 1);
                break;
            case "Enter":
            case " ":
                e.preventDefault();
                commit(highlighted);
                break;
            case "Escape":
                e.preventDefault();
                close();
                break;
            case "Tab":
                close(false);
                break;
            default:
                break;
        }
    };

    const handleButtonKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openList();
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            {name && <input type="hidden" name={name} value={value} />}
            <button
                id={buttonId}
                type="button"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-label={ariaLabel}
                onClick={() => (open ? close() : openList())}
                onKeyDown={handleButtonKeyDown}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
                {selected ? (
                    <span className="flex items-center gap-2 min-w-0">
                        <span className="flex-shrink-0 text-[10px] font-medium uppercase tracking-wide text-pulse-faint bg-pulse-panel-alt border border-pulse-border-subtle rounded px-1.5 py-0.5">
                            {selected.groupLabel}
                        </span>
                        <span className="truncate">{selected.label}</span>
                    </span>
                ) : (
                    <span className="text-pulse-faint">{placeholder}</span>
                )}
                <ChevronUpDownIcon className="w-4 h-4 flex-shrink-0 text-pulse-faint" aria-hidden="true" />
            </button>

            {open && (
                <ul
                    ref={listRef}
                    id={listboxId}
                    role="listbox"
                    tabIndex={-1}
                    aria-label={ariaLabel}
                    aria-activedescendant={flat[highlighted] ? `${listboxId}-opt-${flat[highlighted].value}` : undefined}
                    onKeyDown={handleListKeyDown}
                    className="absolute z-20 mt-1.5 w-full max-h-72 overflow-y-auto rounded-lg border border-pulse-border bg-pulse-panel shadow-lg py-1.5 outline-none"
                >
                    {groups.map((group) => (
                        <li key={group.label} role="presentation">
                            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-pulse-faint">
                                {group.label}
                            </div>
                            <ul role="group" aria-label={group.label} className="mb-1">
                                {group.options.map((opt) => {
                                    const index = flat.findIndex((f) => f.value === opt.value);
                                    const isSelected = opt.value === value;
                                    const isHighlighted = index === highlighted;
                                    return (
                                        <li
                                            key={opt.value}
                                            id={`${listboxId}-opt-${opt.value}`}
                                            role="option"
                                            aria-selected={isSelected}
                                            ref={(el) => {
                                                optionRefs.current[opt.value] = el;
                                            }}
                                            onMouseEnter={() => setHighlighted(index)}
                                            onClick={() => commit(index)}
                                            className={`flex items-center justify-between gap-2 mx-1.5 px-2.5 py-2 rounded-md text-sm cursor-pointer transition-colors motion-reduce:transition-none ${isHighlighted ? "bg-pulse-hover" : ""
                                                }`}
                                        >
                                            <span className="flex items-center gap-2 min-w-0">
                                                <CheckIcon
                                                    className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-pulse-accent-hi" : "text-transparent"}`}
                                                    aria-hidden="true"
                                                />
                                                <span className={`truncate ${isSelected ? "text-pulse-accent-hi font-medium" : "text-pulse-text"}`}>
                                                    {opt.label}
                                                </span>
                                            </span>
                                            {opt.badge && (
                                                <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-pulse-faint bg-pulse-panel-alt border border-pulse-border-subtle rounded px-1.5 py-0.5">
                                                    {opt.badge}
                                                </span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
