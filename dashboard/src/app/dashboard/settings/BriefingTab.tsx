"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, SettingRow, Toggle } from "../../../components/dashboard/ui";
import { saveBriefingSettingsAction, type BriefingConfig } from "./actions";

const DAY_OPTIONS: { id: BriefingConfig["days"]; label: string }[] = [
    { id: "daily", label: "Every day" },
    { id: "weekdays", label: "Weekdays (Mon–Fri)" },
    { id: "mon-sat", label: "Mon–Sat" },
];

/**
 * Daily Briefing — an owner-configured, automatic morning digest. Saving
 * writes the config to the tenant record and upserts a "Daily briefing"
 * scheduled_jobs row that the gateway's cron reconciler picks up.
 */
export default function BriefingTab({ config }: { config: BriefingConfig }) {
    const [enabled, setEnabled] = useState(config.enabled);
    const [time, setTime] = useState(config.time);
    const [days, setDays] = useState<BriefingConfig["days"]>(config.days);
    const [recipientEmail, setRecipientEmail] = useState(config.recipientEmail);
    const [inbox, setInbox] = useState(config.channels.inbox);
    const [email, setEmail] = useState(config.channels.email);
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    function save() {
        setMsg(null);
        startTransition(async () => {
            const res = await saveBriefingSettingsAction({
                enabled,
                time,
                days,
                recipientEmail,
                channels: { inbox, email },
            });
            setMsg({ ok: res.success, text: res.message });
        });
    }

    return (
        <div className="space-y-5">
            <Card>
                <CardHeader
                    title="Daily Briefing"
                    description="Every morning, your agent gathers your email, follow-ups, tasks, and calendar into one short digest and delivers it automatically — no need to ask."
                    action={
                        <button
                            type="button"
                            onClick={save}
                            disabled={pending}
                            className="rounded-lg bg-pulse-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pulse-accent-hi disabled:opacity-60"
                        >
                            {pending ? "Saving…" : "Save changes"}
                        </button>
                    }
                />
                {msg && (
                    <div className={`px-4 pt-4 text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>
                )}
                <div className="divide-y divide-pulse-border-subtle">
                    <SettingRow
                        title="Enable daily briefing"
                        description="Turn this off to pause the scheduled job without losing your settings."
                        control={<Toggle checked={enabled} onChange={setEnabled} label="Enable daily briefing" />}
                    />
                    <SettingRow
                        title="Time"
                        description="The local time the briefing is sent, in your workspace timezone (set under Account)."
                        control={
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="rounded-lg border border-pulse-border bg-pulse-panel px-3 py-1.5 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        }
                    />
                    <SettingRow
                        title="Days"
                        description="Which days the briefing runs."
                        control={
                            <select
                                value={days}
                                onChange={(e) => setDays(e.target.value as BriefingConfig["days"])}
                                className="rounded-lg border border-pulse-border bg-pulse-panel px-3 py-1.5 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {DAY_OPTIONS.map((opt) => (
                                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                                ))}
                            </select>
                        }
                    />
                    <SettingRow
                        title="Recipient email"
                        description="Where the briefing is sent when the Email channel is enabled below."
                        control={
                            <input
                                type="email"
                                value={recipientEmail}
                                onChange={(e) => setRecipientEmail(e.target.value)}
                                placeholder="you@company.com"
                                className="w-56 rounded-lg border border-pulse-border bg-pulse-panel px-3 py-1.5 text-sm text-pulse-text outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        }
                    />
                    <SettingRow
                        title="Delivery channels"
                        description="Choose at least one place the briefing is delivered."
                        control={
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 text-sm text-pulse-text cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={inbox}
                                        onChange={(e) => setInbox(e.target.checked)}
                                        className="h-4 w-4 rounded border-pulse-border text-pulse-accent focus:ring-indigo-500"
                                    />
                                    In-app inbox
                                </label>
                                <label className="flex items-center gap-2 text-sm text-pulse-text cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={email}
                                        onChange={(e) => setEmail(e.target.checked)}
                                        className="h-4 w-4 rounded border-pulse-border text-pulse-accent focus:ring-indigo-500"
                                    />
                                    Email
                                </label>
                            </div>
                        }
                    />
                </div>
            </Card>
        </div>
    );
}
