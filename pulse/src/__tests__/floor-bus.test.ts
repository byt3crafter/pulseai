import { describe, it, expect, vi } from "vitest";
import { emitFloorEvent, onFloorEvent, type FloorEvent } from "../utils/floor-bus.js";

const runStart: FloorEvent = {
    type: "run:start",
    tenantId: "tenant-1",
    runId: "run-1",
    agentProfileId: "agent-1",
    trigger: "chat",
};

describe("floor-bus", () => {
    it("delivers events to subscribers", () => {
        const seen: FloorEvent[] = [];
        const off = onFloorEvent((e) => seen.push(e));

        emitFloorEvent(runStart);

        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ type: "run:start", tenantId: "tenant-1", agentProfileId: "agent-1" });
        off();
    });

    it("stops delivering after unsubscribe", () => {
        const seen: FloorEvent[] = [];
        const off = onFloorEvent((e) => seen.push(e));
        off();

        emitFloorEvent(runStart);

        expect(seen).toHaveLength(0);
    });

    it("fans out to every subscriber", () => {
        const a = vi.fn();
        const b = vi.fn();
        const offA = onFloorEvent(a);
        const offB = onFloorEvent(b);

        emitFloorEvent(runStart);

        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        offA(); offB();
    });

    /**
     * The whole point of the bus: floor liveness is decoration, and a broken
     * subscriber must never take down the run that emitted the event.
     */
    it("never throws when a subscriber throws", () => {
        const off = onFloorEvent(() => { throw new Error("subscriber exploded"); });

        expect(() => emitFloorEvent(runStart)).not.toThrow();

        off();
    });

    it("emits with no subscribers attached", () => {
        expect(() => emitFloorEvent(runStart)).not.toThrow();
    });
});
