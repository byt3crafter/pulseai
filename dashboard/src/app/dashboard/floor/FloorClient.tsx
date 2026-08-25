"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getFloorState } from "./actions";
import FloorSvg from "./FloorSvg";
import { layoutFloor, type LayoutRoomInput } from "./layout-floor";
import type { DeskState, FloorAgent, FloorDepartment, FloorSnapshot, Handoff } from "./types";

const POLL_MS = 4000;
/** Don't animate work that arrived while the tab was in the background. */
const STALE_MS = 10_000;
/** A blizzard of slips is worse than none — cap what can fly at once. */
const MAX_FLIGHTS = 8;
/** Long enough for the slowest slip plus its landing ring. */
const FLIGHT_LIFE_MS = 1900;

interface Props {
    agents: FloorAgent[];
    departments: FloorDepartment[];
    unassigned: string[];
    initial: FloorSnapshot;
}

export default function FloorClient({ agents, departments, unassigned, initial }: Props) {
    const [snapshot, setSnapshot] = useState<FloorSnapshot>(initial);
    const [flights, setFlights] = useState<Handoff[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [live, setLive] = useState(true);

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
        return layoutFloor(rooms);
    }, [departments, unassigned, agentMap]);

    const refresh = useCallback(async () => {
        try {
            const next = await getFloorState();
            setSnapshot(next);
            setLive(true);

            const fresh = next.handoffs.filter((h) => !seen.current.has(h.id));
            for (const h of next.handoffs) seen.current.add(h.id);
            // Keep the set from growing without bound over a long session.
            if (seen.current.size > 500) {
                seen.current = new Set(next.handoffs.map((h) => h.id));
            }

            const animatable = fresh
                .filter((h) => next.serverNow - h.at < STALE_MS)
                .slice(0, MAX_FLIGHTS);

            if (animatable.length > 0) {
                setFlights((prev) => [...prev, ...animatable].slice(-MAX_FLIGHTS));
                window.setTimeout(() => {
                    setFlights((prev) => prev.filter((f) => !animatable.some((a) => a.id === f.id)));
                }, FLIGHT_LIFE_MS);
            }
        } catch {
            setLive(false);
        }
    }, []);

    useEffect(() => {
        const id = window.setInterval(refresh, POLL_MS);
        return () => window.clearInterval(id);
    }, [refresh]);

    const { states, captions } = useMemo(() => {
        const s = new Map<string, DeskState>();
        const c = new Map<string, string | null>();
        for (const a of agents) s.set(a.id, a.enabled ? "idle" : "offline");
        for (const act of snapshot.activity) {
            // A disabled agent can't be working; don't let a stale row say otherwise.
            if (agentMap.get(act.agentId)?.enabled === false) continue;
            s.set(act.agentId, act.state);
            c.set(act.agentId, act.caption);
        }
        return { states: s, captions: c };
    }, [agents, snapshot, agentMap]);

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
                <span className="inline-flex items-center gap-1.5 rounded-full border border-pulse-border-subtle bg-pulse-panel px-2.5 py-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="text-pulse-muted">{live ? "Polling every 4s" : "Reconnecting…"}</span>
                </span>
                <span className="text-pulse-muted">
                    <strong className="text-pulse-text">{busy}</strong> working now
                </span>
                <span className="text-pulse-muted">
                    <strong className="text-pulse-text">{snapshot.todayCount}</strong> runs in the last 24h
                </span>
                {layout.overflow && (
                    <span className="text-pulse-faint">
                        Showing {layout.desks.length} of {agents.length} desks
                    </span>
                )}
            </div>

            <div className="overflow-hidden rounded-xl border border-pulse-border bg-pulse-bg">
                <FloorSvg
                    layout={layout}
                    agents={agentMap}
                    states={states}
                    captions={captions}
                    flights={flights}
                    onSelectAgent={(id) => setSelected((cur) => (cur === id ? null : id))}
                    selectedAgentId={selected}
                />
            </div>

            {selectedAgent && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-pulse-border bg-pulse-panel p-4">
                    <div>
                        <p className="text-sm font-semibold text-pulse-text">{selectedAgent.name}</p>
                        <p className="text-xs text-pulse-muted">
                            {selectedAgent.title || "Agent"} · {states.get(selectedAgent.id) ?? "idle"}
                        </p>
                    </div>
                    <div className="ml-auto flex gap-2">
                        <Link
                            href={`/dashboard/assistant?agent=${selectedAgent.id}`}
                            className="rounded-lg bg-pulse-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-pulse-accent-hi"
                        >
                            Give work
                        </Link>
                        <Link
                            href={`/dashboard/agents/${selectedAgent.id}`}
                            className="rounded-lg border border-pulse-border-subtle px-3 py-1.5 text-xs font-medium text-pulse-text-soft hover:bg-pulse-hover"
                        >
                            Open profile
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
