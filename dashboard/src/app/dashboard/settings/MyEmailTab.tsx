"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "../../../components/dashboard/ui";
import { saveMyEmailAction, disconnectMyEmailAction, type MyEmailConfig } from "./my-email-actions";

const field =
    "w-full rounded-lg border border-pulse-border bg-pulse-panel px-3 py-2 text-sm text-pulse-text placeholder:text-pulse-faint outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50";

/**
 * Your own mailbox — distinct from the agent's.
 *
 * An agent already writes from its own address as itself. This is delegation:
 * connect your mail and an agent working FOR you reads and writes yours. Without
 * it, "check my email" opens whatever the workspace has configured, which in a
 * team is somebody else's inbox.
 */
export default function MyEmailTab({ config }: { config: MyEmailConfig }) {
    const [c, setC] = useState(config);
    const [smtpPassword, setSmtpPassword] = useState("");
    const [imapPassword, setImapPassword] = useState("");
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [pending, startTransition] = useTransition();

    const set = <K extends keyof MyEmailConfig>(k: K, v: MyEmailConfig[K]) => setC((p) => ({ ...p, [k]: v }));

    function save() {
        setMsg(null);
        startTransition(async () => {
            const res = await saveMyEmailAction({ ...c, smtpPassword, imapPassword });
            setMsg({ ok: res.success, text: res.message });
            if (res.success) { setSmtpPassword(""); setImapPassword(""); setC((p) => ({ ...p, connected: true })); }
        });
    }

    function disconnect() {
        setMsg(null);
        startTransition(async () => {
            const res = await disconnectMyEmailAction();
            setMsg({ ok: res.success, text: res.message });
            if (res.success) setC({ ...c, connected: false, emailAddress: "", smtpHost: "", imapHost: "" });
        });
    }

    return (
        <div className="space-y-5">
            <Card>
                <CardHeader
                    title="My email"
                    description="Connect your own mailbox so an agent can read and write email on your behalf. This is yours alone — nobody else in the workspace can see or use it."
                />
                <div className="space-y-5 p-5">
                    <div className="rounded-lg border border-pulse-border-subtle bg-pulse-panel-alt p-3 text-xs leading-relaxed text-pulse-muted">
                        Agents already send from their own address when acting as themselves.
                        This is used when an agent is doing something <em>for you</em> — checking
                        your inbox, replying on your behalf. If you don&apos;t connect one, an
                        agent will tell you which address it used instead of sending quietly.
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-pulse-text-soft">Email address</label>
                            <input type="email" value={c.emailAddress} onChange={(e) => set("emailAddress", e.target.value)}
                                placeholder="you@company.com" className={field} />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-pulse-text-soft">Display name</label>
                            <input type="text" value={c.displayName} onChange={(e) => set("displayName", e.target.value)}
                                placeholder="Your name" className={field} />
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-pulse-dim">Sending (SMTP)</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1.5 block text-sm text-pulse-text-soft">Host</label>
                                <input value={c.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.gmail.com" className={field} />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-sm text-pulse-text-soft">Port</label>
                                <input value={c.smtpPort} onChange={(e) => set("smtpPort", e.target.value)} className={field} />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-sm text-pulse-text-soft">Username</label>
                                <input value={c.smtpUsername} onChange={(e) => set("smtpUsername", e.target.value)} placeholder="Usually your address" className={field} />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-sm text-pulse-text-soft">
                                    Password {c.hasSmtpPassword && <span className="text-pulse-faint">— saved, leave blank to keep</span>}
                                </label>
                                <input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)}
                                    placeholder={c.hasSmtpPassword ? "••••••••" : "App password"} className={field} />
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-pulse-dim">Reading (IMAP)</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1.5 block text-sm text-pulse-text-soft">Host</label>
                                <input value={c.imapHost} onChange={(e) => set("imapHost", e.target.value)} placeholder="imap.gmail.com" className={field} />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-sm text-pulse-text-soft">Port</label>
                                <input value={c.imapPort} onChange={(e) => set("imapPort", e.target.value)} className={field} />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-sm text-pulse-text-soft">Username</label>
                                <input value={c.imapUsername} onChange={(e) => set("imapUsername", e.target.value)} placeholder="Usually your address" className={field} />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-sm text-pulse-text-soft">
                                    Password {c.hasImapPassword && <span className="text-pulse-faint">— saved, leave blank to keep</span>}
                                </label>
                                <input type="password" value={imapPassword} onChange={(e) => setImapPassword(e.target.value)}
                                    placeholder={c.hasImapPassword ? "••••••••" : "App password"} className={field} />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button type="button" onClick={save} disabled={pending}
                            className="cursor-pointer rounded-lg bg-pulse-primary px-4 py-2 text-sm font-semibold text-pulse-primary-fg hover:bg-pulse-primary-hover disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-pulse-accent/50">
                            {pending ? "Saving…" : c.connected ? "Update" : "Connect mailbox"}
                        </button>
                        {c.connected && (
                            <button type="button" onClick={disconnect} disabled={pending}
                                className="cursor-pointer rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                                Disconnect
                            </button>
                        )}
                        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</span>}
                    </div>
                </div>
            </Card>
        </div>
    );
}
