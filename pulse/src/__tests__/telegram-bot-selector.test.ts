/**
 * Telegram Bot Selector Tests
 *
 * Verifies the pure connection-selection logic used to pick which per-tenant
 * Telegram bot (channel_connections row) should handle an outbound send/edit,
 * or a webhook update with no connectionId in the URL. No DB, no grammY.
 */
import { describe, it, expect } from "vitest";
import { selectConnectionId, type BotCandidate } from "../channels/telegram/bot-selector.js";

describe("selectConnectionId", () => {
    it("returns null when there are no candidates", () => {
        expect(selectConnectionId([], "agent-1")).toBeNull();
    });

    it("returns the only candidate when there is exactly one, regardless of agentProfileId", () => {
        const candidates: BotCandidate[] = [{ id: "conn-1", agentProfileId: "agent-1", isDefault: false }];
        expect(selectConnectionId(candidates, undefined)).toBe("conn-1");
        expect(selectConnectionId(candidates, "agent-2")).toBe("conn-1");
    });

    it("prefers the agent-scoped bot matching the target agent over the default bot", () => {
        const candidates: BotCandidate[] = [
            { id: "default-conn", agentProfileId: "agent-1", isDefault: true },
            { id: "agent-2-conn", agentProfileId: "agent-2", isDefault: false },
        ];
        expect(selectConnectionId(candidates, "agent-2")).toBe("agent-2-conn");
    });

    it("falls back to the default (tenant-wide) bot when no agent-scoped match exists", () => {
        const candidates: BotCandidate[] = [
            { id: "default-conn", agentProfileId: "agent-1", isDefault: true },
            { id: "agent-2-conn", agentProfileId: "agent-2", isDefault: false },
        ];
        expect(selectConnectionId(candidates, "agent-3")).toBe("default-conn");
        expect(selectConnectionId(candidates, undefined)).toBe("default-conn");
    });

    it("falls back to any connection matching agentProfileId when there is no default bot", () => {
        const candidates: BotCandidate[] = [
            { id: "agent-1-conn", agentProfileId: "agent-1", isDefault: false },
            { id: "agent-2-conn", agentProfileId: "agent-2", isDefault: false },
        ];
        expect(selectConnectionId(candidates, "agent-2")).toBe("agent-2-conn");
    });

    it("falls back to the first candidate when nothing matches and there is no default bot", () => {
        const candidates: BotCandidate[] = [
            { id: "agent-1-conn", agentProfileId: "agent-1", isDefault: false },
            { id: "agent-2-conn", agentProfileId: "agent-2", isDefault: false },
        ];
        expect(selectConnectionId(candidates, "agent-3")).toBe("agent-1-conn");
        expect(selectConnectionId(candidates, undefined)).toBe("agent-1-conn");
    });

    it("does not let the default bot's own agentProfileId cause ambiguity with a dedicated agent bot", () => {
        // The default bot happens to be auto-linked to agent-1 (first agent profile
        // at connect time), but agent-1 also has its own dedicated bot — the
        // dedicated bot must win.
        const candidates: BotCandidate[] = [
            { id: "default-conn", agentProfileId: "agent-1", isDefault: true },
            { id: "agent-1-dedicated-conn", agentProfileId: "agent-1", isDefault: false },
        ];
        expect(selectConnectionId(candidates, "agent-1")).toBe("agent-1-dedicated-conn");
    });
});
