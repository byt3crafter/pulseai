/**
 * In-process event bus for live chat output.
 *
 * The runtime streams an answer as it is generated; the WebSocket server
 * delivers it to browsers. Neither imports the other, so both import this —
 * same decoupling the run recorder uses for the agent runtime.
 *
 * WHY THIS EXISTS AT ALL: the runtime used to write deltas straight to the one
 * socket that sent the message. Navigate away and back and that socket is gone,
 * so a reconnected browser could never see the rest of its own answer. Routing
 * through a bus means any socket belonging to that user can pick the stream up.
 *
 * PRIVACY — the single most important thing in this file. Chat content is
 * private to the person who asked. Unlike floor events (an agent id and a tool
 * name, harmless to everyone in the tenant), these events MUST only ever reach
 * sockets belonging to `userId`. Relaying them tenant-wide would show one
 * member's conversation to another. Every event therefore carries the owning
 * user, and the relay in ws-server filters on it.
 *
 * Scope note: per-process. With more than one gateway container
 * a browser only hears streams from the one it is connected to; the final answer
 * is always persisted to `messages` regardless, so nothing is ever lost — only
 * the live typing effect degrades.
 */

import { EventEmitter } from "node:events";

interface ChatEventBase {
    tenantId: string;
    /** The human this output belongs to. Null = no relay (nobody to show it to). */
    userId: string | null;
    /** `web-<tenant>-<agent>-<session>` — identifies the thread. */
    contactId: string;
    runId: string | null;
    agentProfileId: string | null;
}

export type ChatEvent =
    | (ChatEventBase & {
        type: "chat:delta";
        /** The answer so far, not just the newest fragment — a client that joins
         *  late needs the whole thing, and these are small. */
        content: string;
        thinking: string;
    })
    | (ChatEventBase & { type: "chat:tool"; label: string })
    | (ChatEventBase & { type: "chat:final"; content: string });

const bus = new EventEmitter();
// One listener per gateway, but browsers are many and Node's default cap of 10
// would print spurious leak warnings if this ever grows.
bus.setMaxListeners(50);

/** Publish chat output. Never throws — a broken subscriber must not kill a run. */
export function emitChatEvent(event: ChatEvent): void {
    try {
        bus.emit("chat", event);
    } catch {
        /* streaming is decoration; the answer is persisted either way */
    }
}

export function onChatEvent(handler: (event: ChatEvent) => void): () => void {
    bus.on("chat", handler);
    return () => bus.off("chat", handler);
}
