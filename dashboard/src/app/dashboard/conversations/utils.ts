/**
 * Shared helpers for the Conversations inbox (list + detail header) — kept in
 * one place so "what counts as a system conversation" and "how do we label a
 * channel" can't drift between the two views.
 */

/**
 * The Codex operator-bridge talks to itself over an internal "mcp" channel,
 * and its webchat sessions are always named "Claude Code" — neither is a
 * real end-user conversation, so both are treated as "system" and hidden by
 * default behind the "Show system conversations" toggle.
 */
export function isSystemConversation(c: { channelType: string; contactName: string | null }): boolean {
    return c.channelType === "mcp" || c.contactName === "Claude Code";
}

const CHANNEL_LABELS: Record<string, string> = {
    webapp: "Web app",
    webchat: "Web chat",
    telegram: "Telegram",
    mcp: "System (MCP)",
    email: "Email",
};

/** Human-readable label for a channel type — falls back to a capitalized raw value for anything unmapped. */
export function humanizeChannel(channelType: string): string {
    return CHANNEL_LABELS[channelType] ?? (channelType.charAt(0).toUpperCase() + channelType.slice(1));
}

/**
 * Secondary line shown under the contact name — the humanized channel, with
 * one special case: Telegram groups (negative chat ids, per Telegram's own
 * convention) read better as "Group chat" than "Telegram".
 */
export function secondaryChannelLabel(c: { channelType: string; channelContactId: string }): string {
    if (c.channelType === "telegram" && c.channelContactId.startsWith("-")) return "Group chat";
    return humanizeChannel(c.channelType);
}

/** "just now" / "Nm ago" / "Nh ago" / "Nd ago" / locale date beyond a week — no date-fns dependency needed for this. */
export function relativeTime(iso: string): string {
    if (!iso) return "—";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "—";
    const diffSec = Math.floor((Date.now() - then) / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(iso).toLocaleDateString();
}
