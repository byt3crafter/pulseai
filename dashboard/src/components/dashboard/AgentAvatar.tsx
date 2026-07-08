/**
 * Small reusable avatar for representing an agent anywhere in the dashboard
 * (agents table, agent detail header, …). Renders the uploaded picture when
 * present, otherwise falls back to initials on a deterministic color chip
 * picked from the agent's name — same agent always gets the same color, no
 * network fetch, no layout shift while `avatar` loads server-side.
 */

// Same bg/10 + text/border-30 chip formula used for status pills elsewhere in
// the dashboard (see CLAUDE.md "Status colors"), so the fallback avatar reads
// as part of the same system in both light and dark themes.
const PALETTE: { bg: string; text: string }[] = [
    { bg: "bg-indigo-500/15", text: "text-indigo-400" },
    { bg: "bg-violet-500/15", text: "text-violet-400" },
    { bg: "bg-sky-500/15", text: "text-sky-400" },
    { bg: "bg-emerald-500/15", text: "text-emerald-400" },
    { bg: "bg-amber-500/15", text: "text-amber-400" },
    { bg: "bg-rose-500/15", text: "text-rose-400" },
    { bg: "bg-fuchsia-500/15", text: "text-fuchsia-400" },
    { bg: "bg-cyan-500/15", text: "text-cyan-400" },
];

function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function getInitials(name: string): string {
    const trimmed = (name || "").trim();
    if (!trimmed) return "?";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZE_CLASSES = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-16 h-16 text-lg",
} as const;

export type AgentAvatarSize = keyof typeof SIZE_CLASSES;

export default function AgentAvatar({
    name,
    avatar,
    size = "md",
    className = "",
}: {
    name: string;
    avatar?: string | null;
    size?: AgentAvatarSize;
    className?: string;
}) {
    const sizeClass = SIZE_CLASSES[size];

    if (avatar) {
        return (
            <img
                src={avatar}
                alt=""
                className={`${sizeClass} rounded-full object-cover flex-shrink-0 border border-pulse-border-subtle ${className}`}
            />
        );
    }

    const palette = PALETTE[hashString(name || "") % PALETTE.length];
    return (
        <div
            aria-hidden="true"
            className={`${sizeClass} rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${palette.bg} ${palette.text} ${className}`}
        >
            {getInitials(name)}
        </div>
    );
}
