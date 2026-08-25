/**
 * In-process event bus for live floor updates.
 *
 * The agent runtime records runs; the WebSocket server broadcasts to browsers.
 * Neither should import the other, so both import this instead. That keeps the
 * dependency graph acyclic and means a floor event is a fire-and-forget emit
 * that can never slow down or break a run.
 *
 * Scope note: this is per-process. With more than one gateway container, each
 * only sees its own runs — which is why the dashboard also polls as a safety
 * net. Making this cross-process is a Redis pub/sub hop (Redis is already a
 * dependency via BullMQ), not a redesign.
 */

import { EventEmitter } from "node:events";

export type FloorEvent =
    | {
        type: "run:start";
        tenantId: string;
        runId: string;
        agentProfileId: string | null;
        trigger: string;
        /** Set when this run was spawned by another run (delegation). */
        parentAgentProfileId?: string | null;
    }
    | {
        type: "run:tool";
        tenantId: string;
        runId: string;
        agentProfileId: string | null;
        /** Raw tool name; the dashboard maps it to a human caption. */
        tool: string;
    }
    | {
        type: "run:end";
        tenantId: string;
        runId: string;
        agentProfileId: string | null;
        status: string;
        durationMs: number;
    };

const bus = new EventEmitter();
// A busy tenant can have many browsers open; the default cap of 10 is too low
// and would print spurious leak warnings.
bus.setMaxListeners(50);

/** Publish a floor event. Never throws — floor liveness must not affect a run. */
export function emitFloorEvent(event: FloorEvent): void {
    try {
        bus.emit("floor", event);
    } catch {
        /* a broken subscriber must never break the run that emitted */
    }
}

export function onFloorEvent(handler: (event: FloorEvent) => void): () => void {
    bus.on("floor", handler);
    return () => bus.off("floor", handler);
}
