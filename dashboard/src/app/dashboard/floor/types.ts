/** Shared shapes between the floor's server action, page and client renderer. */

/**
 * The three baked poses for one agent, as data URLs.
 *
 * Declared here rather than in sprite-png.ts so client components never import
 * (even type-only) from the module that pulls in `node:zlib`.
 */
export interface AgentSprite {
    /** Both hands resting — the idle desk pose. */
    idle: string;
    /** Left hand raised. Alternated with typeB to animate typing. */
    typeA: string;
    /** Right hand raised. */
    typeB: string;
    /** Standing, mid-stride left — alternated with walkB to walk. */
    walkA: string;
    /** Standing, mid-stride right. */
    walkB: string;
}

/**
 * What a desk is doing. Derived only from real rows — never invented.
 * `queued`/`blocked` exist in the schema but the runtime never writes them,
 * so they are deliberately absent here.
 */
export type DeskState =
    | "idle"      // no live run
    | "thinking"  // running, no tool call yet
    | "working"   // running, tools firing
    | "stalled"   // running far longer than any real run should
    | "needs-you" // an approval is waiting on a human
    | "done"      // finished a substantial run just now
    | "failed"    // errored just now
    | "offline";  // agent disabled

export interface FloorAgent {
    id: string;
    name: string;
    title: string | null;
    /** Uploaded avatar, used only in HTML chrome — never inside the SVG. */
    avatar: string | null;
    enabled: boolean;
    sprite: AgentSprite;
}

/**
 * A human on the floor. These are the people who give work — they stand in the
 * management band at the top rather than sitting at a desk.
 */
export interface FloorHuman {
    id: string;
    name: string;
    /** The signed-in user, drawn with a "you" marker. */
    isMe: boolean;
    /** Standing + walking poses, so a human can carry work across the floor. */
    sprite: { stand: string; walkA: string; walkB: string };
}

export interface FloorDepartment {
    id: string;
    name: string;
    agentIds: string[];
    leadAgentId: string | null;
}

/** One live-work event: a slip flying from a source to an agent's desk. */
export interface Handoff {
    id: string;
    /** Where the work came from. */
    from:
        /** A human. `userId` names which one, when it is known. */
        | { kind: "boss"; userId?: string | null }
        | { kind: "agent"; agentId: string }
        | { kind: "schedule" };
    toAgentId: string;
    /** Client-side timestamp; used to skip animating stale events. */
    at: number;
}

export interface FloorActivity {
    agentId: string;
    state: DeskState;
    /** Present-tense description of the current step, e.g. "Searching the web". */
    caption: string | null;
    runId: string | null;
}

export interface FloorSnapshot {
    activity: FloorActivity[];
    handoffs: Handoff[];
    /** Runs that finished today, for the quiet-floor ribbon. */
    /**
     * Work in the last 24h, split by who caused it. Counting a recurring inbox
     * poll the same as something a person asked for makes a quiet day look busy.
     */
    today: {
        /** Triggered by a human — chat, the app, a channel message. */
        asked: number;
        /** The agents' own routine: cron, heartbeats, standing orders, commitments. */
        scheduled: number;
        /** Hours the whole workforce actually spent working in the last 24h. */
        hoursWorked: number;
    };
    /**
     * Scheduled work that FAILED recently.
     *
     * Routine automation is deliberately silent while it succeeds — the whole
     * point of it is that you don't think about it. The moment it stops working
     * you need to know, so failures are the one autonomous thing that surfaces.
     */
    alerts: {
        failedJobs: { agentId: string | null; jobName: string; error: string; at: number }[];
    };
    /** Server clock, so the client never trusts its own for staleness checks. */
    serverNow: number;
}

export interface FloorData {
    agents: FloorAgent[];
    departments: FloorDepartment[];
    unassigned: string[];
    snapshot: FloorSnapshot;
}
