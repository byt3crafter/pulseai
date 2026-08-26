import { describe, it, expect, vi } from "vitest";
import { emitChatEvent, onChatEvent, type ChatEvent } from "../utils/chat-bus.js";

const delta = (over: Partial<ChatEvent> = {}): ChatEvent => ({
    type: "chat:delta",
    tenantId: "tenant-1",
    userId: "user-1",
    contactId: "web-tenant-1-agent-1-sess1",
    runId: "run-1",
    agentProfileId: "agent-1",
    content: "hello",
    thinking: "",
    ...(over as any),
});

describe("chat-bus", () => {
    it("delivers events to subscribers", () => {
        const seen: ChatEvent[] = [];
        const off = onChatEvent((e) => seen.push(e));

        emitChatEvent(delta());

        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ type: "chat:delta", userId: "user-1", content: "hello" });
        off();
    });

    it("stops delivering after unsubscribe", () => {
        const seen: ChatEvent[] = [];
        const off = onChatEvent((e) => seen.push(e));
        off();

        emitChatEvent(delta());

        expect(seen).toHaveLength(0);
    });

    /**
     * Chat content is private. The bus itself fans out to every subscriber — the
     * scoping lives in the ws-server relay — so what matters here is that the
     * owning user always travels WITH the event. An event that lost its userId
     * would be relayed to nobody at best, and to the wrong person at worst.
     */
    it("always carries the owning user so the relay can scope it", () => {
        const seen: ChatEvent[] = [];
        const off = onChatEvent((e) => seen.push(e));

        emitChatEvent(delta({ userId: "user-2" } as Partial<ChatEvent>));
        emitChatEvent(delta({ userId: null } as Partial<ChatEvent>));

        expect(seen.map((e) => e.userId)).toEqual(["user-2", null]);
        off();
    });

    it("carries the contact id so a client can match it to a thread", () => {
        const seen: ChatEvent[] = [];
        const off = onChatEvent((e) => seen.push(e));

        emitChatEvent(delta({ contactId: "web-t-a-other" } as Partial<ChatEvent>));

        expect(seen[0].contactId).toBe("web-t-a-other");
        off();
    });

    it("relays the final answer as well as deltas", () => {
        const seen: ChatEvent[] = [];
        const off = onChatEvent((e) => seen.push(e));

        emitChatEvent({
            type: "chat:final",
            tenantId: "tenant-1", userId: "user-1",
            contactId: "web-tenant-1-agent-1-sess1",
            runId: "run-1", agentProfileId: "agent-1",
            content: "done",
        });

        expect(seen[0]).toMatchObject({ type: "chat:final", content: "done" });
        off();
    });

    /** Streaming is decoration; a broken subscriber must never kill the run. */
    it("never throws when a subscriber throws", () => {
        const off = onChatEvent(() => { throw new Error("subscriber exploded"); });

        expect(() => emitChatEvent(delta())).not.toThrow();

        off();
    });

    it("emits with no subscribers attached", () => {
        expect(() => emitChatEvent(delta())).not.toThrow();
    });

    it("fans out to every subscriber", () => {
        const a = vi.fn();
        const b = vi.fn();
        const offA = onChatEvent(a);
        const offB = onChatEvent(b);

        emitChatEvent(delta());

        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        offA(); offB();
    });
});
