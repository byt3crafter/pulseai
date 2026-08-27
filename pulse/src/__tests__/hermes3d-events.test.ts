import { describe, it, expect } from "vitest";
import {
    captionFor,
    floorEventToFrames,
    sessionKeyFor,
    slug,
} from "../gateway/routes/hermes3d.js";
import type { FloorEvent } from "../utils/floor-bus.js";

const who = { slug: "natalie-harrington", name: "Natalie Harrington" };

/**
 * These assertions mirror what the office's normalizeGatewayEvent actually
 * reads. If they are relaxed, the floor silently stops animating — the frames
 * still arrive, they just stop meaning anything.
 */
describe("hermes3d floor -> office frames", () => {
    it("keys the session the way the office does", () => {
        // The office builds `agent:<id>:main`, where id is the /state slug.
        expect(sessionKeyFor(slug("Natalie Harrington"))).toBe("agent:natalie-harrington:main");
    });

    it("turns a started run into a lifecycle start", () => {
        const event: FloorEvent = {
            type: "run:start",
            tenantId: "t1",
            runId: "r1",
            agentProfileId: "a1",
            trigger: "cron",
        };
        const [frame] = floorEventToFrames(event, who) as any[];
        expect(frame.event).toBe("agent");
        expect(frame.payload.stream).toBe("lifecycle");
        expect(frame.payload.data.phase).toBe("start");
        expect(frame.payload.runId).toBe("r1");
        expect(frame.payload.sessionKey).toBe("agent:natalie-harrington:main");
    });

    it("distinguishes a finished run from a failed one", () => {
        const base = { type: "run:end", tenantId: "t1", runId: "r1", agentProfileId: "a1", durationMs: 10 } as const;
        const ok = floorEventToFrames({ ...base, status: "completed" }, who) as any[];
        const bad = floorEventToFrames({ ...base, status: "failed" }, who) as any[];
        expect(ok[0].payload.data.phase).toBe("end");
        expect(bad[0].payload.data.phase).toBe("error");
    });

    it("says what the agent is doing, in words", () => {
        const event: FloorEvent = {
            type: "run:tool",
            tenantId: "t1",
            runId: "r1",
            agentProfileId: "a1",
            tool: "web_search",
        };
        const [frame] = floorEventToFrames(event, who) as any[];
        expect(frame.event).toBe("office.speech");
        expect(frame.payload.agentId).toBe("natalie-harrington");
        expect(frame.payload.text).toBe("searching the web");
    });

    it("never goes silent on a tool it does not know", () => {
        // A newly added tool should look odd on the floor, not invisible.
        expect(captionFor("some_new_tool")).toBe("some new tool");
    });

    it("triggers other than chat are shown — that is the whole point", () => {
        // The office previously only knew about work it started itself; a cron
        // or Telegram run must produce exactly the same frame as a chat one.
        for (const trigger of ["cron", "heartbeat", "commitment", "api"]) {
            const frames = floorEventToFrames(
                { type: "run:start", tenantId: "t1", runId: "r1", agentProfileId: "a1", trigger },
                who
            ) as any[];
            expect(frames).toHaveLength(1);
            expect(frames[0].payload.data.phase).toBe("start");
        }
    });
});
