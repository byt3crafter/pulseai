"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, BellAlertIcon } from "@heroicons/react/24/outline";
import {
    getNotifications,
    getUnreadCount,
    markAllNotificationsRead,
    markNotificationRead,
    type NotificationRow,
} from "./actions";

const POLL_INTERVAL_MS = 30_000;

/** Relative time label — "5m", "2h", "3d" — falls back to a short date past a week. */
function relativeTime(date: Date | null): string {
    if (!date) return "";
    const diffMs = Date.now() - new Date(date).getTime();
    const diffSec = Math.round(diffMs / 1000);
    if (diffSec < 60) return "now";
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHour = Math.round(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h`;
    const diffDay = Math.round(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d`;
    return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Dot color for a notification's priority — mirrors the status-color token pattern. */
function priorityDotClass(priority: string | null): string {
    if (priority === "high") return "bg-red-500";
    if (priority === "low") return "bg-pulse-faint";
    return "bg-indigo-500";
}

/**
 * Bell icon with an unread-count badge, always mounted in the dashboard
 * header. Polls the unread count every 30s and opens a dropdown feed of
 * recent notifications on click. Clicking an item marks it read and
 * navigates to its `link` (if any).
 */
export default function NotificationBell({ align = "right" }: { align?: "left" | "right" }) {
    const router = useRouter();
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<NotificationRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [marking, setMarking] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const toggleButtonRef = useRef<HTMLButtonElement>(null);

    const refreshUnreadCount = useCallback(async () => {
        const count = await getUnreadCount();
        setUnreadCount(count);
    }, []);

    // Initial load + poll every 30s.
    useEffect(() => {
        refreshUnreadCount();
        const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [refreshUnreadCount]);

    const loadFeed = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await getNotifications();
            setItems(rows);
        } finally {
            setLoading(false);
        }
    }, []);

    const toggleOpen = () => {
        setOpen((prev) => {
            const next = !prev;
            if (next) loadFeed();
            return next;
        });
    };

    // Close on outside click.
    useEffect(() => {
        if (!open) return;
        const onDocMouseDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDocMouseDown);
        return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, [open]);

    // Close on Escape, return focus to the toggle button.
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOpen(false);
                toggleButtonRef.current?.focus();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open]);

    const handleItemClick = async (item: NotificationRow) => {
        if (!item.read) {
            setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
            setUnreadCount((prev) => Math.max(0, prev - 1));
            await markNotificationRead(item.id);
        }
        if (item.link) {
            setOpen(false);
            router.push(item.link);
        }
    };

    const handleMarkAllRead = async () => {
        setMarking(true);
        try {
            await markAllNotificationsRead();
            setItems((prev) => prev.map((n) => ({ ...n, read: true })));
            setUnreadCount(0);
        } finally {
            setMarking(false);
        }
    };

    const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);
    const BellComponent = unreadCount > 0 ? BellAlertIcon : BellIcon;

    return (
        <div className="relative" ref={containerRef}>
            <button
                ref={toggleButtonRef}
                type="button"
                onClick={toggleOpen}
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                aria-haspopup="true"
                aria-expanded={open}
                className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg text-pulse-faint hover:bg-pulse-hover hover:text-pulse-text transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
                <BellComponent className="w-5 h-5" aria-hidden="true" />
                {unreadCount > 0 && (
                    <span
                        aria-hidden="true"
                        className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none"
                    >
                        {badgeLabel}
                    </span>
                )}
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Notifications"
                    className={`absolute top-full mt-2 w-[360px] max-w-[calc(100vw-1.5rem)] max-h-[440px] flex flex-col rounded-xl border border-pulse-border bg-pulse-panel shadow-lg z-50 overflow-hidden ${align === "left" ? "left-0" : "right-0"}`}
                >
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-pulse-border-subtle flex-shrink-0">
                        <h2 className="text-sm font-semibold text-pulse-text">Notifications</h2>
                        <button
                            type="button"
                            onClick={handleMarkAllRead}
                            disabled={marking || unreadCount === 0}
                            className="text-xs font-medium text-pulse-accent-hi hover:underline disabled:text-pulse-faint disabled:no-underline disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                        >
                            Mark all read
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="px-4 py-8 text-center text-sm text-pulse-muted">Loading…</div>
                        ) : items.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-pulse-muted">No notifications yet.</div>
                        ) : (
                            <ul>
                                {items.map((item) => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleItemClick(item)}
                                            className={`w-full flex items-start gap-2.5 text-left px-4 py-3 border-b border-pulse-border-subtle last:border-b-0 transition-colors motion-reduce:transition-none cursor-pointer hover:bg-pulse-hover outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${!item.read ? "bg-pulse-tint" : ""}`}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${!item.read ? priorityDotClass(item.priority) : "bg-transparent"}`}
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-baseline justify-between gap-2">
                                                    <span className="text-sm font-semibold text-pulse-text truncate">{item.title}</span>
                                                    <span className="flex-shrink-0 text-[11px] text-pulse-faint">{relativeTime(item.createdAt)}</span>
                                                </span>
                                                {item.body && (
                                                    <span className="block text-xs text-pulse-muted mt-0.5 line-clamp-2">{item.body}</span>
                                                )}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
