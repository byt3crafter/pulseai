import { describe, it, expect } from "vitest";
import { parseMentions, resolveResponder, type ChannelContext } from "../gateway/channel-service.js";

function ctx(over: Partial<ChannelContext> = {}): ChannelContext {
    const agents = over.agents ?? [
        { agentProfileId: "lead-1", name: "Selina - COO", role: "lead", level: 5 },
        { agentProfileId: "mem-1", name: "Marcus", role: "member", level: 1 },
    ];
    return {
        channel: { id: "c1", name: "Sales", kind: "department", mode: "multi_human", leadAgentId: "lead-1" },
        membership: { role: "member", access: "talk" },
        agents,
        allowedAgentIds: over.allowedAgentIds ?? agents.map((a) => a.agentProfileId),
        ...over,
    } as ChannelContext;
}

describe("parseMentions", () => {
    it("extracts @tokens lowercased", () => {
        expect(parseMentions("hey @Marcus and @selina check this")).toEqual(["marcus", "selina"]);
    });
    it("returns empty when none", () => {
        expect(parseMentions("no mentions here")).toEqual([]);
    });
});

describe("resolveResponder", () => {
    it("defaults to the lead when nothing is @mentioned", () => {
        const r = resolveResponder(ctx(), "what's our pipeline?");
        expect(r?.agentProfileId).toBe("lead-1");
        expect(r?.viaMention).toBe(false);
    });

    it("routes to an @mentioned member by first name", () => {
        const r = resolveResponder(ctx(), "@Marcus can you pull the numbers");
        expect(r?.agentProfileId).toBe("mem-1");
        expect(r?.viaMention).toBe(true);
    });

    it("matches the lead by a loose form of its name", () => {
        const r = resolveResponder(ctx(), "@selina status please");
        expect(r?.agentProfileId).toBe("lead-1");
        expect(r?.viaMention).toBe(true);
    });

    it("respects per-user agent assignment (can't reach a disallowed agent)", () => {
        const c = ctx({ allowedAgentIds: ["mem-1"] }); // user may only talk to Marcus
        const r = resolveResponder(c, "@Selina help"); // mentions the lead they can't use
        expect(r?.agentProfileId).toBe("mem-1"); // falls back to their only allowed agent
    });

    it("returns null when the user has no allowed agent", () => {
        expect(resolveResponder(ctx({ allowedAgentIds: [] }), "hello")).toBeNull();
    });
});
