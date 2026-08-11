"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    CalendarDaysIcon,
    GlobeAltIcon,
    MagnifyingGlassIcon,
    MapPinIcon,
    PencilIcon,
    PlusIcon,
    TrashIcon,
    UserGroupIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";
import { Card, EmptyState, SettingHint, Toggle } from "../../../components/dashboard/ui";
import { deleteEventAction, getEvents, saveEventAction, saveTimezoneAction, type EventRow } from "./actions";

/** Fallback list when the runtime doesn't support Intl.supportedValuesOf (older Node/browsers). */
const FALLBACK_TIMEZONES = [
    "UTC",
    "Africa/Gaborone",
    "Africa/Johannesburg",
    "Europe/London",
    "Europe/Paris",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Dubai",
    "Asia/Singapore",
    "Australia/Sydney",
];

function listTimezones(): string[] {
    const supported = (Intl as any).supportedValuesOf;
    if (typeof supported === "function") {
        try {
            return supported("timeZone");
        } catch {
            return FALLBACK_TIMEZONES;
        }
    }
    return FALLBACK_TIMEZONES;
}

type FormState = {
    id: string;
    title: string;
    startsAt: string; // datetime-local value
    endsAt: string; // datetime-local value
    allDay: boolean;
    location: string;
    attendees: string;
    notes: string;
};

const EMPTY_FORM: FormState = {
    id: "",
    title: "",
    startsAt: "",
    endsAt: "",
    allDay: false,
    location: "",
    attendees: "",
    notes: "",
};

/** Convert an ISO date string to a `datetime-local` input value in the browser's local time. */
function toLocalInputValue(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Calendar-day key (YYYY-MM-DD) as seen in the given IANA timezone, so grouping ignores time-of-day. */
function dayKey(iso: string, timeZone: string): string {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone });
}

/** Shift a YYYY-MM-DD key by `days`, calendar-arithmetic only (no timezone involved). */
function shiftDayKey(key: string, days: number): string {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function formatDayHeading(iso: string, timeZone: string): string {
    const key = dayKey(iso, timeZone);
    const todayKey = dayKey(new Date().toISOString(), timeZone);
    const tomorrowKey = shiftDayKey(todayKey, 1);

    if (key === todayKey) return "Today";
    if (key === tomorrowKey) return "Tomorrow";
    return new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short", timeZone });
}

function formatTimeRange(ev: EventRow, timeZone: string): string {
    if (ev.allDay) return "All day";
    const start = new Date(ev.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone });
    if (!ev.endsAt) return start;
    const end = new Date(ev.endsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone });
    return `${start} – ${end}`;
}

function groupByDay(list: EventRow[], timeZone: string) {
    const groups: { key: string; heading: string; events: EventRow[] }[] = [];
    const index = new Map<string, number>();
    for (const ev of list) {
        const key = dayKey(ev.startsAt, timeZone);
        if (!index.has(key)) {
            index.set(key, groups.length);
            groups.push({ key, heading: formatDayHeading(ev.startsAt, timeZone), events: [] });
        }
        groups[index.get(key)!].events.push(ev);
    }
    return groups;
}

export default function CalendarClient({ events, timezone: initialTimezone }: { events: EventRow[]; timezone: string }) {
    const router = useRouter();
    const [, startTransition] = useTransition();

    const [search, setSearch] = useState("");
    const [showPast, setShowPast] = useState(false);
    const [pastLoading, setPastLoading] = useState(false);
    const [allEvents, setAllEvents] = useState<EventRow[] | null>(null);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [timezone, setTimezone] = useState(initialTimezone);
    const [tzSaving, setTzSaving] = useState(false);
    const timezoneOptions = useMemo(() => listTimezones(), []);

    // Resync when the server refetches with a newly-saved timezone (router.refresh()).
    useEffect(() => {
        setTimezone(initialTimezone);
    }, [initialTimezone]);

    function handleTimezoneChange(tz: string) {
        setTimezone(tz);
        setTzSaving(true);
        startTransition(async () => {
            const res = await saveTimezoneAction(tz);
            setTzSaving(false);
            if (res.success) {
                router.refresh();
            } else {
                setTimezone(initialTimezone);
                setMessage({ type: "error", text: res.message || "Failed to save timezone." });
            }
        });
    }

    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [busyRows, setBusyRows] = useState<Record<string, boolean>>({});

    const sourceEvents = showPast ? (allEvents ?? events) : events;

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return sourceEvents;
        return sourceEvents.filter((ev) => {
            const haystack = `${ev.title} ${ev.location ?? ""} ${ev.attendees ?? ""}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [sourceEvents, search]);

    const grouped = useMemo(() => groupByDay(filtered, timezone), [filtered, timezone]);

    function refreshEvents() {
        router.refresh();
        if (showPast) {
            startTransition(async () => {
                const rows = await getEvents(true);
                setAllEvents(rows);
            });
        }
    }

    function handleTogglePast(next: boolean) {
        setShowPast(next);
        if (next && allEvents === null) {
            setPastLoading(true);
            startTransition(async () => {
                const rows = await getEvents(true);
                setAllEvents(rows);
                setPastLoading(false);
            });
        }
    }

    function openAddForm() {
        setForm({ ...EMPTY_FORM, startsAt: toLocalInputValue(new Date().toISOString()) });
        setFormError(null);
        setFormOpen(true);
    }

    function openEditForm(ev: EventRow) {
        setForm({
            id: ev.id,
            title: ev.title,
            startsAt: toLocalInputValue(ev.startsAt),
            endsAt: toLocalInputValue(ev.endsAt),
            allDay: ev.allDay,
            location: ev.location ?? "",
            attendees: ev.attendees ?? "",
            notes: ev.notes ?? "",
        });
        setFormError(null);
        setFormOpen(true);
    }

    function closeForm() {
        setFormOpen(false);
        setFormError(null);
    }

    function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!form.title.trim()) {
            setFormError("Title is required.");
            return;
        }
        const startsAtDate = new Date(form.startsAt);
        if (!form.startsAt || Number.isNaN(startsAtDate.getTime())) {
            setFormError("A valid start time is required.");
            return;
        }

        setFormSaving(true);
        setFormError(null);
        const fd = new FormData();
        fd.set("id", form.id);
        fd.set("title", form.title);
        fd.set("startsAt", startsAtDate.toISOString());
        if (form.endsAt) {
            const endsAtDate = new Date(form.endsAt);
            if (!Number.isNaN(endsAtDate.getTime())) fd.set("endsAt", endsAtDate.toISOString());
        }
        fd.set("allDay", form.allDay ? "true" : "false");
        fd.set("location", form.location);
        fd.set("attendees", form.attendees);
        fd.set("notes", form.notes);

        startTransition(async () => {
            const res = await saveEventAction(fd);
            setFormSaving(false);
            if (res.success) {
                setFormOpen(false);
                setMessage({ type: "success", text: res.message || "Event saved." });
                refreshEvents();
            } else {
                setFormError(res.message || "Failed to save event.");
            }
        });
    }

    function handleDelete(ev: EventRow) {
        if (!confirm(`Delete event "${ev.title}"? This cannot be undone.`)) return;
        setBusyRows((prev) => ({ ...prev, [ev.id]: true }));
        startTransition(async () => {
            const res = await deleteEventAction(ev.id);
            setBusyRows((prev) => ({ ...prev, [ev.id]: false }));
            setMessage({ type: res.success ? "success" : "error", text: res.message || "" });
            if (res.success) refreshEvents();
        });
    }

    return (
        <div>
            {message && (
                <div
                    role="status"
                    className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
                        message.type === "success"
                            ? "bg-green-500/10 text-green-500 border-green-500/30"
                            : "bg-red-500/10 text-red-500 border-red-500/30"
                    }`}
                >
                    {message.text}
                </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-0 sm:max-w-xs">
                    <MagnifyingGlassIcon
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pulse-faint pointer-events-none"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search events…"
                        aria-label="Search events by title, location, or attendee"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                    <label
                        htmlFor="workspace-timezone"
                        className="inline-flex items-center gap-1.5 text-pulse-muted whitespace-nowrap"
                    >
                        <GlobeAltIcon className="w-4 h-4 text-pulse-faint" aria-hidden="true" />
                        Timezone
                    </label>
                    <select
                        id="workspace-timezone"
                        value={timezone}
                        onChange={(e) => handleTimezoneChange(e.target.value)}
                        disabled={tzSaving}
                        aria-label="Workspace timezone"
                        className="border border-pulse-border rounded-lg px-2.5 py-1.5 text-sm text-pulse-text bg-pulse-panel outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60 max-w-[11rem]"
                    >
                        {timezoneOptions.map((tz) => (
                            <option key={tz} value={tz}>{tz}</option>
                        ))}
                    </select>
                    {tzSaving && <span className="text-xs text-pulse-faint whitespace-nowrap">saving…</span>}
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-pulse-muted cursor-pointer select-none">
                    <Toggle checked={showPast} onChange={handleTogglePast} label="Show past events" />
                    Show past events
                    {pastLoading && <span className="text-xs text-pulse-faint">loading…</span>}
                </label>
                <button
                    type="button"
                    onClick={openAddForm}
                    className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 whitespace-nowrap sm:ml-auto"
                >
                    <PlusIcon className="w-4 h-4" aria-hidden="true" />
                    Add event
                </button>
            </div>
            <div className="-mt-2 mb-4">
                <SettingHint>The assistant uses this timezone for scheduling.</SettingHint>
            </div>

            {/* Add/edit form */}
            {formOpen && (
                <Card className="mb-4">
                    <form onSubmit={handleFormSubmit}>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-pulse-border-subtle">
                            <h2 className="text-sm font-semibold text-pulse-text">{form.id ? "Edit event" : "Add event"}</h2>
                            <button
                                type="button"
                                onClick={closeForm}
                                aria-label="Close form"
                                className="p-1 rounded-lg text-pulse-faint hover:text-pulse-text hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                <XMarkIcon className="w-4 h-4" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                                <label htmlFor="event-title" className="block text-xs font-medium text-pulse-muted mb-1.5">
                                    Title <span className="text-pulse-faint">(required)</span>
                                </label>
                                <input
                                    id="event-title"
                                    type="text"
                                    required
                                    value={form.title}
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label htmlFor="event-starts" className="block text-xs font-medium text-pulse-muted mb-1.5">
                                    Start <span className="text-pulse-faint">(required)</span>
                                </label>
                                <input
                                    id="event-starts"
                                    type="datetime-local"
                                    required
                                    value={form.startsAt}
                                    onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                                />
                                <p className="text-xs text-pulse-faint mt-1">Entered in your local time.</p>
                            </div>
                            <div>
                                <label htmlFor="event-ends" className="block text-xs font-medium text-pulse-muted mb-1.5">End</label>
                                <input
                                    id="event-ends"
                                    type="datetime-local"
                                    value={form.endsAt}
                                    onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                                />
                            </div>
                            <div className="sm:col-span-2 flex items-center gap-2">
                                <input
                                    id="event-allday"
                                    type="checkbox"
                                    checked={form.allDay}
                                    onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))}
                                    className="w-4 h-4 rounded border-pulse-border text-indigo-600 bg-pulse-panel outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                                />
                                <label htmlFor="event-allday" className="text-sm text-pulse-text cursor-pointer">All day</label>
                            </div>
                            <div>
                                <label htmlFor="event-location" className="block text-xs font-medium text-pulse-muted mb-1.5">Location</label>
                                <input
                                    id="event-location"
                                    type="text"
                                    value={form.location}
                                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label htmlFor="event-attendees" className="block text-xs font-medium text-pulse-muted mb-1.5">Attendees</label>
                                <input
                                    id="event-attendees"
                                    type="text"
                                    placeholder="Comma-separated"
                                    value={form.attendees}
                                    onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text placeholder-pulse-faint outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="event-notes" className="block text-xs font-medium text-pulse-muted mb-1.5">Notes</label>
                                <textarea
                                    id="event-notes"
                                    rows={3}
                                    value={form.notes}
                                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-pulse-border bg-pulse-panel text-pulse-text outline-none transition-shadow motion-reduce:transition-none hover:border-pulse-border-strong focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none"
                                />
                            </div>
                        </div>
                        {formError && (
                            <div className="px-4 pb-2">
                                <p className="text-xs text-red-500">{formError}</p>
                            </div>
                        )}
                        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-pulse-border-subtle">
                            <button
                                type="button"
                                onClick={closeForm}
                                className="text-sm font-medium text-pulse-muted hover:text-pulse-text transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md px-3 py-2"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={formSaving}
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {formSaving ? "Saving…" : form.id ? "Save changes" : "Add event"}
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Agenda */}
            <Card>
                {sourceEvents.length === 0 ? (
                    <EmptyState
                        icon={CalendarDaysIcon}
                        title="Nothing scheduled"
                        description="Add an event or ask your assistant to."
                        action={
                            <button
                                type="button"
                                onClick={openAddForm}
                                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            >
                                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                                Add event
                            </button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={MagnifyingGlassIcon}
                        title="No matching events"
                        description="Try a different search term."
                        action={
                            <button
                                type="button"
                                onClick={() => setSearch("")}
                                className="text-sm font-medium text-indigo-500 hover:text-indigo-400 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
                            >
                                Clear search
                            </button>
                        }
                    />
                ) : (
                    <div className="divide-y divide-pulse-border-subtle">
                        {grouped.map((group) => (
                            <div key={group.key} className="px-4 py-3">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-pulse-faint mb-2">
                                    {group.heading}
                                </h3>
                                <div className="space-y-2.5">
                                    {group.events.map((ev) => {
                                        const busy = !!busyRows[ev.id];
                                        return (
                                            <div
                                                key={ev.id}
                                                className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 rounded-lg px-2 py-2 -mx-2 hover:bg-pulse-hover"
                                            >
                                                <div className="w-full sm:w-28 flex-shrink-0 text-xs text-pulse-muted pt-0.5">
                                                    {formatTimeRange(ev, timezone)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-pulse-text">{ev.title}</p>
                                                    {(ev.location || ev.attendees) && (
                                                        <p className="text-xs text-pulse-muted mt-0.5 flex items-center gap-3 flex-wrap">
                                                            {ev.location && (
                                                                <span className="inline-flex items-center gap-1">
                                                                    <MapPinIcon className="w-3.5 h-3.5 text-pulse-faint" aria-hidden="true" />
                                                                    {ev.location}
                                                                </span>
                                                            )}
                                                            {ev.attendees && (
                                                                <span className="inline-flex items-center gap-1">
                                                                    <UserGroupIcon className="w-3.5 h-3.5 text-pulse-faint" aria-hidden="true" />
                                                                    {ev.attendees}
                                                                </span>
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 flex-shrink-0 self-start sm:self-auto">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditForm(ev)}
                                                        aria-label={`Edit ${ev.title}`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-indigo-500 hover:bg-pulse-hover transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                    >
                                                        <PencilIcon className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(ev)}
                                                        disabled={busy}
                                                        aria-label={`Delete ${ev.title}`}
                                                        className="p-1.5 rounded-lg text-pulse-faint hover:text-red-500 hover:bg-red-500/10 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <TrashIcon className="w-4 h-4" aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
            <SettingHint>Times shown in the workspace timezone ({timezone}).</SettingHint>
        </div>
    );
}
