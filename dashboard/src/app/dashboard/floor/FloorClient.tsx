"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getFloorState, getFloorTokenAction } from "./actions";
import AgentActivityPanel from "./AgentActivityPanel";
import FloorSvg from "./FloorSvg";
import { layoutFloor, type LayoutRoomInput } from "./layout-floor";
import { toolStepLabel } from "./tool-labels";
import type { DeskState, FloorActivity, FloorAgent, FloorDepartment, FloorHuman, FloorSnapshot, Handoff } from "./types";

/**
 * Polling is the floor's safety net, not its heartbeat. It stays on even when
 * the socket is live, because the WS registry is per-process: with more than one
 * gateway container a browser only hears events from the one it happens to be
 * connected to. It also covers a misconfigured /ws proxy, which has bitten
 * production before.
 */
const POLL_LIVE_MS = 15_000;
const POLL_FALLBACK_MS = 4000;
/** Don't animate work that arrived while the tab was in the background. */
const STALE_MS = 10_000;
/** A blizzard of slips is worse than none — cap what can fly at once. */
const MAX_FLIGHTS = 8;
/** Long enough for the slowest walk out, the handover, and the walk back. */
const FLIGHT_LIFE_MS = 7000;

/** "3.8h", "24m", "48s" — hours only once it is actually hours. */
export function formatHours(h: number): string {
    if (!h || h <= 0) return "0";
    if (h < 1 / 60) return `${Math.round(h * 3600)}s`;
    if (h < 1) return `${Math.round(h * 60)}m`;
    return `${h.toFixed(1)}h`;
}

interface Props {
    agents: FloorAgent[];
    departments: FloorDepartment[];
    unassigned: string[];
    humans: FloorHuman[];
    initial: FloorSnapshot;
}

export default function FloorClient({ agents, departments, unassigned, humans, initial }: Props) {
    const [snapshot, setSnapshot] = useState<FloorSnapshot>(initial);
    const [flights, setFlights] = useState<Handoff[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [reachable, setReachable] = useState(true);
    /** True once the WebSocket is connected: the floor reacts instantly. */
    const [live, setLive] = useState(false);
    /**
     * Desk states pushed over the socket, overlaid on the polled snapshot.
     * This is what makes a sub-4-second run visible at all — it would begin and
     * end entirely between two polls and never appear in a snapshot.
     */
    const [pushed, setPushed] = useState<Map<string, FloorActivity>>(new Map());
    const [task, setTask] = useState("");
    const [sending, setSending] = useState(false);
    /** The live socket, reused to hand work out from the floor itself. */
    const wsRef = useRef<WebSocket | null>(null);

    // Handoff ids we've already reacted to, so a slip flies exactly once even
    // though the same row keeps coming back for another ~30s of polls.
    const seen = useRef<Set<string>>(new Set(initial.handoffs.map((h) => h.id)));

    const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

    const layout = useMemo(() => {
        const rooms: LayoutRoomInput[] = departments
            .filter((d) => d.agentIds.length > 0)
            .map((d) => ({
                id: d.id,
                name: d.name,
                agents: d.agentIds
                    .map((id) => agentMap.get(id))
                    .filter((a): a is FloorAgent => !!a)
                    .map((a) => ({ id: a.id, name: a.name, title: a.title, lead: d.leadAgentId === a.id })),
            }));

        if (unassigned.length > 0) {
            rooms.push({
                id: "zz-unassigned", // sorts last
                name: "Unassigned",
                agents: unassigned
                    .map((id) => agentMap.get(id))
                    .filter((a): a is FloorAgent => !!a)
                    .map((a) => ({ id: a.id, name: a.name, title: a.title, lead: false })),
            });
        }
        return layoutFloor(rooms, humans.map((h) => h.id));
    }, [departments, unassigned, agentMap, humans]);

    /** Spawn slips for handoffs we haven't animated yet. */
    const spawnFlights = useCallback((incoming: Handoff[], now: number) => {
        const fresh = incoming.filter((h) => !seen.current.has(h.id));
        for (const h of incoming) seen.current.add(h.id);
        if (seen.current.size > 500) seen.current = new Set(incoming.map((h) => h.id));

        const animatable = fresh.filter((h) => now - h.at < STALE_MS).slice(0, MAX_FLIGHTS);
        if (animatable.length === 0) return;

        setFlights((prev) => [...prev, ...animatable].slice(-MAX_FLIGHTS));
        window.setTimeout(() => {
            setFlights((prev) => prev.filter((f) => !animatable.some((a) => a.id === f.id)));
        }, FLIGHT_LIFE_MS);
    }, []);

    /**
     * Hand work to an agent from the floor.
     *
     * The slip is synthesised locally the instant you hit send, rather than
     * waiting for the run to come back over the socket — the animation has to
     * start on the action, not up to a second later.
     */
    const giveWork = useCallback((agentId: string) => {
        const text = task.trim();
        const ws = wsRef.current;
        if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

        setSending(true);
        try {
            ws.send(JSON.stringify({
                type: "chat",
                text,
                agentProfileId: agentId,
                sessionId: `floor-${agentId}`.slice(0, 64),
            }));
            spawnFlights([{
                id: `local-${agentId}-${performance.now()}`,
                from: { kind: "boss" },
                toAgentId: agentId,
                at: Date.now(),
            }], Date.now());
            setPushed((prev) => new Map(prev).set(agentId, {
                agentId, state: "thinking", caption: null, runId: null,
            }));
            setTask("");
        } finally {
            setSending(false);
        }
    }, [task, spawnFlights]);

    const refresh = useCallback(async () => {
        try {
            const next = await getFloorState();
            setSnapshot(next);
            setReachable(true);

            spawnFlights(next.handoffs, next.serverNow);
            // A run the poll no longer reports is genuinely over; drop any pushed
            // state for it so the two sources can't disagree forever.
            setPushed((prev) => {
                if (prev.size === 0) return prev;
                const stillRunning = new Set(next.activity.map((a) => a.agentId));
                const kept = new Map([...prev].filter(([id]) => stillRunning.has(id)));
                return kept.size === prev.size ? prev : kept;
            });
        } catch {
            setReachable(false);
        }
    }, [spawnFlights]);

    useEffect(() => {
        const id = window.setInterval(refresh, live ? POLL_LIVE_MS : POLL_FALLBACK_MS);
        return () => window.clearInterval(id);
    }, [refresh, live]);

    // Live push. The gateway broadcasts floor events to every socket on the
    // tenant, and clients are registered at auth — so this socket receives them
    // without ever sending a chat frame.
    useEffect(() => {
        let ws: WebSocket | null = null;
        let closed = false;
        let retry: number | undefined;

        const clearDesk = (agentId: string, after: number) => {
            window.setTimeout(() => {
                setPushed((prev) => {
                    if (!prev.has(agentId)) return prev;
                    const next = new Map(prev);
                    next.delete(agentId);
                    return next;
                });
            }, after);
        };

        const connect = async () => {
            if (closed) return;
            const res = await getFloorTokenAction();
            if (!res.ok || closed) return;

            const proto = window.location.protocol === "https:" ? "wss" : "ws";
            ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(res.token)}`);
            wsRef.current = ws;

            ws.onopen = () => setLive(true);
            ws.onclose = () => {
                setLive(false);
                wsRef.current = null;
                // Fall back to the faster poll and try again shortly.
                if (!closed) retry = window.setTimeout(connect, 8000);
            };
            ws.onerror = () => setLive(false);

            ws.onmessage = (raw) => {
                let msg: { type?: string; event?: Record<string, unknown> };
                try { msg = JSON.parse(String(raw.data)); } catch { return; }
                if (msg.type !== "floor" || !msg.event) return;

                const ev = msg.event as {
                    type: string; runId: string; agentProfileId: string | null;
                    trigger?: string; tool?: string; status?: string; durationMs?: number;
                };
                const agentId = ev.agentProfileId;
                if (!agentId) return;

                if (ev.type === "run:start") {
                    setPushed((prev) => new Map(prev).set(agentId, {
                        agentId, state: "thinking", caption: null, runId: ev.runId,
                    }));
                    const scheduled = ["cron", "heartbeat", "standing_order", "commitment"].includes(ev.trigger ?? "");
                    const delegated = ev.trigger === "delegation";
                    // A delegated run's slip is drawn from the polled delegation row,
                    // which knows the source agent; don't double up here.
                    if (!delegated) {
                        spawnFlights([{
                            id: `ws-${ev.runId}`,
                            from: scheduled ? { kind: "schedule" } : { kind: "boss" },
                            toAgentId: agentId,
                            at: Date.now(),
                        }], Date.now());
                    }
                } else if (ev.type === "run:tool") {
                    setPushed((prev) => new Map(prev).set(agentId, {
                        agentId, state: "working",
                        caption: ev.tool ? toolStepLabel(ev.tool) : "Working",
                        runId: ev.runId,
                    }));
                } else if (ev.type === "run:end") {
                    const failed = ev.status === "failed";
                    const substantial = (ev.durationMs ?? 0) >= 20_000;
                    if (failed || substantial) {
                        setPushed((prev) => new Map(prev).set(agentId, {
                            agentId, state: failed ? "failed" : "done", caption: null, runId: ev.runId,
                        }));
                        clearDesk(agentId, failed ? 4200 : 2600);
                    } else {
                        // A three-second reply ends quietly rather than celebrating.
                        clearDesk(agentId, 0);
                    }
                }
            };
        };

        void connect();
        return () => {
            closed = true;
            if (retry) window.clearTimeout(retry);
            ws?.close();
        };
    }, [spawnFlights]);

    const { states, captions } = useMemo(() => {
        const s = new Map<string, DeskState>();
        const c = new Map<string, string | null>();
        for (const a of agents) s.set(a.id, a.enabled ? "idle" : "offline");

        const apply = (act: FloorActivity) => {
            // A disabled agent can't be working; don't let a stale row say otherwise.
            if (agentMap.get(act.agentId)?.enabled === false) return;
            s.set(act.agentId, act.state);
            c.set(act.agentId, act.caption);
        };

        for (const act of snapshot.activity) apply(act);
        // Pushed state wins: it is strictly newer than the last poll, and it is
        // the only source that ever sees a run shorter than the poll interval.
        for (const act of pushed.values()) apply(act);

        return { states: s, captions: c };
    }, [agents, snapshot, pushed, agentMap]);

    const busy = [...states.values()].filter((v) => v === "working" || v === "thinking").length;
    const selectedAgent = selected ? agentMap.get(selected) : null;

    if (agents.length === 0) {
        return (
            <div className="rounded-xl border border-pulse-border bg-pulse-panel p-12 text-center">
                <p className="text-sm text-pulse-text-soft">No agents yet — the office is empty.</p>
                <Link href="/dashboard/agents" className="mt-3 inline-block text-sm font-medium text-pulse-accent hover:underline">
                    Hire your first agent →
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
                {/* Say which mode we're actually in rather than implying live. */}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-pulse-border-subtle bg-pulse-panel px-2.5 py-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : reachable ? "bg-amber-500" : "bg-red-500"}`} />
                    <span className="text-pulse-muted">
                        {live ? "Live" : reachable ? "Polling" : "Reconnecting…"}
                    </span>
                </span>
                <span className="text-pulse-muted">
                    <strong className="text-pulse-text">{busy}</strong> working now
                </span>
                {/* Split on purpose: a recurring inbox poll is not work you asked
                    for, and lumping them together makes a quiet day look busy. */}
                <span className="text-pulse-muted">
                    <strong className="text-pulse-text">{snapshot.today.asked}</strong> you asked for
                    <span className="text-pulse-faint"> · 24h</span>
                </span>
                <span className="text-pulse-muted" title="Cron jobs, heartbeats, standing orders and follow-ups the agents run on their own">
                    <strong className="text-pulse-text">{snapshot.today.scheduled}</strong> on their own
                </span>
                {/* The number that makes an AI workforce legible: not how often it
                    ran, but how much work it actually did. */}
                <span className="text-pulse-muted" title="Time your agents actually spent working in the last 24h">
                    <strong className="text-pulse-text">{formatHours(snapshot.today.hoursWorked)}</strong> worked
                </span>
                {layout.overflow && (
                    <span className="text-pulse-faint">
                        Showing {layout.desks.length} of {agents.length} desks
                    </span>
                )}
            </div>

            {/* Routine automation stays silent while it works. When it stops
                working, that is exactly what you need to be told. */}
            {snapshot.alerts.failedJobs.length > 0 && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                    <p className="text-sm font-medium text-red-400">
                        {snapshot.alerts.failedJobs.length === 1
                            ? "A scheduled job failed"
                            : `${snapshot.alerts.failedJobs.length} scheduled jobs failed`}
                        {" "}in the last 24h
                    </p>
                    <ul className="mt-1 space-y-0.5">
                        {snapshot.alerts.failedJobs.slice(0, 3).map((f, i) => (
                            <li key={`${f.jobName}-${i}`} className="truncate text-xs text-red-400/80">
                                <strong>{f.jobName}</strong> — {f.error}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-pulse-border bg-pulse-bg">
                <FloorSvg
                    layout={layout}
                    agents={agentMap}
                    humans={humans}
                    states={states}
                    captions={captions}
                    flights={flights}
                    onSelectAgent={(id) => setSelected((cur) => (cur === id ? null : id))}
                    selectedAgentId={selected}
                />
            </div>

            {selectedAgent && (
                <div className="rounded-xl border border-pulse-border bg-pulse-panel p-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div>
                            <p className="text-sm font-semibold text-pulse-text">{selectedAgent.name}</p>
                            <p className="text-xs text-pulse-muted">
                                {selectedAgent.title || "Agent"} · {states.get(selectedAgent.id) ?? "idle"}
                            </p>
                        </div>
                        <div className="ml-auto flex gap-2">
                            <Link
                                href={`/dashboard/assistant?agent=${selectedAgent.id}`}
                                className="rounded-lg border border-pulse-border-subtle px-3 py-1.5 text-xs font-medium text-pulse-text-soft hover:bg-pulse-hover"
                            >
                                Open chat
                            </Link>
                            <Link
                                href={`/dashboard/agents/${selectedAgent.id}`}
                                className="rounded-lg border border-pulse-border-subtle px-3 py-1.5 text-xs font-medium text-pulse-text-soft hover:bg-pulse-hover"
                            >
                                Profile
                            </Link>
                        </div>
                    </div>

                    <form
                        className="mt-3 flex gap-2"
                        onSubmit={(e) => { e.preventDefault(); giveWork(selectedAgent.id); }}
                    >
                        <input
                            value={task}
                            onChange={(e) => setTask(e.target.value)}
                            placeholder={`Give ${selectedAgent.name} something to do…`}
                            disabled={!live || sending}
                            className="flex-1 rounded-lg border border-pulse-border-subtle bg-pulse-bg px-3 py-2 text-sm text-pulse-text outline-none placeholder:text-pulse-faint focus:border-pulse-accent disabled:opacity-60"
                        />
                        <button
                            type="submit"
                            disabled={!live || sending || !task.trim()}
                            className="rounded-lg bg-pulse-accent px-4 py-2 text-xs font-semibold text-white hover:bg-pulse-accent-hi disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {sending ? "Sending…" : "Send"}
                        </button>
                    </form>
                    {!live && (
                        <p className="mt-2 text-xs text-pulse-faint">
                            Connecting to the gateway — you can still open the chat above.
                        </p>
                    )}

                    <AgentActivityPanel agentId={selectedAgent.id} agentName={selectedAgent.name} />
                </div>
            )}
        </div>
    );
}
